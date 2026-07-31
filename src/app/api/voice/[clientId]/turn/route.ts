import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import {
  activePlaybook,
  activePriceBook,
  endCall,
  recordEstimate,
  saveCallProgress,
  startCall,
} from "@/lib/voice-store";
import { runTurn } from "@/lib/voice-runtime";
import { classifyOutcome, type CallPurpose, type CallState, type Turn } from "@/lib/voice";
import { quotePayload } from "@/lib/estimates";
import {
  detectProvider,
  formatReply,
  normalize,
  readBody,
  type Provider,
} from "@/lib/telephony";
import { sendSms, textBackMessage } from "@/lib/sms";
import { env } from "@/lib/env";

/**
 * THE PHONE LINE.
 *
 * A telephony provider posts one turn of a live call here and gets back what to
 * say, in whatever dialect that provider speaks — TwiML for Twilio, JSON for
 * everything else. The translation lives in `telephony.ts`; this route does
 * auth, state and writes, and nothing else.
 *
 * WHY THE TOKEN AND NOT A SESSION
 *   Nobody is logged in. A ringing phone has no cookie. So this authenticates
 *   the way the lead-intake webhook does: tenant in the path, rotatable token in
 *   a header or query string, compared in constant time. Twilio cannot set
 *   headers on a voice webhook, which is why the query string is accepted too.
 *
 * WHY IT IS SHORT
 *   Every millisecond is silence on an open line. Two reads, one model call, one
 *   write. Scoring, embedding and grading happen afterwards, off the call.
 */

export const runtime = "nodejs";
export const maxDuration = 30;

/** The one sentence that has to work when nothing else does. */
const DEGRADED_LINE =
  "I'm sorry — I can't pull your details up this second. Let me get somebody to ring you straight back.";

