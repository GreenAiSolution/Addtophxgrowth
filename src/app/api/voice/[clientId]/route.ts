import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import {
  classifyOutcome,
  greeting,
  outcomeFromProviderStatus,
  verifyWebhook,
  type CallFacts,
} from "@/lib/telephony";
import {
  completeCall,
  leadForCall,
  notifyIfUnresolved,
  recordCall,
  runTextBack,
} from "@/lib/switchboard";

/**
 * The telephony webhook — where a ringing phone becomes a row.
 *
 * SHAPE
 *   Carriers POST form-encoded parameters and expect either a 2xx or a document
 *   telling them what to say. This route speaks that dialect and adapts it into
 *   `InboundCall` immediately; nothing carrier-specific gets past the top of
 *   this file. No vendor has been signed, and the product should not be waiting
 *   on that.
 *
 * TWO SECRETS, TWO QUESTIONS
 *   The per-tenant `voiceToken` in the path decides *whose* call this is. The
 *   account-wide signature decides whether it is *a real call at all*. Neither
 *   answers the other's question, so both are checked — and the signature is
 *   only enforced when an auth token is configured, because a deploy with no
 *   carrier yet must still be able to answer a test call rather than 401 on it.
 *
 * WHY THIS NEVER RETURNS 500
 *   A non-2xx here means the carrier drops the caller or retries the call. The
 *   whole product is "the phone gets answered", so a database wobble must cost
 *   us the record and never the conversation. Everything that can fail is
 *   caught, and the fallback is still a speakable greeting.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Escape for XML. A business called "Bell & Sons" must not break the document. */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * What the carrier is told to say.
 *
 * Deliberately the most boring possible document: speak, then gather. The
 * conversation itself is the model's job on the turn endpoint; this only has to
 * guarantee that somebody hears a human sentence on the first ring even if
 * every other system in the building is down.
 */
function say(text: string, opts: { gather?: boolean } = {}) {
  const body = opts.gather
    ? `<Gather input="speech" speechTimeout="auto" action="turn" method="POST"><Say>${xmlEscape(text)}</Say></Gather><Say>Sorry, I didn't catch that. We'll ring you straight back.</Say>`
    : `<Say>${xmlEscape(text)}</Say>`;
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    status: 200,
    headers: { "content-type": "text/xml; charset=utf-8" },
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

  const rl = rateLimit(`voice:${clientId}`, { limit: 120, windowMs: 60_000 });
  if (!rl.success) return new Response("rate limited", { status: 429 });

  const url = new URL(req.url);
  const raw = await req.text();
  const form = new URLSearchParams(raw);
  const p: Record<string, string> = {};
  form.forEach((v, k) => (p[k] = v));

  const provided = req.headers.get("x-voice-token") ?? url.searchParams.get("token") ?? "";
  if (!provided) return new Response("missing token", { status: 401 });

  const client = await prisma.clientProfile.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      businessName: true,
      voiceToken: true,
      voiceGreeting: true,
      voiceEnabled: true,
    },
  });

  // Same answer for "no such tenant" and "wrong token", so this cannot be used
  // to enumerate client ids.
  if (!client?.voiceToken || !tokenMatches(provided, client.voiceToken)) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!client.voiceEnabled) {
    return new Response("voice is not enabled for this account", { status: 403 });
  }

  // Signature, when there is an account token to check it against. Absent one,
  // a deploy with no carrier can still answer a test call.
  const { env } = await import("@/lib/env");
  const authToken = env.voiceAuthToken;
  if (authToken) {
    const signature =
      req.headers.get("x-twilio-signature") ?? req.headers.get("x-voice-signature");
    // The signed URL is the one the carrier called, token and all.
    if (!verifyWebhook(authToken, req.url, p, signature)) {
      return new Response("bad signature", { status: 401 });
    }
  }

  const externalId = p.CallSid ?? p.callId ?? p.id;
  const from = p.From ?? p.from ?? "";
  const to = p.To ?? p.to ?? "";
  if (!externalId || !from) return new Response("malformed call", { status: 400 });

  const line = greeting({ businessName: client.businessName, custom: client.voiceGreeting });

  try {
    const status = p.CallStatus ?? p.status;
    const mapped = outcomeFromProviderStatus(status);

    // The opening request: log it and answer. Nothing else matters yet.
    if (!status || mapped === "IN_PROGRESS") {
      await recordCall({
        clientId: client.id,
        externalId,
        direction: p.Direction?.startsWith("outbound") ? "OUTBOUND" : "INBOUND",
        from,
        to,
        callerName: p.CallerName ?? null,
      });
      return say(line, { gather: true });
    }

    // A status callback. Close the call out and run the recovery if it is owed.
    const call = await recordCall({
      clientId: client.id,
      externalId,
      direction: p.Direction?.startsWith("outbound") ? "OUTBOUND" : "INBOUND",
      from,
      to,
    });

    const facts: CallFacts = safeFacts(p.facts);
    const answered = mapped === null && status?.toLowerCase() === "completed";
    // `mapped` is non-null only for statuses that already mean something
    // definite, and IN_PROGRESS returned above — so anything left here is a
    // carrier verdict we should take at face value.
    const outcome = mapped ?? classifyOutcome({ answered, facts, failed: !answered });

    await completeCall({
      clientId: client.id,
      externalId,
      outcome,
      facts: facts as Record<string, unknown>,
      transcript: p.TranscriptionText ?? null,
      recordingUrl: p.RecordingUrl ?? null,
      durationSeconds: p.CallDuration ? Number(p.CallDuration) : null,
    });

    // A call that never becomes a lead is a call nobody follows up.
    if (outcome !== "FAILED") {
      await leadForCall(client.id, call.id, facts, from);
    }
    // The decision is shouldTextBack's; this only asks.
    await runTextBack(call.id);
    await notifyIfUnresolved(call.id);

    return new Response("ok", { status: 200 });
  } catch (e) {
    // The caller is mid-ring. Losing the record is survivable; losing the call
    // is the entire defect this product exists to fix.
    console.error("[voice] failed to record call:", e instanceof Error ? e.message : e);
    return say(line, { gather: true });
  }
}

/** Facts arrive as JSON from the turn handler. A malformed blob is no facts. */
function safeFacts(raw: string | undefined): CallFacts {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as CallFacts;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
