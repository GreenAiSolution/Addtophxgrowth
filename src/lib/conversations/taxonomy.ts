/**
 * CONVERSATION INTELLIGENCE — the vocabulary, and the consent rule.
 *
 * DIRECTION
 *   Ads make the phone ring. The money is lost on the phone. Every system in
 *   this codebase stops at the lead: the Spend Watch measures what it cost to
 *   make the phone ring, the qualifier scores whoever filled the form, and
 *   `memory.ts` learns from outcomes — but only the handful a client
 *   remembers to type in. Between the ring and the typed-in outcome there is a
 *   conversation nobody has ever looked at, and that is where a home-services
 *   business actually loses its month.
 *
 *   Two things come out of looking: the leaks (nobody answered, nobody rang
 *   back, a quote went out and nothing happened) and the reasons (what people
 *   actually object to, in their own words, at volume).
 *
 * WHY CONSENT IS IN THIS FILE AND NOT IN A POLICY DOCUMENT
 *   Call recording law is not uniform. Arizona is one-party consent; several
 *   states this client base sells into are not, and a business calling across
 *   a state line inherits the stricter rule. `legal.ts` already states plainly
 *   that AI output is a draft a human must review; the equivalent here is that
 *   a recording must not enter the system without a recorded basis for having
 *   it.
 *
 *   So `ConsentBasis` is a required field on ingestion rather than a checkbox
 *   in a settings page. A conversation with no basis is refused, not stored
 *   and flagged — the flagged version means the audio is already on our disk,
 *   which is the thing that was supposed to require a basis.
 *
 *   This is not legal advice. It is a deliberately conservative default that a
 *   lawyer can loosen, and the judgement is stated here so it can be found.
 *
 * WHY THE OBJECTION LIST IS CLOSED
 *   Same argument as the creative genome's vocabulary. "Too expensive",
 *   "price", "cost too much" and "said it was pricey" are one objection and
 *   four rows, and every count over them is wrong by an amount nobody can
 *   measure. `memory.ts` normalises free-text objections by lowercasing and
 *   trimming, which merges the first two and none of the rest.
 *
 *   The escape hatch is `other`, which keeps the verbatim phrase. An objection
 *   that keeps landing in `other` is the signal that this list needs a new
 *   entry — and the verbatim text is what tells you which.
 */

/** Why we are permitted to hold this recording or transcript. */
export type ConsentBasis =
  /** Both parties heard the beep or the announcement. Safe everywhere. */
  | "TWO_PARTY_ANNOUNCED"
  /** One-party consent jurisdiction, our side consented. */
  | "ONE_PARTY_JURISDICTION"
  /** The customer wrote to us — SMS, email, web chat. No recording involved. */
  | "INBOUND_WRITTEN"
  /** Explicitly agreed in writing, e.g. in a signed service agreement. */
  | "WRITTEN_AGREEMENT";

export const CONSENT_BASES: { key: ConsentBasis; label: string; note: string }[] = [
  {
    key: "TWO_PARTY_ANNOUNCED",
    label: "Announced to both parties",
    note: "A recording announcement played and the call continued. The only basis that is safe in every state.",
  },
  {
    key: "ONE_PARTY_JURISDICTION",
    label: "One-party consent jurisdiction",
    note: "Both numbers sit in a one-party state. Confirm before relying on this for interstate calls — the stricter state's rule generally governs.",
  },
  {
    key: "INBOUND_WRITTEN",
    label: "Inbound written message",
    note: "SMS, email or chat the customer sent us. Nothing was recorded.",
  },
  {
    key: "WRITTEN_AGREEMENT",
    label: "Agreed in writing",
    note: "Covered by a signed agreement with this customer.",
  },
];

const CONSENT_KEYS = new Set(CONSENT_BASES.map((c) => c.key));

export function isConsentBasis(value: unknown): value is ConsentBasis {
  return typeof value === "string" && CONSENT_KEYS.has(value as ConsentBasis);
}

