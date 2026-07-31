import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { readBody } from "@/lib/telephony";
import { isStopReply } from "@/lib/sms";
import { addDoNotCall } from "@/lib/voice-store";
import { notifyAgency } from "@/lib/notify";

/**
 * INBOUND SMS.
 *
 * Two jobs, and the first one is a legal obligation rather than a feature.
 *
 *   1. STOP. Every text-back this system sends ends with "Reply STOP to opt
 *      out". This is the endpoint that makes that sentence true. A STOP reply
 *      suppresses the number immediately — no queue, no approval, no model —
 *      and the reply confirming it is the last message that number ever gets.
 *
 *   2. Everything else is a customer talking to the business. It reaches a
 *      human, because a missed-call text-back that gets an answer nobody reads
 *      is worse than not sending one: the caller now believes they are in a
 *      conversation.
 *
 * Deliberately does not run a model. A reply to a text-back is a live human
 * expecting a person, and there is no version of this where guessing helps.
 */

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Twilio expects TwiML on a messaging webhook, same as voice. */
function twiml(message?: string) {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</Message></Response>`
    : '<?xml version="1.0" encoding="UTF-8"?><Response/>';
  return new Response(body, { status: 200, headers: { "content-type": "text/xml" } });
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

  const rl = rateLimit(`sms:${clientId}`, { limit: 120, windowMs: 60_000 });
  if (!rl.success) return json({ error: "Rate limit exceeded" }, 429);

  let client: { intakeToken: string | null; businessName: string } | null = null;
  try {
    client = await prisma.clientProfile.findUnique({
      where: { id: clientId },
      select: { intakeToken: true, businessName: true },
    });
  } catch {
    return json({ error: "Unavailable" }, 503);
  }
  if (!client?.intakeToken) return json({ error: "Not found" }, 404);

  const provided = req.headers.get("x-voice-token") ?? url.searchParams.get("token") ?? "";
  if (!provided || !tokenMatches(provided, client.intakeToken)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await readBody(req);
  const from = String(body.From ?? body.from ?? "").trim();
  const text = String(body.Body ?? body.body ?? body.text ?? "").trim();
  const isTwilio = "From" in body || "Body" in body;

  if (!from) return json({ error: "No sender" }, 400);

  if (isStopReply(text)) {
    await addDoNotCall(clientId, from, {
      source: "sms",
      reason: "Replied STOP to a text message",
    });
    // The confirmation is required and is also the last thing they get. Twilio
    // suppresses further messages to a stopped number itself; the row above is
    // what stops *this* system from trying.
    const confirm = `You're unsubscribed from ${client.businessName}. You won't get any more texts from us.`;
    return isTwilio ? twiml(confirm) : json({ ok: true, optedOut: true, reply: confirm });
  }

  // A human is talking. Get it to a human.
  await notifyAgency("CALL_HANDOFF", {
    businessName: client.businessName,
    title: `Text reply from ${from}`,
    detail: text.slice(0, 500),
    lines: [`From: ${from}`],
    path: "/app/voice",
  });

  return isTwilio ? twiml() : json({ ok: true, forwarded: true });
}
