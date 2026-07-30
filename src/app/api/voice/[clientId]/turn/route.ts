import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { activePlaybook, activePriceBook, endCall, recordEstimate, saveCallProgress, startCall } from "@/lib/voice-store";
import { runTurn } from "@/lib/voice-runtime";
import { classifyOutcome, type CallPurpose, type CallState, type Turn } from "@/lib/voice";
import { quotePayload } from "@/lib/estimates";

/**
 * THE PHONE LINE.
 *
 * A telephony provider posts one turn of a live call here and gets back what to
 * say. Provider-agnostic on purpose — the body below is the union of what
 * Twilio, Vapi, Retell and Telnyx already send, so wiring one is a URL and a
 * field mapping rather than an integration.
 *
 * WHY THE TOKEN AND NOT A SESSION
 *   Nobody is logged in. A ringing phone has no cookie. So this authenticates
 *   the same way the lead-intake webhook does: the tenant in the path, their
 *   rotatable token in a header, compared in constant time. It is the pattern
 *   already in this codebase for exactly this situation.
 *
 * WHY IT IS SHORT
 *   Every millisecond here is silence on an open line. One database read for the
 *   playbook, one model call, one write. No scoring, no embedding, no
 *   notification — the night shift and the Tuning Lab do that work afterwards,
 *   off the call.
 */

export const runtime = "nodejs";
export const maxDuration = 30;

const Body = z.object({
  /** The provider's own id for this call. Ties turns together across requests. */
  callId: z.string().min(1).max(200),
  provider: z.string().max(40).optional(),
  direction: z.enum(["INBOUND", "OUTBOUND"]).default("INBOUND"),
  purpose: z.enum(["answer", "callback", "estimate", "reminder", "reactivate"]).default("answer"),
  from: z.string().max(60).optional(),
  to: z.string().max(60).optional(),
  /** What the caller just said. Empty or absent on the opening turn. */
  said: z.string().max(4000).default(""),
  /** True when the provider is telling us the line dropped. */
  ended: z.boolean().default(false),
  recordingUrl: z.string().url().max(500).optional(),
});

/**
 * What the operator says when this endpoint cannot do its job. Fixed text, no
 * model, no database — the one sentence that has to work when nothing else does.
 */
const DEGRADED_LINE =
  "I'm sorry — I can't pull your details up this second. Let me get somebody to ring you straight back.";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
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

  const rl = rateLimit(`voice:${clientId}`, { limit: 240, windowMs: 60_000 });
  if (!rl.success) return json({ error: "Rate limit exceeded" }, 429);

  /*
    WHY A FAILURE HERE IS STILL A 200 WITH SOMETHING TO SAY

    Somebody is on the line. A 500 with an empty body means the provider reads
    its own generic failure message at a customer, or drops the call — and then
    retries, because that is what providers do with a 5xx. Neither is better
    than one honest sentence handing them to a person.

    So a storage failure answers the phone: the caller hears a handover, the
    body says `degraded` so the provider's log shows why, and nothing pretends a
    call was recorded that was not.
  */
  let client: { id: string; intakeToken: string | null; businessName: string } | null = null;
  try {
    client = await prisma.clientProfile.findUnique({
      where: { id: clientId },
      select: { id: true, intakeToken: true, businessName: true },
    });
  } catch (e) {
    console.error("[voice] storage unreachable:", e instanceof Error ? e.message : e);
    return json({
      say: DEGRADED_LINE,
      endCall: false,
      transferTo: null,
      reason: "the operator cannot reach its storage, so this call is being handed over",
      degraded: "storage",
    });
  }
  if (!client?.intakeToken) return json({ error: "Not found" }, 404);

  const provided =
    req.headers.get("x-voice-token") ?? new URL(req.url).searchParams.get("token") ?? "";
  if (!provided || !tokenMatches(provided, client.intakeToken)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid input" }, 400);
  const body = parsed.data;

  try {
    return await handleTurn(clientId, client.businessName, body);
  } catch (e) {
    console.error("[voice] turn failed:", e instanceof Error ? e.message : e);
    return json({
      say: DEGRADED_LINE,
      endCall: false,
      transferTo: null,
      reason: "the turn could not be completed",
      degraded: "turn",
    });
  }
}

