/**
 * THE CREATIVE GENOME — the vocabulary.
 *
 * DIRECTION
 *   `creative.ts` sells creative as a loop: Write → Test → Watch → Refresh →
 *   Produce, and then it starts again. Every stage of that loop exists in this
 *   codebase except the one that would make it compound. MUSE-9 writes the
 *   same way on day 400 as on day 1, because nothing feeds back into the
 *   writing except one client's own numbers — and one client never has enough
 *   numbers to learn from.
 *
 *   The asset that fixes this is not a better prompt. It is a shared, closed
 *   vocabulary for describing what an ad *is*, so that a thousand ads across a
 *   hundred accounts become one dataset instead of a hundred anecdotes.
 *
 * WHY THE VOCABULARY IS CLOSED
 *   An open vocabulary cannot be pooled. If one creative is coded
 *   "question hook" and another "asks the reader something", they are the same
 *   ad and two rows, and every estimate over them is diluted by exactly the
 *   amount nobody can measure. Free-text tags feel richer and are worth
 *   nothing statistically.
 *
 *   So: fixed axes, fixed values, and a coder that must choose from them. The
 *   cost is that a genuinely new creative device has no home until somebody
 *   adds it here deliberately — which is the correct place to make that
 *   decision, because adding a value invalidates the estimates that were
 *   computed without it.
 *
 * WHY THESE AXES
 *   They split by *where in the funnel they can possibly act*, which is what
 *   makes the estimates interpretable rather than a soup of correlations:
 *
 *     HOOK, VISUAL, PACING     can only affect whether somebody stops and
 *                              clicks. They are scored against click-through.
 *     OFFER, PROOF, CTA        can only affect whether a click becomes a
 *                              lead. They are scored against click→lead.
 *
 *   An axis scored against the wrong stage produces a real-looking number that
 *   means nothing, so `STAGE_OF` is enforced rather than documented.
 *
 * WHAT THIS IS NOT
 *   Not a style guide, and not a claim that any value is better than another.
 *   This file only says what can be described. `pool.ts` says what the numbers
 *   support, and it is deliberately unable to say anything at all until enough
 *   independent accounts have run the same device.
 */

/** The funnel stage an axis is allowed to be measured against. */
export type Stage = "CLICK" | "LEAD";

export interface Axis {
  key: string;
  label: string;
  /** What a coder is deciding when it picks a value on this axis. */
  question: string;
  stage: Stage;
  values: { key: string; label: string; tell: string }[];
}

/**
 * The axes. Order is display order; nothing computational depends on it.
 *
 * Every value carries a `tell` — the observable feature that decides it — so
 * that two coders (or a coder and a human auditor) reach the same answer. A
 * value whose tell is a matter of taste is a value that will be coded
 * inconsistently and will therefore never accumulate enough agreement to
 * produce an estimate.
 */
export const AXES: Axis[] = [
  {
    key: "hook",
    label: "Hook",
    question: "What does the first line do to make someone stop?",
    stage: "CLICK",
    values: [
      { key: "question", label: "Question", tell: "Opens by asking the reader something." },
      { key: "problem", label: "Problem named", tell: "Opens by naming a symptom the reader has." },
      { key: "callout", label: "Audience callout", tell: "Opens by naming who it is for — a trade, a place, a situation." },
      { key: "claim", label: "Direct claim", tell: "Opens with a flat statement of what is on offer." },
      { key: "curiosity", label: "Curiosity gap", tell: "Opens with something deliberately incomplete." },
      { key: "urgency", label: "Urgency", tell: "Opens with a deadline, a season, or a closing window." },
    ],
  },
  {
    key: "visual",
    label: "Visual archetype",
    question: "What is the viewer actually looking at?",
    stage: "CLICK",
    values: [
      { key: "before-after", label: "Before / after", tell: "Two states of the same subject, shown together." },
      { key: "operator", label: "Person to camera", tell: "A human addressing the viewer directly." },
      { key: "work", label: "Work in progress", tell: "The job being done, no presenter." },
      { key: "artifact", label: "Product or artifact", tell: "The thing itself, isolated." },
      { key: "text", label: "Text-dominant", tell: "Words are the primary visual element." },
      { key: "ugc", label: "UGC / handheld", tell: "Unpolished, phone-shot framing." },
    ],
  },
  {
    key: "pacing",
    label: "Pacing",
    question: "How long before the point arrives?",
    stage: "CLICK",
    values: [
      { key: "immediate", label: "Immediate", tell: "The point lands in the first second or first line." },
      { key: "build", label: "Build", tell: "Context first, point within the first third." },
      { key: "slow", label: "Slow reveal", tell: "The point arrives at or after the midpoint." },
    ],
  },
  {
    key: "offer",
    label: "Offer frame",
    question: "What is the reader being asked to accept?",
    stage: "LEAD",
    values: [
      { key: "quote", label: "Free quote / estimate", tell: "Asks for details in exchange for a price." },
      { key: "inspection", label: "Inspection or audit", tell: "Offers a diagnostic visit or review." },
      { key: "discount", label: "Discount or dollars off", tell: "Leads with a reduction in price." },
      { key: "financing", label: "Financing or payment terms", tell: "Leads with how it is paid for." },
      { key: "availability", label: "Availability", tell: "Leads with speed — today, this week, same day." },
      { key: "guarantee", label: "Guarantee", tell: "Leads with what happens if it goes wrong." },
      { key: "none", label: "No explicit offer", tell: "Brand or awareness; nothing specific asked for." },
    ],
  },
  {
    key: "proof",
    label: "Proof device",
    question: "Why should the reader believe it?",
    stage: "LEAD",
    values: [
      { key: "review", label: "Review or rating", tell: "Quotes a customer or a star rating." },
      { key: "credential", label: "Credential", tell: "Licence, certification, manufacturer status, years in trade." },
      { key: "volume", label: "Volume", tell: "A count of jobs, customers, or years." },
      { key: "named-case", label: "Named case", tell: "A specific identifiable job or customer." },
      { key: "visual-proof", label: "Visual proof", tell: "The evidence is the image itself." },
      { key: "none", label: "No proof offered", tell: "Nothing supports the claim." },
    ],
  },
  {
    key: "cta",
    label: "Call to action",
    question: "What is the reader told to do?",
    stage: "LEAD",
    values: [
      { key: "call", label: "Call", tell: "Asks for a phone call." },
      { key: "form", label: "Form fill", tell: "Asks for details on a page." },
      { key: "book", label: "Book a time", tell: "Asks the reader to choose a slot." },
      { key: "message", label: "Message", tell: "Asks for a DM or text." },
      { key: "soft", label: "Soft / learn more", tell: "Asks only for attention." },
    ],
  },
];

