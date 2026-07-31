/**
 * THE SWITCHBOARD — what Patch has to establish, and what it does when it can't.
 *
 * DIRECTION
 *   The Voice Employee promises "inbound calls answered 24/7 in your business's
 *   voice, first ring" and "missed-call text-back within seconds". This file is
 *   the part of that promise which must not depend on a model being up.
 *
 * THE SPLIT
 *   The same one `night-shift.ts` uses, for the same reason. There, the brief's
 *   call list is assembled by a pure function and the model only writes the
 *   narrative summary — so an Anthropic outage costs the prose and never the
 *   list. Here:
 *
 *     The plan decides WHAT must be established. The model decides HOW it is
 *     asked.
 *
 *   `CALL_PLAN` is five facts. `nextStep` is a pure state machine over them.
 *   If the model is down, every `ask` string is speakable verbatim and the call
 *   still ends with a name, a number and a job — which is the entire point of
 *   answering it. A switchboard that goes silent when an API does is worse than
 *   the voicemail it replaced, because the customer waited through the ringing
 *   first.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *   Any vendor. Nothing in this file knows what Twilio is. The route adapts a
 *   provider's payload into `InboundCall` and everything downstream is ours, so
 *   changing carrier is one adapter rather than a rewrite. No vendor has been
 *   chosen yet and the product should not be waiting on that decision.
 *
 * NO MODEL CALL, NO DATABASE, NO CLOCK. Every function takes `now` when it
 * needs one, so the text-back window is testable without waiting for it.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export type CallDirection = "INBOUND" | "OUTBOUND";

export type CallOutcome =
  | "IN_PROGRESS"
  | "QUALIFIED"
  | "BOOKED"
  | "ESTIMATE_REQUESTED"
  | "MESSAGE"
  | "TRANSFERRED"
  | "MISSED"
  | "VOICEMAIL"
  | "FAILED";

/** What a useful call establishes. */
export interface CallFacts {
  name?: string;
  callbackNumber?: string;
  /** What they actually want doing. */
  job?: string;
  /** Where the work is. */
  address?: string;
  /** How soon. */
  urgency?: string;
}

export type FactKey = keyof CallFacts;

export interface CallStep {
  field: FactKey;
  /**
   * Speakable as written. The model rephrases it in the brand voice; when the
   * model is unavailable this is said as-is, so the fallback is a plainer call
   * rather than no call.
   */
  ask: string;
  /** Why the business needs it — shown on the flight deck when it is missing. */
  why: string;
  /**
   * Required facts gate `isQualified`. The optional ones are worth asking for
   * and never worth losing a caller over.
   */
  required: boolean;
}

/**
 * Five facts, in the order a human would actually ask for them.
 *
 * Ordering is not cosmetic. The callback number comes second because it is the
 * one fact that makes every other fact recoverable: a call that drops after
 * question two can still be returned, and a call that drops before it cannot be.
 * Anything that reorders this list should have an argument for why losing that
 * property is worth it.
 */
export const CALL_PLAN: CallStep[] = [
  {
    field: "name",
    ask: "Can I take your name?",
    why: "Nobody can be rung back by a blank.",
    required: true,
  },
  {
    field: "callbackNumber",
    ask: "And the best number to reach you on, in case we get cut off?",
    why: "The one fact that makes a dropped call recoverable.",
    required: true,
  },
  {
    field: "job",
    ask: "What can we help you with?",
    why: "Without it the job cannot be priced or scheduled.",
    required: true,
  },
  {
    field: "address",
    ask: "Whereabouts is the work?",
    why: "Decides whether it is in the service area at all.",
    required: false,
  },
  {
    field: "urgency",
    ask: "How soon do you need it done?",
    why: "Separates today's emergency from next month's plan.",
    required: false,
  },
];

function has(facts: CallFacts, field: FactKey): boolean {
  return Boolean(facts[field]?.trim());
}

/** The next thing to ask, or null when there is nothing left worth asking. */
export function nextStep(facts: CallFacts, plan: CallStep[] = CALL_PLAN): CallStep | null {
  return plan.find((s) => !has(facts, s.field)) ?? null;
}

/** Everything still outstanding, required first. */
export function missing(facts: CallFacts, plan: CallStep[] = CALL_PLAN): CallStep[] {
  return plan
    .filter((s) => !has(facts, s.field))
    .sort((a, b) => Number(b.required) - Number(a.required));
}

