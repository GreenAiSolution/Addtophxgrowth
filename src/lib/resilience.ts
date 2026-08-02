/**
 * GRACEFUL DEGRADATION — what happens on the day the model is wrong.
 *
 * DIRECTION
 *   A demo assumes the happy path. A system that runs unattended, every day,
 *   against a real business's customers, is mostly a set of answers to the
 *   unhappy ones: the model returns prose where JSON was asked for, an API
 *   times out mid-run, a tool call arrives with a required field missing, or —
 *   worst, because nothing errors — the model is confidently wrong.
 *
 *   None of those may collapse a shift, and none of them may be papered over.
 *   Those are different failures with different fixes:
 *
 *     MALFORMED OUTPUT  → tell the model exactly what was wrong and let it fix
 *                         it. Models repair their own output well when handed
 *                         the validation error; they repair it badly when told
 *                         "invalid, try again".
 *     TRANSIENT ERROR   → back off and retry. Bounded, then escalate.
 *     LOW CONFIDENCE    → do not retry. A second attempt at a judgement the
 *                         employee already doubts produces a more confident
 *                         version of the same doubt. Route it to a person.
 *     NO AUTHORITY      → never retry. It is not a failure, it is the system
 *                         working.
 *
 * THE RULE THAT MATTERS
 *   Escalation is a first-class outcome, not an error path. It has a reason, a
 *   question, and the context a human needs to answer in seconds — because an
 *   escalation that arrives as "the AI needs help" with a stack trace attached
 *   trains people to ignore escalations, and a queue of ignored escalations is
 *   worse than no escalation at all: everybody believes somebody is watching.
 *
 * BLUEPRINTS
 *   Every function here is pure. No database, no model, no clock beyond what is
 *   passed in. `desk.ts` performs what these decide.
 */

import type { z } from "zod";

/** Attempts at a single duty run, including the first. */
export const MAX_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// Getting structure out of an answer
// ---------------------------------------------------------------------------

/**
 * Pull the JSON document out of a reply.
 *
 * Fenced block first, then the outermost brace pair, because a model that has
 * been told "only JSON" still occasionally writes a sentence first, and losing
 * an otherwise perfect run to a leading "Here's the report:" is a bad trade.
 * What is *not* done here is any repair of the JSON itself — no quote fixing,
 * no trailing-comma stripping. Repairing malformed JSON in code means guessing
 * what the model meant, and the model is right there and can be asked.
 */
export function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]?.trim()) return fenced[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) return text.slice(start, end + 1).trim();

  return null;
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * Validate a reply against the contract it was asked for.
 *
 * The error string is written to be sent straight back to the model, so it
 * names the field and the expectation rather than describing the shape of the
 * failure to a developer.
 */
export function validate<T>(text: string, schema: z.ZodType<T>): ParseResult<T> {
  const raw = extractJson(text);
  if (!raw) {
    return {
      ok: false,
      error: "No JSON object found in the reply. The whole reply must be one fenced ```json block and nothing else.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return {
      ok: false,
      error: `The JSON did not parse: ${(e as Error).message}. Return the same report again as valid JSON.`,
    };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 6)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `The JSON parsed but did not match the contract — ${issues}.` };
  }

  return { ok: true, value: result.data };
}

/**
 * What to say to the model after a failed validation.
 *
 * The failed output is quoted back. Without it the model is being asked to fix
 * something it cannot see, since its own previous turn is the thing that was
 * wrong, and it will frequently reproduce the identical mistake.
 */
