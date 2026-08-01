/**
 * THE EVENT CONTRACT.
 *
 * DIRECTION
 *   "Easily integratable with any business" is not a feature you build once per
 *   tool. It is one stable, documented, signed event stream that somebody else's
 *   system can subscribe to — plus a small number of first-party adapters for
 *   the tools worth doing properly. QuickBooks gets an adapter. Everything else
 *   in the world gets the stream, and Zapier, Make or n8n turn it into whatever
 *   the client already runs.
 *
 * THE RULES THIS FILE ENFORCES
 *   1. Every event has a **type, a version and an id**. A receiver written today
 *      keeps working when we add a field, and knows to look again when the major
 *      version moves.
 *   2. Every event is **idempotent**. The same real-world occurrence always
 *      produces the same `id`, so a receiver that sees it twice — and it will,
 *      because retries exist — can throw the second one away.
 *   3. Nothing sensitive ever leaves. `scrub` runs on the way out, not on the
 *      way to a screen: an event body is the one thing that ends up in somebody
 *      else's database where we cannot delete it.
 *   4. Every request is **signed**. A receiver can prove it came from us and was
 *      not replayed, using the same scheme Stripe uses, which is the one most
 *      integrators have already implemented once.
 *
 * Pure. No database, no network — `event-bus.ts` does the delivering.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Major version of the envelope. Bump only for a breaking change. */
export const EVENT_VERSION = 1;

export type EventType =
  | "call.completed"
  | "call.handoff"
  | "estimate.created"
  | "estimate.sent"
  | "appointment.booked"
  | "lead.received"
  | "contact.opted_out";

/**
 * The catalogue, in the client's language.
 *
 * This is not documentation *about* the code — it is what renders on the
 * connections screen, so a business owner can see exactly what their accountant's
 * software would receive before they connect anything.
 */
export const EVENT_CATALOGUE: {
  type: EventType;
  label: string;
  when: string;
  /** The fields a receiver can rely on. Adding to this list is safe; removing is not. */
  fields: string[];
}[] = [
  {
    type: "call.completed",
    label: "A call finished",
    when: "Every time the phone operator finishes a call, inbound or outbound.",
    fields: ["callId", "direction", "outcome", "durationSec", "customer", "capturedAnswers", "gradeScore"],
  },
  {
    type: "call.handoff",
    label: "A call needs a person",
    when: "The operator handed a caller to a human, or took a message for one.",
    fields: ["callId", "reason", "customer", "capturedAnswers"],
  },
  {
    type: "estimate.created",
    label: "A job was priced",
    when: "The operator priced a job on a call. Nothing has been sent to the customer yet.",
    fields: ["estimateId", "customer", "job", "total", "low", "high", "confidence", "lines"],
  },
  {
    type: "estimate.sent",
    label: "An estimate was released",
    when: "A named human released the written estimate at the gate. This is the one that means money.",
    fields: ["estimateId", "customer", "job", "total", "lines", "releasedBy"],
  },
  {
    type: "appointment.booked",
    label: "A visit was booked",
    when: "The operator booked a slot on a call and read it back to the customer.",
    fields: ["appointmentId", "at", "minutes", "customer", "job"],
  },
  {
    type: "lead.received",
    label: "A lead arrived",
    when: "A form, ad or webhook dropped a new lead into the system.",
    fields: ["leadId", "source", "customer", "message"],
  },
  {
    type: "contact.opted_out",
    label: "Somebody opted out",
    when: "A customer asked not to be contacted. Suppress them everywhere you hold them.",
    fields: ["phone", "reason", "source"],
  },
];

export interface BusinessEvent {
  /** Stable and idempotent: the same occurrence always produces the same id. */
  id: string;
  type: EventType;
  version: number;
  occurredAt: string;
  /** Which tenant this belongs to. Present so one endpoint can serve many. */
  clientId: string;
  businessName?: string;
  data: Record<string, unknown>;
}

/**
 * Build one event.
 *
 * `key` is the caller's idempotency handle — a call id, an estimate id. It is
 * hashed with the type so two different events about the same row never collide.
 */
