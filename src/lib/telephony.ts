/**
 * Twilio I/O — everything in the phone desk that actually touches the wire.
 *
 * DIRECTION
 *   Every webhook here carries the same failure mode `env.ts` already named:
 *   "no transport configured" must never be indistinguishable from "configured
 *   correctly". A voice webhook that isn't signature-checked is worse than a
 *   silently-skipped email, though — an unverified caller could feed fake
 *   speech into a live call and make the AI say anything to a real customer.
 *   So this fails CLOSED: with no `TWILIO_AUTH_TOKEN` set, every inbound
 *   webhook is refused rather than trusted unverified, same posture as
 *   `CRON_SECRET` in gate.ts and night-shift's cron route.
 *
 * BLUEPRINTS
 *   `verifyTwilioSignature` and the TwiML builders are pure string/crypto work
 *   and are tested directly. `originateCall` and `sendSms` are the two places
 *   that make an outbound Twilio API call, and both degrade to a typed
 *   "skipped, not configured" result rather than throwing into a caller that
 *   might be a cron job with no one watching.
 */

import { createHmac } from "node:crypto";
import twilio from "twilio";
import { env } from "@/lib/env";

export function twilioConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

let _client: ReturnType<typeof twilio> | null = null;

function client(): ReturnType<typeof twilio> | null {
  if (!twilioConfigured()) return null;
  if (!_client) {
    _client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
  }
  return _client;
}

/**
 * Twilio's own signature scheme: HMAC-SHA1 of the full webhook URL plus every
 * POST param, sorted and concatenated, base64-encoded, compared to the
 * `X-Twilio-Signature` header. Implemented by hand (rather than
 * `twilio.validateRequest`, which wants a Node http-style params object) so it
 * works cleanly against a parsed `URLSearchParams` from a Next.js Request.
 */
export function verifyTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader) return false;
  const sortedKeys = Object.keys(params).sort();
  const data = sortedKeys.reduce((acc, key) => acc + key + params[key], url);
  const expected = createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
  // Lengths must match for a safe compare; Buffer.compare below is
  // constant-time only when lengths already match.
  if (expected.length !== signatureHeader.length) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.equals(b);
}

/**
 * Verify a Twilio webhook request. Returns the parsed form body on success.
 * Fails closed: no auth token configured = rejected, not trusted.
 */
export async function verifyTwilioWebhook(
  req: Request,
): Promise<{ ok: true; params: Record<string, string> } | { ok: false; reason: string }> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return { ok: false, reason: "TWILIO_AUTH_TOKEN not configured" };

  const raw = await req.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v;

  const signature = req.headers.get("x-twilio-signature");
  // Reconstruct the exact URL Twilio signed. Behind Vercel's proxy the
  // incoming URL is already the public one; env.siteUrl is used only if a
  // reverse proxy stripped it down to a relative path.
  const url = req.url.startsWith("http") ? req.url : `${env.siteUrl}${req.url}`;

  if (!verifyTwilioSignature(authToken, url, params, signature)) {
    return { ok: false, reason: "Invalid Twilio signature" };
  }
  return { ok: true, params };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface GatherTurnOptions {
  say: string;
  gatherActionUrl: string;
  /** Played if the caller says nothing before the gather times out. */
  timeoutSay?: string;
}

/** `<Say>` then `<Gather input="speech">`, looping back to itself on silence. */
export function twimlGatherTurn({ say, gatherActionUrl, timeoutSay }: GatherTurnOptions): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    `<Gather input="speech" speechTimeout="auto" timeout="8" action="${escapeXml(gatherActionUrl)}" method="POST">`,
    `<Say voice="Polly.Joanna">${escapeXml(say)}</Say>`,
    "</Gather>",
    `<Say voice="Polly.Joanna">${escapeXml(timeoutSay ?? "Sorry, I didn't catch that.")}</Say>`,
    `<Redirect method="POST">${escapeXml(gatherActionUrl)}</Redirect>`,
    "</Response>",
  ].join("");
}

/** `<Say>` then `<Dial>` a human, falling back to `<Record>` on no-answer. */
export function twimlTransfer(say: string, forwardingNumber: string, recordFallbackUrl: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    `<Say voice="Polly.Joanna">${escapeXml(say)}</Say>`,
    `<Dial timeout="25" action="${escapeXml(recordFallbackUrl)}">${escapeXml(forwardingNumber)}</Dial>`,
    "</Response>",
  ].join("");
}

/** `<Say>` then `<Record>` a voicemail-style message. */
export function twimlTakeMessage(say: string, recordingStatusUrl: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    `<Say voice="Polly.Joanna">${escapeXml(say)}</Say>`,
    `<Record maxLength="120" playBeep="true" recordingStatusCallback="${escapeXml(recordingStatusUrl)}" />`,
    `<Say voice="Polly.Joanna">Thanks — we've got your message and someone will call you back.</Say>`,
    "</Response>",
  ].join("");
}

/** `<Say>` then `<Hangup>`. */
export function twimlSayAndHangup(say: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    `<Say voice="Polly.Joanna">${escapeXml(say)}</Say>`,
    "<Hangup/>",
    "</Response>",
  ].join("");
}

export function twimlResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { "content-type": "text/xml" } });
}

export type TelephonyResult =
  | { status: "sent"; sid: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

/** Originate an outbound call. Never throws — a cron loop must survive one bad number. */
export async function originateCall(input: {
  to: string;
  from: string;
  twimlUrl: string;
  statusCallbackUrl: string;
}): Promise<TelephonyResult> {
  const c = client();
  if (!c) return { status: "skipped", reason: "Twilio not configured" };
  try {
    const call = await c.calls.create({
      to: input.to,
      from: input.from,
      url: input.twimlUrl,
      statusCallback: input.statusCallbackUrl,
      statusCallbackEvent: ["completed"],
      statusCallbackMethod: "POST",
    });
    return { status: "sent", sid: call.sid };
  } catch (err) {
    console.error("[telephony] originateCall failed:", (err as Error).message);
    return { status: "failed", reason: (err as Error).message };
  }
}

/** Send an SMS (used to deliver a released estimate). Never throws. */
export async function sendSms(input: { to: string; from: string; body: string }): Promise<TelephonyResult> {
  const c = client();
  if (!c) return { status: "skipped", reason: "Twilio not configured" };
  try {
    const msg = await c.messages.create({ to: input.to, from: input.from, body: input.body });
    return { status: "sent", sid: msg.sid };
  } catch (err) {
    console.error("[telephony] sendSms failed:", (err as Error).message);
    return { status: "failed", reason: (err as Error).message };
  }
}