export function repairPrompt(error: string, previous: string): string {
  return [
    "Your last reply could not be used.",
    "",
    `Problem: ${error}`,
    "",
    "This is what you sent:",
    "---",
    previous.slice(0, 2000),
    "---",
    "",
    "Send the report again, corrected. Only the fenced ```json block, nothing before or after it. Do not call any more tools — the work is done, this is only the report.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// What to do next
// ---------------------------------------------------------------------------

export type Failure =
  /** The reply did not match the contract. The model can fix this. */
  | "INVALID_OUTPUT"
  /** The API errored or timed out. Time might fix this. */
  | "MODEL_ERROR"
  /** A tool call failed in a way the model could work around. */
  | "TOOL_ERROR";

export type NextStep = "retry" | "escalate";

/**
 * Retry, or hand it to a person?
 *
 * Bounded by `MAX_ATTEMPTS` for every failure type. An unbounded retry loop on
 * an unattended cron is not resilience — it is a way to spend a client's month
 * of tokens on a Sunday against a prompt that will never validate.
 */
export function nextStep(failure: Failure, attempt: number): NextStep {
  return attempt >= MAX_ATTEMPTS ? "escalate" : "retry";
}

/** Exponential, and short: a shift has a whole roster behind it waiting. */
export function backoffMs(attempt: number): number {
  return Math.min(8_000, 500 * 2 ** Math.max(0, attempt - 1));
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

export type ConfidenceDecision = "act" | "escalate";

export interface ConfidenceVerdict {
  do: ConfidenceDecision;
  why: string;
}

/**
 * Is this run trustworthy enough to act on?
 *
 * A self-reported confidence is a weak signal and it is treated as one: it can
 * only ever *stop* a run, never authorise anything. Everything an employee
 * proposes is gated regardless of how sure it says it is, so a model claiming
 * 0.99 buys itself nothing. That asymmetry is the reason it is safe to ask.
 *
 * A missing confidence is treated as no confidence. A report that forgot the
 * field is a report that did not think about it.
 */
export function confidenceVerdict(
  confidence: number | null | undefined,
  floor: number,
): ConfidenceVerdict {
  if (confidence == null || !Number.isFinite(confidence)) {
    return { do: "escalate", why: "The run reported no confidence at all." };
  }
  if (confidence < floor) {
    return {
      do: "escalate",
      why: `Confidence ${confidence.toFixed(2)} is below this duty's floor of ${floor.toFixed(2)}.`,
    };
  }
  return { do: "act", why: `Confidence ${confidence.toFixed(2)} clears the floor.` };
}

// ---------------------------------------------------------------------------
// Escalation
// ---------------------------------------------------------------------------

export type EscalationReason =
  | "LOW_CONFIDENCE"
  | "OVER_CEILING"
  | "NO_AUTHORITY"
  | "INVALID_OUTPUT"
  | "MODEL_ERROR"
  | "TOOL_ERROR"
  /** The employee asked for a person itself. The best kind. */
  | "ASKED";

export interface EscalationInput {
  reason: EscalationReason;
  employee: string;
  duty: string;
  /** What the employee was working on when it stopped. */
  subject?: string | null;
  /** The specific thing a human has to decide. */
  question: string;
  /** Why the system stopped rather than proceeding. */
  detail: string;
  /** Facts the human would otherwise have to go and find. */
  facts?: string[];
}

export interface EscalationBrief {
  reason: EscalationReason;
  /** One line for a notification and a list row. */
  title: string;
  /** The whole thing, ready to render. */
  body: string;
  question: string;
}

const REASON_LABEL: Record<EscalationReason, string> = {
  LOW_CONFIDENCE: "Not sure enough to act",
  OVER_CEILING: "Above the ceiling",
  NO_AUTHORITY: "Outside its authority",
  INVALID_OUTPUT: "Could not produce a usable report",
  MODEL_ERROR: "The model was unavailable",
  TOOL_ERROR: "A tool failed",
  ASKED: "Asked for you",
};

/**
 * The escalation, written for the person who has to answer it.
 *
 * It opens with the question. Everything else — who, which duty, what was
 * found — is below it, because the reader is a business owner between jobs and
 * the first line has to be the thing they can act on. An escalation that opens
 * with provenance gets read once and skimmed forever after.
 */
export function escalationBrief(input: EscalationInput): EscalationBrief {
  const title = input.subject
    ? `${REASON_LABEL[input.reason]} — ${input.subject}`
    : `${REASON_LABEL[input.reason]} — ${input.duty}`;

  const body = [
    input.question,
    "",
    `${input.employee} · ${input.duty}`,
    input.detail,
    ...(input.facts?.length ? ["", "What it found:", ...input.facts.map((f) => `• ${f}`)] : []),
  ].join("\n");

  return { reason: input.reason, title, body, question: input.question };
}

export function reasonLabel(reason: EscalationReason): string {
  return REASON_LABEL[reason];
}
