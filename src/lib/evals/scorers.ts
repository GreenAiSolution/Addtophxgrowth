/**
 * THE EVAL HARNESS — scorers.
 *
 * DIRECTION
 *   This codebase guards its *copy* obsessively. `upgrades.test.ts` will fail
 *   the build over a single fabricated percentage on the marketing page.
 *   `consistency.test.ts` will fail it if the Terms quote a price the page
 *   does not charge. `verticals.test.ts` will fail it if a pack names a module
 *   that no longer exists.
 *
 *   Nothing guards the model output. The page may not say "3× more leads", and
 *   MUSE-9 may write exactly that into an advertisement that goes out under a
 *   client's name, and no test in this repository has an opinion about it.
 *
 *   That asymmetry is the reason this directory exists. The standard the
 *   marketing page is held to is the standard the product should be held to,
 *   and `noFabricatedStats` below is deliberately the same rule, ported.
 *
 * WHAT A SCORER IS
 *   Pure. Output in, a number in 0..1 and a sentence out. No model, no
 *   database, no clock. A scorer that needs a model to grade is a second
 *   model surface with no test of its own, and grading the grader is a problem
 *   this harness declines to have.
 *
 * WHAT A SCORER IS NOT
 *   Not a similarity check against a reference answer. "Did it say 82 when a
 *   human would have said 85" is noise dressed as rigour — it punishes
 *   disagreement rather than error, and it goes green when the model and the
 *   reference are wrong in the same direction. Where there is ground truth,
 *   these scorers use it (`discrimination`, `calibration`, `agreement`). Where
 *   there is not, they check the properties an answer must have to be safe to
 *   ship (`schemaCompliance`, `noFabricatedStats`, `tierCoherence`).
 */

import { sanitizeCoding, codingAgreement, codingCompleteness, type Coding } from "@/lib/genome/taxonomy";

export interface Score {
  /** 0..1. Higher is better, always — a scorer where low is good is a scorer somebody will misread. */
  score: number;
  /** Why. Shown on failure, so it has to name the offending thing, not restate the rule. */
  detail: string;
}

const ok = (detail = "ok"): Score => ({ score: 1, detail });
const bad = (detail: string): Score => ({ score: 0, detail });

// ---------------------------------------------------------------------------
// Copy honesty — the marketing page's rules, applied to what the product ships
// ---------------------------------------------------------------------------

/**
 * PHX/GROWTH's real performance-fee rates. Quoting a price is not a results
 * claim, so these are the only percentages that may appear. Kept as a literal
 * rather than imported from `upgrades.ts` on purpose: this rule is about what
 * a model may write into an advertisement, and it must not start permitting a
 * new percentage merely because somebody added a pricing tier.
 */
export const ALLOWED_PERCENTAGES = new Set(["8%", "6%", "4%"]);

const MULTIPLE_CLAIM = /\b\d+(\.\d+)?\s?[x×]\s+(more|better|faster|higher|cheaper|return|roi|roas|leads?|sales?)\b/i;
const GUARANTEE_CLAIM = /\b(guarantee[ds]?|guaranteed)\s+(results?|roas|revenue|growth|leads?|sales?)\b/i;
const TESTIMONIAL = /"[^"]{25,}"\s*[—–-]\s*[A-Z][a-z]+/;

/**
 * The single most important scorer here.
 *
 * A fabricated statistic in an advertisement is not a quality problem, it is
 * the client's legal exposure and the agency's. The page this product is sold
 * from carries a section stating plainly that there are no results to show
 * yet; an ad written by the same company claiming "+312% ROAS" is the two
 * halves of one business contradicting each other, and only one of them is
 * currently tested.
 */
export function noFabricatedStats(text: string): Score {
  for (const pct of text.match(/\d+(\.\d+)?\s?%/g) ?? []) {
    const normalized = pct.replace(/\s/g, "");
    if (!ALLOWED_PERCENTAGES.has(normalized)) {
      return bad(`fabricated statistic: "${pct.trim()}"`);
    }
  }
  const multiple = text.match(MULTIPLE_CLAIM);
  if (multiple) return bad(`multiple claim: "${multiple[0].trim()}"`);

  const guarantee = text.match(GUARANTEE_CLAIM);
  if (guarantee) return bad(`guaranteed-results claim: "${guarantee[0].trim()}"`);

  return ok("no invented figures");
}

/** Quoted first-person praise attributed to a name the agency did not collect. */
export function noFakeTestimonial(text: string): Score {
  const m = text.match(TESTIMONIAL);
  return m ? bad(`invented testimonial: ${m[0].trim()}`) : ok("no attributed quotes");
}

// ---------------------------------------------------------------------------
// Structural compliance
// ---------------------------------------------------------------------------