// ---------------------------------------------------------------------------
// How a conversation ended
// ---------------------------------------------------------------------------

export type CallOutcome =
  | "BOOKED"
  | "QUOTED"
  | "CALLBACK_PROMISED"
  | "NOT_INTERESTED"
  | "WRONG_FIT"
  | "NO_ANSWER"
  | "UNCLEAR";

export const CALL_OUTCOMES: { key: CallOutcome; label: string; tell: string }[] = [
  { key: "BOOKED", label: "Booked", tell: "A specific date or window was agreed." },
  { key: "QUOTED", label: "Quoted", tell: "A price or estimate was given; nothing was booked." },
  {
    key: "CALLBACK_PROMISED",
    label: "Callback promised",
    tell: "One side committed to making contact again, with no date agreed.",
  },
  { key: "NOT_INTERESTED", label: "Not interested", tell: "The customer declined." },
  {
    key: "WRONG_FIT",
    label: "Wrong fit",
    tell: "Outside the service area, or work this business does not do.",
  },
  { key: "NO_ANSWER", label: "No answer", tell: "Nobody picked up, or the call did not connect." },
  { key: "UNCLEAR", label: "Unclear", tell: "The transcript does not support any of the above." },
];

const OUTCOME_KEYS = new Set(CALL_OUTCOMES.map((o) => o.key));

/**
 * Outcomes that mean a human said no, as distinct from nobody having spoken.
 * A `NO_ANSWER` is an operations failure; a `NOT_INTERESTED` is a sales one,
 * and mixing them produces a close-rate that blames the wrong department.
 */
export const CONTACTED_OUTCOMES: CallOutcome[] = [
  "BOOKED",
  "QUOTED",
  "CALLBACK_PROMISED",
  "NOT_INTERESTED",
  "WRONG_FIT",
];

// ---------------------------------------------------------------------------
// Why they said no
// ---------------------------------------------------------------------------

export type ObjectionKey =
  | "price"
  | "timing"
  | "trust"
  | "competitor"
  | "scope"
  | "authority"
  | "availability"
  | "financing"
  | "other";

export const OBJECTIONS: { key: ObjectionKey; label: string; tell: string }[] = [
  { key: "price", label: "Price", tell: "The number itself was the problem." },
  { key: "timing", label: "Timing", tell: "Not now — later, next season, after something else." },
  { key: "trust", label: "Trust", tell: "Doubt about the company, the reviews, or the workmanship." },
  {
    key: "competitor",
    label: "Competitor",
    tell: "Comparing against, or already committed to, somebody else.",
  },
  { key: "scope", label: "Scope", tell: "Wanted something different from what was offered." },
  {
    key: "authority",
    label: "Not the decider",
    tell: "Needs a spouse, partner, landlord or board to agree.",
  },
  {
    key: "availability",
    label: "Our availability",
    tell: "We could not come soon enough.",
  },
  { key: "financing", label: "Payment terms", tell: "Wanted to spread the cost." },
  { key: "other", label: "Other", tell: "None of the above. The verbatim phrase is kept." },
];

const OBJECTION_KEYS = new Set(OBJECTIONS.map((o) => o.key));

export interface Objection {
  key: ObjectionKey;
  /** What they actually said. Required for `other`, useful for all of them. */
  verbatim?: string;
}

export interface ExtractionProblem {
  field: string;
  value: string;
  reason: "unknown-value";
}

export interface Extraction {
  outcome: CallOutcome;
  objections: Objection[];
  /** Cents. Null when no figure was discussed — never zero as a stand-in. */
  quotedCents: number | null;
  /** Did anybody commit to a specific next step? */
  nextStepAgreed: boolean;
  /** One sentence, for a human skimming. */
  summary: string | null;
}

/**
 * Pure: force a model's extraction into the vocabulary.
 *
 * An unknown outcome becomes `UNCLEAR` rather than being dropped, because the
 * conversation definitely had an outcome and pretending the field is absent
 * would let it fall out of every count. An unknown objection is dropped and
 * reported — a count of objections that includes invented categories is worse
 * than a count that is short.
 */
