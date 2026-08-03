/**
 * THE EVAL HARNESS — fixtures.
 *
 * WHERE THESE CAME FROM, STATED PLAINLY
 *   Hand-authored. Not captured from the model.
 *
 *   That matters enough to be the first thing in the file, because a directory
 *   called `evals` full of confident-looking numbers invites exactly one
 *   misreading — that CI is measuring how good Claude is at qualifying leads.
 *   It is not. It is measuring whether the deterministic machinery around the
 *   model still behaves: the parsers, the sanitizers, the scorers, and the
 *   instruction blocks that shape what comes back.
 *
 *   `pnpm evals:live` is the half that measures the model, and it writes its
 *   results back here so that anything it catches becomes a permanent CI case.
 *   Until it has been run against a real key, every number in `baselines.json`
 *   describes this repository's own code and nothing else.
 *
 * HEALTHY VERSUS ADVERSARIAL
 *   `HEALTHY_*` is what correct output looks like. The suite runs on these and
 *   the baseline sits near the top of the range, so any drop is a real
 *   regression rather than a fixture that was always failing.
 *
 *   `ADVERSARIAL_*` is what broken output looks like. It is deliberately kept
 *   out of the suite average — mixing it in would produce a baseline like 0.63
 *   that nobody can interpret and that a genuine regression could hide inside.
 *   It is used only by the non-vacuity tests, which assert that each scorer
 *   actually catches the thing it exists to catch. A guardrail nobody has
 *   watched fail is not known to be a guardrail.
 */

import type { Coding } from "@/lib/genome/taxonomy";
import type { Graded } from "./scorers";

// ---------------------------------------------------------------------------
// The lead qualifier — raw replies, to be run through parseScore
// ---------------------------------------------------------------------------

export interface ReplyCase {
  key: string;
  about: string;
  reply: string;
}

export const HEALTHY_QUALIFIER: ReplyCase[] = [
  {
    key: "fenced-json",
    about: "The shape the instruction block asks for.",
    reply: `\`\`\`json
{"score": 88, "tier": "HOT", "reasoning": "Storm damage on a 14-year roof, insurance already engaged, asked for someone this week. Budget implied by claim, authority unclear.", "nextAction": "Senior rep calls before noon; bring the claim-assistance sheet."}
\`\`\``,
  },
  {
    key: "fenced-json-warm",
    about: "Mid-band answer — the common case, not the dramatic one.",
    reply: `\`\`\`json
{"score": 64, "tier": "WARM", "reasoning": "Comparing three quotes for a planned replacement in the spring. Real need, no urgency, price-led.", "nextAction": "Add to the nurture sequence; follow up when the seasonal offer lands."}
\`\`\``,
  },
  {
    key: "fenced-json-disqualified",
    about: "The qualifier must be willing to say no.",
    reply: `\`\`\`json
{"score": 12, "tier": "DISQUALIFIED", "reasoning": "Outside the service area by roughly 200 miles and asking about a commercial flat roof, which this business does not do.", "nextAction": "Send the referral list; do not book a visit."}
\`\`\``,
  },
  {
    key: "unfenced-json",
    about: "Model dropped the fence but kept the object. Must still parse cleanly.",
    reply: `{"score": 71, "tier": "WARM", "reasoning": "Gutter and fascia work after a leak, homeowner is the decision maker, timeline within the month.", "nextAction": "Book an inspection in the next 48 hours."}`,
  },
  {
    key: "json-with-preamble",
    about: "Model added a sentence before the block despite being told not to.",
    reply: `Here is the qualification:

\`\`\`json
{"score": 83, "tier": "HOT", "reasoning": "Active leak, two children in the house, wants somebody today. Urgency is genuine rather than manufactured.", "nextAction": "Emergency slot today; call within the hour."}
\`\`\``,
  },
];

export const ADVERSARIAL_QUALIFIER: ReplyCase[] = [
  {
    key: "incoherent-tier",
    about: "Valid JSON, well-written, and the tier contradicts the score.",
    reply: `\`\`\`json
{"score": 31, "tier": "HOT", "reasoning": "Some interest expressed.", "nextAction": "Call today."}\n\`\`\``,
  },
  {
    key: "prose-only",
    about: "Ignored the instruction entirely. parseScore should salvage a score and nothing else.",
    reply: `This lead looks fairly strong. I'd give it a score of 76 and call it WARM overall — they have a real problem and some budget, but no clear timeline.`,
  },
  {
    key: "empty",
    about: "A truncated or refused response. Must degrade, never throw.",
    reply: "",
  },
  {
    key: "malformed-json",
    about: "Fence opened, object never closed. The loose parse is the safety net.",
    reply: `\`\`\`json
{"score": 55, "tier": "COLD",
\`\`\``,
  },
];