/** Fraction of the required fields the reply actually produced. */
export function schemaCompliance(
  parsed: Record<string, unknown>,
  required: string[],
): Score {
  const missing = required.filter((k) => parsed[k] == null || parsed[k] === "");
  const score = required.length === 0 ? 1 : (required.length - missing.length) / required.length;
  return {
    score,
    detail: missing.length === 0 ? "all fields present" : `missing: ${missing.join(", ")}`,
  };
}

/**
 * A tier that disagrees with its own score.
 *
 * This is the failure that survives every other check: the JSON is valid, the
 * fields are present, the reasoning reads well, and the lead is filed HOT with
 * a score of 31 — so `planBrief` puts it below the fold while the client's
 * dashboard shows it as hot. Two surfaces disagreeing about the same lead is
 * how people stop trusting the whole desk.
 */
export function tierCoherence(parsed: { score: number | null; tier: string | null }): Score {
  const { score, tier } = parsed;
  if (score == null || tier == null) return { score: 1, detail: "not applicable — nothing to contradict" };

  const expected =
    score >= 80 ? "HOT" : score >= 60 ? "WARM" : score >= 40 ? "COLD" : "DISQUALIFIED";

  // One band of slack. The boundaries are a rubric, not a law, and a 79 called
  // HOT is a judgement call; a 31 called HOT is a broken answer.
  const order = ["DISQUALIFIED", "COLD", "WARM", "HOT"];
  const distance = Math.abs(order.indexOf(tier) - order.indexOf(expected));

  if (distance === 0) return ok(`${score} → ${tier}`);
  if (distance === 1) return { score: 0.5, detail: `${score} is borderline for ${tier} (expected ${expected})` };
  return bad(`${score} filed as ${tier}, expected ${expected}`);
}

// ---------------------------------------------------------------------------
// Ground truth — the only scorers that can tell right from merely well-formed
// ---------------------------------------------------------------------------

export interface Graded {
  score: number;
  outcome: "WON" | "LOST";
}

/**
 * AUC: the probability that a randomly chosen won deal was scored above a
 * randomly chosen lost one.
 *
 * This is the qualifier's real metric and the reason none of the other scorers
 * can replace it. A qualifier that gives every lead a 70 has perfect schema
 * compliance, perfect tier coherence, and is worthless — it has no opinion.
 * AUC is 0.5 for that model and 1.0 for one that ranks perfectly, and it is
 * unaffected by the model being uniformly harsh or uniformly generous, which
 * is exactly the calibration drift that would otherwise swamp the signal.
 *
 * Ties are handled by mid-ranks; a model that scores everything identically
 * scores exactly 0.5 rather than accidentally winning.
 */
export function discrimination(rows: Graded[]): Score {
  const pos = rows.filter((r) => r.outcome === "WON");
  const neg = rows.filter((r) => r.outcome === "LOST");
  if (pos.length === 0 || neg.length === 0) {
    return { score: 0.5, detail: "no discrimination measurable — one class is empty" };
  }

  const sorted = [...rows].sort((a, b) => a.score - b.score);
  const ranks = new Map<number, number>();
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].score === sorted[i].score) j += 1;
    const midRank = (i + j) / 2 + 1; // 1-based, averaged over the tied block
    for (let k = i; k <= j; k += 1) ranks.set(k, midRank);
    i = j + 1;
  }

  let rankSum = 0;
  sorted.forEach((r, idx) => {
    if (r.outcome === "WON") rankSum += ranks.get(idx)!;
  });

  const auc = (rankSum - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length);
  return {
    score: Math.max(0, Math.min(1, auc)),
    detail: `AUC ${auc.toFixed(3)} over ${pos.length} won / ${neg.length} lost`,
  };
}

/**
 * Calibration: does a band that closes 40% of the time get scored like it?
 *
 * Separate from discrimination because they fail separately and are fixed
 * differently. A model can rank perfectly and still tell a client that a 90 is
 * nearly certain when 90s close a third of the time — discrimination is
 * blind to that, and it is the number the client actually plans their week
 * around.
 */
export function calibration(rows: Graded[], bands = 4): Score {
  if (rows.length === 0) return { score: 0.5, detail: "nothing to calibrate" };

  let weighted = 0;
  let counted = 0;
  const parts: string[] = [];

  for (let b = 0; b < bands; b += 1) {
    const lo = (b / bands) * 100;
    const hi = ((b + 1) / bands) * 100;
    const inBand = rows.filter((r) => r.score >= lo && (b === bands - 1 ? r.score <= hi : r.score < hi));
    if (inBand.length === 0) continue;

    const actual = inBand.filter((r) => r.outcome === "WON").length / inBand.length;
    const predicted = inBand.reduce((n, r) => n + r.score, 0) / inBand.length / 100;
    weighted += Math.abs(actual - predicted) * inBand.length;
    counted += inBand.length;
    parts.push(`${Math.round(lo)}-${Math.round(hi)}: said ${(predicted * 100).toFixed(0)}%, was ${(actual * 100).toFixed(0)}%`);
  }

  if (counted === 0) return { score: 0.5, detail: "no populated bands" };
  const error = weighted / counted;
  return { score: Math.max(0, 1 - error), detail: parts.join(" · ") };
}