async function handleTurn(
  clientId: string,
  businessName: string,
  body: z.infer<typeof Body>,
) {
  const [playbook, priceBook] = await Promise.all([
    activePlaybook(clientId),
    activePriceBook(clientId),
  ]);

  const call = await startCall({
    clientId,
    direction: body.direction,
    purpose: body.purpose as CallPurpose,
    fromNumber: body.from,
    toNumber: body.to,
    provider: body.provider,
    providerCallId: `${clientId}:${body.callId}`,
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

  // The line dropped. Close the record with what we have rather than leaving a
  // call open forever — an unclosed call is invisible to the Lab and to Signals.
  if (body.ended) {
    await endCall(call.id, {
      outcome: classifyOutcome(state, { reachedEnd: false }),
      turns: transcript,
      captured,
      recordingUrl: body.recordingUrl,
    });
    return json({ ok: true, ended: true });
  }

  const result = await runTurn({
    playbook: playbook.value,
    priceBook: priceBook.value,
    state,
    transcript,
    callerSaid: body.said,
    context: {
      direction: body.direction,
      purpose: body.purpose as CallPurpose,
    },
  });

  // An estimate produced on this turn is recorded but not sent. The document
  // leaves through the gate, released by a person — `estimate.send` is a
  // money-moving kind and this route deliberately cannot bypass it.
  if (result.estimate?.ok) {
    const est = result.estimate;
    await recordEstimate({
      clientId,
      callId: call.id,
      estimate: est,
      payload: quotePayload(est, {
        name: result.state.captured.caller_name,
        phone: result.state.captured.callback_number ?? body.from,
        address: result.state.captured.job_address,
        description: result.state.captured.job_description,
      }),
      customer: {
        name: result.state.captured.caller_name,
        phone: result.state.captured.callback_number ?? body.from,
        address: result.state.captured.job_address,
        description: result.state.captured.job_description,
      },
    });
  }

  const unanswered = result.events
    .filter((e) => e.startsWith("unanswered:"))
    .map((e) => e.slice("unanswered:".length));
  const unpriced = result.estimate && !result.estimate.ok ? [result.estimate.why] : [];

  if (result.endCall || result.outcome) {
    await endCall(call.id, {
      outcome: result.outcome ?? classifyOutcome(result.state, { reachedEnd: result.endCall }),
      turns: result.transcript,
      captured: result.state.captured,
      handoffReason: result.verdict.do === "handoff" ? result.verdict.why : undefined,
      unansweredQuestions: unanswered,
      unpricedItems: unpriced,
      recordingUrl: body.recordingUrl,
    });
  } else {
    await saveCallProgress(call.id, {
      turns: result.transcript,
      captured: result.state.captured,
      quotedTotalCents: result.estimate?.ok ? result.estimate.totalCents : undefined,
    });
  }

  // A handover is the one thing on this path that cannot wait for the night
  // shift: somebody is on the line, or has just been promised a call back.
  if (result.verdict.do === "handoff") {
    const { notifyAgency } = await import("@/lib/notify");
    await notifyAgency("CALL_HANDOFF", {
      businessName,
      title: result.state.captured.caller_name ?? body.from ?? "a caller",
      detail: result.verdict.why,
      lines: Object.entries(result.state.captured)
        .filter(([k]) => !k.startsWith("__"))
        .map(([k, v]) => `${k}: ${v}`),
      path: "/app/voice",
    });
  }

  return json({
    say: result.say,
    endCall: result.endCall,
    transferTo: result.transferTo ?? null,
    // Echoed so a provider's logs show why, without needing this console open.
    reason: result.verdict.why,
    offline: result.offline,
  });
}