/**
 * Enough to act on.
 *
 * Required facts only. A caller who will not give an address still deserves a
 * callback, and a bar that demanded every field would throw away good leads to
 * make a tidier record.
 */
export function isQualified(facts: CallFacts, plan: CallStep[] = CALL_PLAN): boolean {
  return plan.filter((s) => s.required).every((s) => has(facts, s.field));
}

export interface ClassifyInput {
  /** Did anything answer at all? */
  answered: boolean;
  facts: CallFacts;
  /** The caller asked for a price. */
  wantsEstimate?: boolean;
  /** A slot was taken during the call. */
  booked?: boolean;
  /** Handed to a human on the client's side. */
  transferred?: boolean;
  /** The carrier dropped it into voicemail. */
  voicemail?: boolean;
  /** The vendor, the network, or us. */
  failed?: boolean;
}

/**
 * What happened, as one word.
 *
 * Order is the argument. `failed` beats everything because a call we broke must
 * never be filed as a call we handled; `booked` beats `wantsEstimate` because
 * the diary is further down the funnel than the quote; and an unanswered call
 * is MISSED even when the carrier collected some caller id, because the person
 * on the other end experienced no answer and that is whose experience the
 * scoreboard is counting.
 */
export function classifyOutcome(input: ClassifyInput): CallOutcome {
  if (input.failed) return "FAILED";
  if (!input.answered) return input.voicemail ? "VOICEMAIL" : "MISSED";
  if (input.transferred) return "TRANSFERRED";
  if (input.booked) return "BOOKED";
  if (input.wantsEstimate) return "ESTIMATE_REQUESTED";
  if (isQualified(input.facts)) return "QUALIFIED";
  return "MESSAGE";
}

/** Outcomes where nobody reached anybody. What the recovery text exists for. */
export const UNANSWERED: CallOutcome[] = ["MISSED", "VOICEMAIL"];

export function wasUnanswered(outcome: CallOutcome): boolean {
  return UNANSWERED.includes(outcome);
}

/**
 * How stale a missed call may be before the recovery text is worse than silence.
 *
 * The promise is "within seconds". Providers retry status callbacks for hours,
 * and a retry that arrives late must not produce a "sorry we missed you" text
 * to somebody who rang this morning, has already been called back by a human,
 * and is now being told by a robot that they were ignored. Fifteen minutes is
 * generous for a delivery mechanism that is supposed to take seconds.
 */
export const TEXT_BACK_WINDOW_MINUTES = 15;

export interface TextBackCall {
  direction: CallDirection;
  outcome: CallOutcome;
  fromNumber: string;
  /** The tenant's own number, so we never text ourselves. */
  toNumber: string;
  startedAt: Date;
  /** Already sent. Set on the row, not held in memory. */
  textBackSentAt?: Date | null;
}

export type TextBackVerdict = { send: true } | { send: false; why: string };

/**
 * Whether to text somebody back.
 *
 * Every branch returns a reason rather than a bare false, because "no text was
 * sent" is a thing a client will eventually ring up about and "it was outside
 * the fifteen-minute window" is an answer where a shrug is not.
 */
export function shouldTextBack(call: TextBackCall, now: Date): TextBackVerdict {
  if (call.direction !== "INBOUND") {
    // Texting somebody to apologise for a call we placed and they ignored is
    // not a recovery, it is nagging.
    return { send: false, why: "we placed this call, they did not" };
  }
  if (!wasUnanswered(call.outcome)) {
    return { send: false, why: `the call was ${call.outcome.toLowerCase()}, not missed` };
  }
  if (call.textBackSentAt) {
    return { send: false, why: "already sent" };
  }
  const from = normaliseNumber(call.fromNumber);
  if (!from) {
    return { send: false, why: "the caller withheld their number" };
  }
  if (sameNumber(call.fromNumber, call.toNumber)) {
    return { send: false, why: "the call came from the business's own number" };
  }
  const ageMinutes = (now.getTime() - call.startedAt.getTime()) / 60_000;
  if (ageMinutes > TEXT_BACK_WINDOW_MINUTES) {
    return { send: false, why: `the call is ${Math.round(ageMinutes)} minutes old` };
  }
  if (ageMinutes < 0) {
    // A clock skewed into the future is a bug somewhere upstream; sending on it
    // would be acting on data we know is wrong.
    return { send: false, why: "the call is stamped in the future" };
  }
  return { send: true };
}

