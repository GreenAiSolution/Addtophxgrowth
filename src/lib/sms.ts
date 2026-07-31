/**
 * SMS — the missed-call text-back, and anything else that has to reach a phone.
 *
 * The catalogue promises a text-back "within seconds" of a missed call. That is
 * the highest-value message this business sends: a caller who reached voicemail
 * is, at that moment, dialling the next number on their list. Seconds is not a
 * figure of speech.
 *
 * NEVER THROWS. Every caller is inside a live call path or a webhook that must
 * not fail because a carrier hiccuped. Failures are returned and logged, in the
 * same posture as `notify.ts` — a silent success would be worse than an outage,
 * because nobody would go looking.
 */

export type SmsStatus = "sent" | "skipped" | "failed";

export interface SmsResult {
  status: SmsStatus;
  reason?: string;
  /** The carrier's id, when there is one. */
  id?: string;
}

/** Which way out is actually open. Surfaced at /api/health. */
export function smsChannel(): { live: boolean; via?: string; hint: string } {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (sid && token && from) {
    return { live: true, via: "TWILIO_ACCOUNT_SID", hint: "" };
  }
  return {
    live: false,
    hint: "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER to send text-backs.",
  };
}

/**
 * Send one message.
 *
 * Talks to Twilio's REST API directly rather than through their SDK: one fetch,
 * no dependency, and nothing to keep in step at build time. The auth is basic,
 * the body is form-encoded, and the whole thing is thirty lines.
 */
export async function sendSms(input: {
  to: string;
  body: string;
  /** Overrides TWILIO_FROM_NUMBER — used when a client has their own number. */
  from?: string;
}): Promise<SmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = input.from ?? process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    console.info(
      `[sms] to ${input.to} skipped — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER to deliver`,
    );
    return { status: "skipped", reason: "no SMS transport configured" };
  }
  if (!input.to?.trim() || !input.body?.trim()) {
    return { status: "skipped", reason: "no recipient or empty message" };
  }

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: input.to, From: from, Body: input.body.slice(0, 1500) }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[sms] to ${input.to} failed: ${res.status} ${detail.slice(0, 200)}`);
      return { status: "failed", reason: `carrier returned ${res.status}` };
    }

    const json = (await res.json().catch(() => ({}))) as { sid?: string };
    console.info(`[sms] to ${input.to} sent`);
    return { status: "sent", id: json.sid };
  } catch (e) {
    console.error("[sms] failed:", e instanceof Error ? e.message : e);
    return { status: "failed", reason: e instanceof Error ? e.message : "unknown" };
  }
}

/**
 * The text-back itself.
 *
 * Pure, so the wording is testable and cannot drift. Three rules learned from
 * every text-back that gets ignored:
 *
 *   - Name the business in the first four words. An unknown number that opens
 *     with "Hi!" is deleted.
 *   - Say why they are getting a text — they rang, we missed it. Without that
 *     it reads as cold outreach to somebody who contacted us thirty seconds ago.
 *   - Ask one question they can answer with a thumb. "What do you need?" gets a
 *     reply; "please call us back at your convenience" does not.
 */
export function textBackMessage(input: {
  businessName: string;
  callerName?: string;
  /** Set when the operator got far enough to know what they wanted. */
  aboutJob?: string;
}): string {
  const who = input.callerName?.trim() ? ` ${input.callerName.trim().split(/\s+/)[0]}` : "";
  const about = input.aboutJob?.trim()
    ? ` about the ${input.aboutJob.trim().toLowerCase().slice(0, 60)}`
    : "";
  return (
    `${input.businessName} here${who ? ` —${who},` : " —"} sorry we missed your call${about}. ` +
    `Reply here and we'll sort it, or we'll ring you straight back. Reply STOP to opt out.`
  );
}

/**
 * "Reply STOP to opt out" is on every message above, and this is what honours
 * it. Detection is a keyword list rather than a model, for the same reason the
 * call path uses one: a model that can decide somebody opted out can decide
 * they did not, and each mistake is a statutory penalty.
 */
const STOP_WORDS = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "remove me"];

export function isStopReply(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[^a-z ]/g, "");
  return STOP_WORDS.includes(t) || STOP_WORDS.some((w) => t === `${w} please`);
}