export function sanitizeExtraction(raw: Record<string, unknown>): {
  extraction: Extraction;
  problems: ExtractionProblem[];
} {
  const problems: ExtractionProblem[] = [];

  const rawOutcome = typeof raw.outcome === "string" ? raw.outcome.toUpperCase().trim() : "";
  let outcome: CallOutcome = "UNCLEAR";
  if (OUTCOME_KEYS.has(rawOutcome as CallOutcome)) {
    outcome = rawOutcome as CallOutcome;
  } else if (rawOutcome) {
    problems.push({ field: "outcome", value: rawOutcome, reason: "unknown-value" });
  }

  const objections: Objection[] = [];
  const rawObjections = Array.isArray(raw.objections) ? raw.objections : [];
  for (const item of rawObjections) {
    const record = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    const key = typeof record.key === "string" ? record.key.toLowerCase().trim() : String(item).toLowerCase().trim();
    const verbatim = typeof record.verbatim === "string" ? record.verbatim.slice(0, 400) : undefined;

    if (!OBJECTION_KEYS.has(key as ObjectionKey)) {
      problems.push({ field: "objections", value: key, reason: "unknown-value" });
      continue;
    }
    // Deduplicate — the same objection raised three times in one call is one
    // objection, and counting it three times makes a talkative customer look
    // like a trend.
    if (objections.some((o) => o.key === key)) continue;
    objections.push({ key: key as ObjectionKey, ...(verbatim ? { verbatim } : {}) });
  }

  // A figure is either discussed or it is not. Zero is a real quote in no
  // trade this business serves, so it is treated as absent rather than free.
  const rawQuote = Number(raw.quotedCents);
  const quotedCents = Number.isFinite(rawQuote) && rawQuote > 0 ? Math.round(rawQuote) : null;

  return {
    extraction: {
      outcome,
      objections,
      quotedCents,
      nextStepAgreed: raw.nextStepAgreed === true,
      summary: typeof raw.summary === "string" ? raw.summary.slice(0, 500) : null,
    },
    problems,
  };
}

/**
 * The instruction handed to the extracting model, generated from the
 * vocabulary so a prompt can never offer a value the sanitizer rejects.
 */
export function extractorInstruction(): string {
  const lines = [
    "You are reading one conversation between a home-services business and a potential customer, and recording what happened.",
    "Report only what the transcript supports. Do not infer an outcome from tone, and do not guess a price that was never said.",
    "",
    "outcome — choose exactly one:",
    ...CALL_OUTCOMES.map((o) => `  ${o.key}: ${o.tell}`),
    "",
    "objections — every distinct reason for hesitation the customer raised. Empty array if none. Use `other` only when nothing else fits, and always include the verbatim phrase:",
    ...OBJECTIONS.map((o) => `  ${o.key}: ${o.tell}`),
    "",
    "quotedCents — the price discussed, in cents. Null if no figure was said aloud.",
    "nextStepAgreed — true only if a specific next action was agreed by both sides.",
    "summary — one sentence a busy owner could read.",
    "",
    'Respond with ONLY a fenced ```json block: { "outcome": "...", "objections": [{"key": "...", "verbatim": "..."}], "quotedCents": null, "nextStepAgreed": false, "summary": "..." }',
    "No prose before or after the block.",
  ];
  return lines.join("\n");
}

/**
 * Map an extracted objection back onto the free-text shape `memory.ts`
 * already learns from.
 *
 * Deliberately a translation rather than a schema change. The memory engine
 * has been storing whatever a client typed since it shipped, and rewriting
 * that column would invalidate every objection fact a client has already
 * accumulated and agreed with. New evidence arrives in the old shape; the
 * labels are stable, so the counts merge.
 */
export function objectionToMemoryText(o: Objection): string {
  const label = OBJECTIONS.find((x) => x.key === o.key)?.label ?? o.key;
  return o.key === "other" && o.verbatim ? o.verbatim : label;
}