// ---------------------------------------------------------------------------
// The qualifier against ground truth — scores next to what actually happened
// ---------------------------------------------------------------------------

/**
 * A book of closed deals with the score the qualifier gave at the time.
 *
 * Shaped to resemble a competent-but-imperfect qualifier: it ranks well and is
 * somewhat overconfident in the top band, which is the realistic failure and
 * the one `calibration` exists to surface separately from `discrimination`.
 */
export const HEALTHY_OUTCOMES: Graded[] = [
  { score: 94, outcome: "WON" },
  { score: 91, outcome: "WON" },
  { score: 88, outcome: "WON" },
  { score: 86, outcome: "LOST" },
  { score: 84, outcome: "WON" },
  { score: 81, outcome: "WON" },
  { score: 78, outcome: "WON" },
  { score: 74, outcome: "LOST" },
  { score: 71, outcome: "WON" },
  { score: 68, outcome: "LOST" },
  { score: 64, outcome: "WON" },
  { score: 61, outcome: "LOST" },
  { score: 55, outcome: "LOST" },
  { score: 52, outcome: "WON" },
  { score: 47, outcome: "LOST" },
  { score: 43, outcome: "LOST" },
  { score: 38, outcome: "LOST" },
  { score: 31, outcome: "LOST" },
  { score: 24, outcome: "LOST" },
  { score: 12, outcome: "LOST" },
];

/** A qualifier with no opinion. Every scorer except discrimination is blind to this. */
export const ADVERSARIAL_FLAT_OUTCOMES: Graded[] = HEALTHY_OUTCOMES.map((r) => ({
  ...r,
  score: 70,
}));

/** A qualifier that ranks backwards — the failure `memory.ts` calls an inverted ladder. */
export const ADVERSARIAL_INVERTED_OUTCOMES: Graded[] = HEALTHY_OUTCOMES.map((r) => ({
  ...r,
  score: 100 - r.score,
}));

// ---------------------------------------------------------------------------
// The creative coder — raw replies plus a human coding of the same ad
// ---------------------------------------------------------------------------

export interface CoderCase {
  key: string;
  about: string;
  reply: string;
  /** The human coding. This is the ground truth the model is graded against. */
  gold: Coding;
}

export const HEALTHY_CODER: CoderCase[] = [
  {
    key: "storm-damage-question",
    about: "Textbook: question hook, quote offer, review proof, call CTA.",
    reply: `\`\`\`json
{"hook":"question","visual":"before-after","pacing":"immediate","offer":"quote","proof":"review","cta":"call"}
\`\`\``,
    gold: {
      hook: "question",
      visual: "before-after",
      pacing: "immediate",
      offer: "quote",
      proof: "review",
      cta: "call",
    },
  },
  {
    key: "hvac-availability",
    about: "Availability-led offer with a credential, which is easy to confuse with volume.",
    reply: `\`\`\`json
{"hook":"problem","visual":"work","pacing":"immediate","offer":"availability","proof":"credential","cta":"book"}
\`\`\``,
    gold: {
      hook: "problem",
      visual: "work",
      pacing: "immediate",
      offer: "availability",
      proof: "credential",
      cta: "book",
    },
  },
  {
    key: "partial-honest-omission",
    about: "A still image with no transcript. Omitting pacing is correct, not a failure.",
    reply: `\`\`\`json
{"hook":"callout","visual":"text","offer":"discount","proof":"none","cta":"form"}
\`\`\``,
    gold: { hook: "callout", visual: "text", offer: "discount", proof: "none", cta: "form" },
  },
  {
    key: "ugc-testimonial",
    about: "Handheld customer piece — the visual and proof axes both hinge on the same footage.",
    reply: `\`\`\`json
{"hook":"claim","visual":"ugc","pacing":"build","offer":"none","proof":"review","cta":"soft"}
\`\`\``,
    gold: {
      hook: "claim",
      visual: "ugc",
      pacing: "build",
      offer: "none",
      proof: "review",
      cta: "soft",
    },
  },
  {
    key: "one-axis-disagreement",
    about: "Realistic near-miss: everything right except a genuinely ambiguous pacing call.",
    reply: `\`\`\`json
{"hook":"urgency","visual":"operator","pacing":"immediate","offer":"financing","proof":"volume","cta":"message"}
\`\`\``,
    gold: {
      hook: "urgency",
      visual: "operator",
      pacing: "build",
      offer: "financing",
      proof: "volume",
      cta: "message",
    },
  },
];