export const AXIS_KEYS = AXES.map((a) => a.key);

/** Which funnel stage an axis may be measured against. */
export const STAGE_OF: Record<string, Stage> = Object.fromEntries(
  AXES.map((a) => [a.key, a.stage]),
);

const VALUES_BY_AXIS = new Map(AXES.map((a) => [a.key, new Set(a.values.map((v) => v.key))]));

export function axisByKey(key: string): Axis | undefined {
  return AXES.find((a) => a.key === key);
}

/** A coded creative. Every axis is optional — an unreadable ad is coded partially, never guessed. */
export type Coding = Partial<Record<string, string>>;

export interface CodingProblem {
  axis: string;
  value: string;
  reason: "unknown-axis" | "unknown-value";
}

/**
 * Pure: strip a coding down to what the vocabulary actually contains, and say
 * what was dropped.
 *
 * This is the boundary a model's output crosses. A coder that invents
 * "hook: shock" must not be able to create a one-row cohort that then reads as
 * a finding — it gets dropped and reported, because a silently discarded axis
 * and a silently invented one look identical downstream.
 */
export function sanitizeCoding(raw: Coding): { coding: Coding; problems: CodingProblem[] } {
  const coding: Coding = {};
  const problems: CodingProblem[] = [];

  for (const [axis, value] of Object.entries(raw)) {
    if (value == null || value === "") continue;
    const allowed = VALUES_BY_AXIS.get(axis);
    if (!allowed) {
      problems.push({ axis, value, reason: "unknown-axis" });
      continue;
    }
    const normalized = String(value).trim().toLowerCase();
    if (!allowed.has(normalized)) {
      problems.push({ axis, value: normalized, reason: "unknown-value" });
      continue;
    }
    coding[axis] = normalized;
  }

  return { coding, problems };
}

/** How much of the vocabulary a coding actually filled in, 0..1. */
export function codingCompleteness(coding: Coding): number {
  const filled = AXIS_KEYS.filter((k) => coding[k] != null).length;
    return AXIS_KEYS.length === 0 ? 0 : filled / AXIS_KEYS.length;
}

/**
 * Agreement between two codings, over the axes both of them attempted.
 *
 * Used two ways: to grade the model coder against a human-coded gold set (see
 * `evals/`), and to decide whether an axis is coded consistently enough to be
 * worth pooling at all. An axis nobody agrees on cannot produce a real
 * estimate no matter how much spend sits behind it.
 */
export function codingAgreement(a: Coding, b: Coding): { agreed: number; compared: number; rate: number } {
  let agreed = 0;
  let compared = 0;
  for (const axis of AXIS_KEYS) {
    const av = a[axis];
    const bv = b[axis];
    if (av == null || bv == null) continue;
    compared += 1;
    if (av === bv) agreed += 1;
  }
  return { agreed, compared, rate: compared === 0 ? 0 : agreed / compared };
}

/**
 * The instruction block handed to the coding model. Generated from the axes so
 * it can never drift from the vocabulary the estimator uses — a coder prompt
 * listing a value that `sanitizeCoding` rejects would silently throw away
 * every ad that used it.
 */
export function coderInstruction(): string {
  const lines: string[] = [
    "You are coding one advertisement against a fixed vocabulary.",
    "Choose exactly one value per axis, using only the keys listed.",
    "If an axis genuinely cannot be determined from what you were given, omit it. Never guess — an omitted axis costs one data point, a guessed one corrupts the estimate for every advertiser.",
    "",
  ];
  for (const axis of AXES) {
    lines.push(`${axis.key} — ${axis.question}`);
    for (const v of axis.values) {
      lines.push(`  ${v.key}: ${v.tell}`);
    }
    lines.push("");
  }
  lines.push(
    'Respond with ONLY a fenced ```json block: { "hook": "...", "visual": "...", "pacing": "...", "offer": "...", "proof": "...", "cta": "..." }',
    "Omit any key you could not determine. No prose before or after the block.",
  );
  return lines.join("\n");
}