/**
 * E.164, or null.
 *
 * Null rather than a best guess. Every caller of this treats null as "we do not
 * have a number", which is correct and safe; a mangled number is worse, because
 * it looks like a number and texts a stranger.
 *
 * The +1 default is stated rather than hidden: this platform's clients are
 * Phoenix trades and their callers dial ten digits. An eleven-digit string
 * starting 1, or anything already carrying a +, is left alone.
 */
export function normaliseNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Anonymous / withheld caller id arrives as a word, not a number.
  if (/^(anonymous|unknown|private|restricted|blocked)$/i.test(trimmed)) return null;

  const kept = trimmed.replace(/[^\d+]/g, "");
  if (kept.startsWith("+")) {
    const digits = kept.slice(1).replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  const digits = kept.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  // Anything else is a number from somewhere this default does not cover.
  // Refusing is the honest outcome.
  return null;
}

/** Two numbers are the same phone. Compares normalised, so formatting cannot lie. */
export function sameNumber(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normaliseNumber(a);
  const y = normaliseNumber(b);
  return Boolean(x && y && x === y);
}

/** Digits only, for reading aloud or showing on a card. */
export function formatNumber(raw: string | null | undefined): string {
  const n = normaliseNumber(raw);
  if (!n) return "withheld";
  const d = n.replace(/^\+1/, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return n;
}

// ---------------------------------------------------------------------------
// The provider boundary
// ---------------------------------------------------------------------------

/**
 * A call, as this application understands one. Providers are adapted into this
 * and never leak past it.
 */
export interface InboundCall {
  externalId: string;
  from: string;
  to: string;
  callerName?: string;
  /** Set on status callbacks, absent on the opening request. */
  status?: string;
  durationSeconds?: number;
  recordingUrl?: string;
  transcript?: string;
}

/**
 * Provider call statuses that mean nobody was reached.
 *
 * Named as a set rather than checked inline because this is precisely the list
 * that differs between carriers, and it is the one thing a future adapter has
 * to get right for the missed-call promise to hold.
 */
const UNANSWERED_STATUSES = new Set(["no-answer", "busy", "failed", "canceled", "cancelled"]);

export function outcomeFromProviderStatus(status: string | undefined): CallOutcome | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (UNANSWERED_STATUSES.has(s)) return "MISSED";
  if (s === "voicemail") return "VOICEMAIL";
  if (s === "in-progress" || s === "ringing" || s === "queued") return "IN_PROGRESS";
  return null;
}

/**
 * Verify a signed provider webhook.
 *
 * HMAC-SHA1 over the full URL with the sorted form parameters appended, base64
 * — the scheme Twilio uses and the one most carriers copied. Kept here rather
 * than in the route so it can be tested against a known vector without standing
 * up a server.
 *
 * Compared in constant time, like the intake token, so a signature cannot be
 * probed a byte at a time.
 */
export function signWebhook(authToken: string, url: string, params: Record<string, string>): string {
  const payload =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  return createHmac("sha1", authToken).update(Buffer.from(payload, "utf8")).digest("base64");
}

export function verifyWebhook(
  authToken: string,
  url: string,
  params: Record<string, string>,
  provided: string | null,
): boolean {
  if (!authToken || !provided) return false;
  const expected = signWebhook(authToken, url, params);
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// What the caller actually hears
// ---------------------------------------------------------------------------

export interface GreetingInput {
  businessName: string;
  /** The client's own words, if they wrote any. */
  custom?: string | null;
}

/**
 * The opening line.
 *
 * Falls back to something speakable rather than erroring, because the failure
 * mode of a missing greeting is a caller hearing silence — and this is the one
 * moment in the product where nothing happening is the entire defect.
 */
export function greeting(input: GreetingInput): string {
  const custom = input.custom?.trim();
  if (custom) return custom;
  return `Thanks for calling ${input.businessName}. I can help you right now — what do you need doing?`;
}

export interface TextBackInput {
  businessName: string;
  custom?: string | null;
}

/**
 * The recovery text.
 *
 * Deliberately does not apologise at length or explain itself. It exists to
 * reopen a conversation from a phone the person is already holding, so the
 * shortest thing that invites a reply beats the politest thing that does not.
 */
export function textBackMessage(input: TextBackInput): string {
  const custom = input.custom?.trim();
  if (custom) return custom;
  return `Sorry we missed your call — this is ${input.businessName}. Reply here and we'll sort it now, or we can ring you straight back.`;
}