export function buildEvent(input: {
  type: EventType;
  clientId: string;
  key: string;
  data: Record<string, unknown>;
  businessName?: string;
  at?: Date;
}): BusinessEvent {
  return {
    id: `evt_${hash(`${input.type}:${input.clientId}:${input.key}`).slice(0, 24)}`,
    type: input.type,
    version: EVENT_VERSION,
    occurredAt: (input.at ?? new Date()).toISOString(),
    clientId: input.clientId,
    ...(input.businessName ? { businessName: input.businessName } : {}),
    data: scrub(input.data) as Record<string, unknown>,
  };
}

function hash(s: string): string {
  return createHmac("sha256", "phx-event-id").update(s).digest("hex");
}

/**
 * What never leaves the building.
 *
 * Card and bank numbers, anything that looks like a secret, and any key a
 * caller could have spoken into a transcript. Recursive, because payloads
 * nest — and applied at the envelope, so no individual caller can forget.
 */
const SENSITIVE_KEY = /(token|secret|password|apikey|api_key|authorization|card|cvv|ssn|iban|account_?number|routing)/i;

export function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[too deep]";
  if (typeof value === "string") {
    return value
      .replace(/\b(?:\d[ -]?){12,18}\d\b/g, "[redacted]")
      .replace(/\b\d{3}[ -]?\d{2}[ -]?\d{4}\b/g, "[redacted]");
  }
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // A key called "internal_note" is fine; a key called "card_number" is not,
      // whatever it happens to contain today.
      out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : scrub(v, depth + 1);
    }
    return out;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

/**
 * `t=<unix>,v1=<hmac>` over `${timestamp}.${body}`.
 *
 * Deliberately Stripe's scheme rather than a bespoke one. Every integrator has
 * verified a Stripe webhook at some point, and a signature people already know
 * how to check is a signature people actually check.
 */
export function signPayload(secret: string, body: string, at = new Date()): string {
  const ts = Math.floor(at.getTime() / 1000);
  const mac = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  return `t=${ts},v1=${mac}`;
}

/** For anybody receiving from us — and for our own tests. */
export function verifySignature(
  secret: string,
  body: string,
  header: string,
  opts: { toleranceSeconds?: number; now?: Date } = {},
): { ok: true } | { ok: false; why: string } {
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const ts = Number(parts.t);
  const sig = parts.v1;
  if (!ts || !sig) return { ok: false, why: "malformed signature header" };

  const now = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  const tolerance = opts.toleranceSeconds ?? 300;
  if (Math.abs(now - ts) > tolerance) return { ok: false, why: "timestamp outside tolerance" };

  const expected = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, why: "signature mismatch" };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Retries
// ---------------------------------------------------------------------------

/**
 * How long to wait before attempt N.
 *
 * Six attempts across just over 24 hours — immediately, then after a minute,
 * ten minutes, an hour, six hours and seventeen. A receiver down for a deploy
 * loses nothing; one down for good stops being retried before it fills a table.
 * Jitter-free on purpose: a predictable schedule is one a client can be told
 * about ("six times over about a day") and one a test can assert.
 */
export const MAX_ATTEMPTS = 6;
const BACKOFF_SECONDS = [0, 60, 600, 3600, 21600, 61200];

export function nextAttemptAt(attempts: number, from = new Date()): Date | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  return new Date(from.getTime() + BACKOFF_SECONDS[attempts]! * 1000);
}

/**
 * The schedule in words, derived rather than written down.
 *
 * The public reference at /developers prints this. Typing the same list into a
 * docs page by hand is how a docs page starts lying — somebody tunes the array
 * above and the prose keeps promising the old numbers to people building
 * against it.
 */
export function backoffSchedule(): string[] {
  return BACKOFF_SECONDS.map((s) => {
    if (s === 0) return "immediately";
    if (s < 3600) return `${Math.round(s / 60)} min`;
    const hours = Math.round(s / 3600);
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  });
}

/** Roughly how long the whole schedule covers, for a sentence. */
export function retryWindowHours(): number {
  return Math.round(BACKOFF_SECONDS.slice(1).reduce((a, b) => a + b, 0) / 3600);
}

/** Whether a response code is worth trying again. */
export function isRetryable(status: number): boolean {
  // 4xx means the receiver understood and refused — sending it again is rude
  // and pointless. 408 and 429 are the exceptions: both mean "later".
  if (status === 408 || status === 429) return true;
  if (status >= 400 && status < 500) return false;
  return true;
}