export const ADVERSARIAL_CODER: CoderCase[] = [
  {
    key: "invented-values",
    about: "Plausible words that are not in the vocabulary. Must be caught, not absorbed.",
    reply: `\`\`\`json
{"hook":"shock","visual":"cinematic","pacing":"immediate","offer":"quote","proof":"review","cta":"call"}
\`\`\``,
    gold: { hook: "question", visual: "work", pacing: "immediate", offer: "quote", proof: "review", cta: "call" },
  },
  {
    key: "invented-axis",
    about: "Coder added an axis nobody asked for.",
    reply: `\`\`\`json
{"hook":"question","tone":"friendly","offer":"quote"}
\`\`\``,
    gold: { hook: "question", offer: "quote" },
  },
  {
    key: "prose-refusal",
    about: "Coded nothing. Costs data points; must never code partially.",
    reply: `I can't determine the hook or the visual style from this description alone.`,
  gold: { hook: "claim", visual: "artifact", offer: "none", proof: "none", cta: "soft" },
  },
];

// ---------------------------------------------------------------------------
// Ad copy — what MUSE-9 ships under a client's name
// ---------------------------------------------------------------------------

export interface CopyCase {
  key: string;
  about: string;
  copy: string;
}

export const HEALTHY_COPY: CopyCase[] = [
  {
    key: "specific-no-numbers",
    about: "Concrete and vivid without inventing a single figure.",
    copy: `Water coming through the ceiling doesn't wait for a quote.\n\nWe carry the tarps in the van, so the first visit stops the damage rather than measuring it. Licensed, insured, and working in Mesa since before the last big monsoon.\n\nCall now — we'll tell you on the phone whether it's an emergency or whether it can wait until Tuesday.`,
  },
  {
    key: "quotes-the-real-fee",
    about: "The parent's real 8% performance fee is a price, not a results claim, and must be allowed.",
    copy: `No retainer, no lock-in. We take a flat 8% of managed spend, and you keep your own ad accounts whatever happens between us.`,
  },
  {
    key: "proof-without-statistics",
    about: "Credential-led proof, which is the honest substitute for a fabricated number.",
    copy: `Factory-certified installers. Manufacturer-backed workmanship warranty. The same crew from teardown to cleanup — no subcontractors on your roof.\n\nBook the inspection; we'll photograph what we find and send it to you either way.`,
  },
  {
    key: "urgency-without-guarantee",
    about: "Seasonal urgency that promises availability rather than an outcome.",
    copy: `Monsoon season books out our calendar by mid-June. We're holding weekday slots through the end of the month.\n\nIf your roof is more than twelve years old, get it looked at before the first storm rather than after it.`,
  },
];

export const ADVERSARIAL_COPY: CopyCase[] = [
  {
    key: "fabricated-percentage",
    about: "The exact thing upgrades.test.ts fails the build over, written by the product instead.",
    copy: `Our clients see a 312% increase in qualified leads within 90 days.`,
  },
  {
    key: "multiple-claim",
    about: "The other banned form — a multiple rather than a percentage.",
    copy: `Get 3x more booked jobs from the same ad budget.`,
  },
  {
    key: "guaranteed-results",
    about: "The legal exposure. The parent guarantees a flight check, never an outcome.",
    copy: `We guarantee results in your first month or you don't pay a cent.`,
  },
  {
    key: "invented-testimonial",
    about: "A quote attributed to a customer the agency has never spoken to.",
    copy: `"They replaced my roof in two days and the price never moved." — Marcy B., Gilbert`,
  },
  {
    key: "subtle-percentage",
    about: "Reads like a modest, credible figure, which is what makes it the dangerous one.",
    copy: `Most homeowners cut their cooling bill by about 22% after the upgrade.`,
  },
];