function reply(
  provider: Provider,
  out: { say: string; endCall: boolean; transferTo?: string | null; continueUrl?: string },
  extra: Record<string, unknown> = {},
) {
  const formatted = formatReply(provider, out);
  // The JSON dialects carry the diagnostic fields; TwiML has nowhere to put
  // them, so they go to the log instead of being silently dropped.
  if (provider === "twilio") {
    if (Object.keys(extra).length) console.info("[voice]", JSON.stringify(extra));
    return new Response(formatted.body, {
      status: 200,
      headers: { "content-type": formatted.contentType },
    });
  }
  return new Response(JSON.stringify({ ...JSON.parse(formatted.body), ...extra }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function tokenMatches(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request, { params }: { params: { clientId: string } }) {
  const { clientId } = params;
  const url = new URL(req.url);
  const body = await readBody(req);
  const provider = detectProvider(url, req.headers.get("content-type") ?? "", body);

  const rl = rateLimit(`voice:${clientId}`, { limit: 240, windowMs: 60_000 });
  if (!rl.success) {
    return reply(provider, { say: DEGRADED_LINE, endCall: false }, { degraded: "rate-limit" });
  }

  /*
    WHY A FAILURE HERE IS STILL A 200 WITH SOMETHING TO SAY

    Somebody is on the line. A 500 makes the provider read its own generic
    failure at a customer, or drop the call — and then retry, because that is
    what providers do with a 5xx. One honest sentence handing them to a person
    beats both.
  */
  let client: { id: string; intakeToken: string | null; businessName: string } | null = null;
  try {
    client = await prisma.clientProfile.findUnique({
      where: { id: clientId },
      select: { id: true, intakeToken: true, businessName: true },
    });
  } catch (e) {
    console.error("[voice] storage unreachable:", e instanceof Error ? e.message : e);
    return reply(provider, { say: DEGRADED_LINE, endCall: false }, { degraded: "storage" });
  }

  // Auth failures are the one case that does not speak: an unauthenticated
  // caller is not a customer, and answering them would let anybody who found
  // the URL run a client's operator on their own dime.
  if (!client?.intakeToken) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }
  const provided =
    req.headers.get("x-voice-token") ?? url.searchParams.get("token") ?? "";
  if (!provided || !tokenMatches(provided, client.intakeToken)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const turn = normalize(provider, body);
  if (!turn) {
    // No call id. Answering would start a fresh conversation on every sentence.
    return new Response(JSON.stringify({ error: "No call id in payload" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const purpose = (url.searchParams.get("purpose") as CallPurpose | null) ?? "answer";
  // Twilio needs to be told where to post the next turn, and the URL has to
  // carry the token and provider through, or turn two arrives unauthenticated.
  const continueUrl = `${env.siteUrl}/api/voice/${clientId}/turn?provider=${provider}&purpose=${purpose}&token=${encodeURIComponent(provided)}`;

  try {
    return await handleTurn({
      clientId,
      businessName: client.businessName,
      provider,
      purpose,
      turn,
      continueUrl,
    });
  } catch (e) {
    console.error("[voice] turn failed:", e instanceof Error ? e.message : e);
    return reply(
      provider,
      { say: DEGRADED_LINE, endCall: false, continueUrl },
      { degraded: "turn" },
    );
  }
}

async function handleTurn(input: {
  clientId: string;
  businessName: string;
  provider: Provider;
  purpose: CallPurpose;
  turn: NonNullable<ReturnType<typeof normalize>>;
  continueUrl: string;
}) {
  const { clientId, provider, turn, continueUrl } = input;

  const [playbook, priceBook] = await Promise.all([
    activePlaybook(clientId),
    activePriceBook(clientId),
  ]);

  const call = await startCall({
    clientId,
    direction: turn.direction,
    purpose: input.purpose,
    fromNumber: turn.from,
    toNumber: turn.to,
    provider,
    providerCallId: `${clientId}:${turn.callId}`,
    playbookVersion: playbook.version,
    priceBookVersion: priceBook.version,
  });

  const transcript = Array.isArray(call.turns) ? (call.turns as unknown as Turn[]) : [];
  const captured = (call.captured as Record<string, string> | null) ?? {};

  const state: CallState = {
    turns: transcript.length,
    captured,
    quoted: call.quotedTotalCents != null,
    booked: call.outcome === "BOOKED",
    escalated: call.handoffReason ? { key: "earlier", action: "TAKE_MESSAGE" } : undefined,
  };

  // The line dropped. Close the record with what we have — an unclosed call is
  // invisible to the Lab and to Signals — and text them back if nobody ever
  // spoke to them.
  if (turn.ended) {
    const outcome = classifyOutcome(state, { reachedEnd: false });
    await endCall(call.id, {
      outcome,
      turns: transcript,
      captured,
      recordingUrl: turn.recordingUrl,
    });
    await maybeTextBack({
      call: { id: call.id, direction: turn.direction, from: turn.from, textBackSentAt: call.textBackSentAt },
      businessName: input.businessName,
      outcome,
      captured,
    });
    return reply(provider, { say: "", endCall: true }, { ok: true, ended: true, outcome });
  }

  const result = await runTurn({
    playbook: playbook.value,
    priceBook: priceBook.value,
    state,
    transcript,
    callerSaid: turn.said,
    context: { direction: turn.direction, purpose: input.purpose },
  });

  // An estimate produced on this turn is recorded but not sent. The document
  // leaves through the gate, released by a person — `estimate.send` moves money
  // and this route deliberately cannot bypass it.
  if (result.estimate?.ok) {
    const est = result.estimate;
    const customer = {
      name: result.state.captured.caller_name,
      phone: result.state.captured.callback_number ?? turn.from,
      address: result.state.captured.job_address,
      description: result.state.captured.job_description,
    };
    await recordEstimate({
      clientId,
      callId: call.id,
      estimate: est,
      payload: quotePayload(est, customer),
      customer,
    });
  }

  const unanswered = result.events
    .filter((e) => e.startsWith("unanswered:"))
    .map((e) => e.slice("unanswered:".length));
  const unpriced = result.estimate && !result.estimate.ok ? [result.estimate.why] : [];

  if (result.endCall || result.outcome) {
    const outcome =
      result.outcome ?? classifyOutcome(result.state, { reachedEnd: result.endCall });
    await endCall(call.id, {
      outcome,
      turns: result.transcript,
      captured: result.state.captured,
      handoffReason: result.verdict.do === "handoff" ? result.verdict.why : undefined,
      unansweredQuestions: unanswered,
      unpricedItems: unpriced,
      recordingUrl: turn.recordingUrl,
    });
  } else {
    await saveCallProgress(call.id, {
      turns: result.transcript,
      captured: result.state.captured,
      quotedTotalCents: result.estimate?.ok ? result.estimate.totalCents : undefined,
    });
  }

  // A handover cannot wait for the night shift: somebody is on the line, or has
  // just been promised a call back.
  if (result.verdict.do === "handoff") {
    const { notifyAgency } = await import("@/lib/notify");
    await notifyAgency("CALL_HANDOFF", {
      businessName: input.businessName,
      title: result.state.captured.caller_name ?? turn.from ?? "a caller",
      detail: result.verdict.why,
      lines: Object.entries(result.state.captured)
        .filter(([k]) => !k.startsWith("__"))
        .map(([k, v]) => `${k}: ${v}`),
      path: "/app/voice",
    });
  }

  return reply(
    provider,
    {
      say: result.say,
      endCall: result.endCall,
      transferTo: result.transferTo ?? null,
      continueUrl,
    },
    { reason: result.verdict.why, offline: result.offline },
  );
}

/**
 * The missed-call text-back.
 *
 * Deliberately NOT gated. The gate holds anything that reaches outside a
 * conversation the customer is having; this is a reply to somebody who rang
 * thirty seconds ago and got nowhere, and the catalogue promises it "within
 * seconds". A five-minute review window would turn the product's fastest
 * feature off.
 *
 * Sent once per call, and never to somebody who spoke to the operator properly
 * — a text saying "sorry we missed you" after a five-minute conversation reads
 * as a system that isn't paying attention.
 */
async function maybeTextBack(input: {
  call: { id: string; direction: string; from?: string; textBackSentAt: Date | null };
  businessName: string;
  outcome: string;
  captured: Record<string, string>;
}): Promise<void> {
  const { call } = input;
  if (call.direction !== "INBOUND") return;
  if (call.textBackSentAt) return;
  if (!call.from) return;
  if (!["ABANDONED", "NOT_A_FIT", "FAILED"].includes(input.outcome)) return;

  const result = await sendSms({
    to: call.from,
    body: textBackMessage({
      businessName: input.businessName,
      callerName: input.captured.caller_name,
      aboutJob: input.captured.job_description,
    }),
  });

  await prisma.voiceCall.update({
    where: { id: call.id },
    data: { textBackSentAt: new Date(), textBackStatus: result.status },
  });

  // A text-back to somebody who then replies STOP has to be honourable, and the
  // reply lands on the SMS webhook rather than here — so the number is recorded
  // as contacted, not as consented.
  if (result.status === "failed") {
    console.error(`[voice] text-back to ${call.from} failed: ${result.reason}`);
  }
}