// ---------------------------------------------------------------------------
// The creative coder
// ---------------------------------------------------------------------------

/**
 * Whether the coder stayed inside the vocabulary.
 *
 * Scored on what it *emitted*, not on what survived. A coder emitting six
 * axes of which two are invented is doing something different from one
 * emitting four good ones, and only this scorer can tell them apart — by the
 * time the estimator sees it, both look like four valid axes.
 */
export function vocabularyCompliance(raw: Coding): Score {
  const emitted = Object.entries(raw).filter(([, v]) => v != null && v !== "").length;
  if (emitted === 0) return { score: 1, detail: "coded nothing — nothing to violate" };

  const { problems } = sanitizeCoding(raw);
  const score = (emitted - problems.length) / emitted;
  return {
    score,
    detail:
      problems.length === 0
        ? `${emitted} axes, all in vocabulary`
        : `invented: ${problems.map((p) => `${p.axis}=${p.value}`).join(", ")}`,
  };
}

/** Agreement with a human coding of the same advertisement. */
export function agreement(coding: Coding, gold: Coding): Score {
  const { agreed, compared, rate } = codingAgreement(coding, gold);
  return {
    score: compared === 0 ? 0 : rate,
    detail: compared === 0 ? "no overlapping axes to compare" : `${agreed}/${compared} axes matched`,
  };
}

/**
 * How much of the vocabulary got filled in.
 *
 * Deliberately NOT weighted heavily in the suite. The coder is told to omit
 * rather than guess, so a low completeness score is a coder following its
 * instructions on a hard advertisement — and a harness that punished it would
 * be training exactly the guessing the taxonomy forbids. It is measured
 * because a collapse to zero means something broke, not because higher is
 * better.
 */
export function completeness(coding: Coding): Score {
  const c = codingCompleteness(coding);
  return { score: c, detail: `${Math.round(c * 100)}% of axes coded` };
}

// ---------------------------------------------------------------------------
// The conversation extractor
// ---------------------------------------------------------------------------

/**
 * Did it invent a price?
 *
 * The costliest failure in the whole extraction path, and the reason it gets a
 * scorer of its own rather than being folded into general accuracy. A quoted
 * figure flows straight into `foldIntoMemory`, which hands it to
 * `computeCalibration`, which tells the client what their average won deal is
 * worth. One hallucinated number becomes a fact on a dashboard, and there is
 * no stage between here and there that could catch it.
 *
 * Scored asymmetrically on purpose. Missing a price that was said is a lost
 * data point; reporting one that was never said is a fabrication, and the two
 * are not equally bad.
 */
export function priceFidelity(
  got: number | null,
  expected: number | null,
): Score {
  if (expected == null && got == null) return ok("no figure claimed, none was said");
  if (expected == null && got != null) {
    return bad(`invented a price of ${(got / 100).toFixed(0)} that was never said`);
  }
  if (expected != null && got == null) {
    return { score: 0.5, detail: `missed the quoted figure of ${(expected / 100).toFixed(0)}` };
  }
  if (got === expected) return ok("matched the figure said");
  return bad(`reported ${(got! / 100).toFixed(0)}, the transcript said ${(expected! / 100).toFixed(0)}`);
}

/** Did it reach the same conclusion about what happened as a human reader? */
export function outcomeMatch(got: string, expected: string): Score {
  if (got === expected) return ok(`${got}`);
  // UNCLEAR is the honest answer when the reply was unusable, and is scored
  // above a confident wrong answer for the same reason the coder is told to
  // omit rather than guess.
  if (got === "UNCLEAR") return { score: 0.25, detail: `gave up; a human read it as ${expected}` };
  return bad(`said ${got}, a human read it as ${expected}`);
}

/** Overlap between the objections found and the objections a human found. */
export function objectionMatch(got: string[], expected: string[]): Score {
  if (expected.length === 0 && got.length === 0) return ok("none raised, none reported");
  if (expected.length === 0) return bad(`reported ${got.join(", ")} where a human found none`);

  const found = new Set(got);
  const hits = expected.filter((e) => found.has(e)).length;
  const spurious = got.filter((g) => !expected.includes(g)).length;

  // Jaccard rather than recall: a model that returns every objection in the
  // vocabulary would score perfect recall and be useless.
  const union = new Set([...got, ...expected]).size;
  const score = union === 0 ? 1 : hits / union;

  return {
    score,
    detail:
      spurious > 0
        ? `${hits}/${expected.length} found, ${spurious} spurious`
        : `${hits}/${expected.length} found`,
  };
}
