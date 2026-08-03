/**
 * THE CREATIVE GENOME — the estimator.
 *
 * DIRECTION
 *   The promise is that a hundred accounts learn as one. The danger is that a
 *   hundred accounts *look* like one and are not: they run different budgets in
 *   different trades at different times of year, and the naive version of this
 *   file — pool every impression, compare the average click rate of ads with a
 *   question hook against the average of ads without — would produce a
 *   confident number that is mostly a fact about which accounts happened to
 *   use question hooks.
 *
 *   That number would be worse than nothing, because it would be actioned.
 *
 * THE DESIGN, AND WHY
 *   Two stages, borrowed from meta-analysis rather than invented here.
 *
 *   1. WITHIN EACH ACCOUNT, a contrast. For one attribute value, compare that
 *      account's creatives carrying it against that same account's creatives
 *      not carrying it, over the same window. Everything that makes an account
 *      an account — trade, geography, budget, offer quality, season, landing
 *      page — is held constant, because it is the same account in both arms.
 *      What comes out is a log odds ratio and its variance.
 *
 *   2. ACROSS ACCOUNTS, a random-effects pool. Those contrasts are combined by
 *      DerSimonian-Laird, which estimates how much accounts genuinely differ
 *      from one another (tau squared) on top of how noisy each one is, and
 *      widens the interval accordingly.
 *
 *   Fixed-effect pooling was the alternative and is wrong here: it assumes one
 *   true effect shared by every advertiser, so with enough impressions it
 *   returns a hairline interval around a number no individual account will see.
 *   Advertisers are not replicates of each other. Random effects says so.
 *
 * WHAT IT STILL IS NOT
 *   Stated plainly because the temptation to overclaim on this file is the
 *   whole risk: creatives are not randomly assigned to slots. An operator who
 *   writes question hooks for the hard offers and direct claims for the easy
 *   ones produces a within-account contrast that is still confounded, and no
 *   amount of pooling removes it.
 *
 *   So every result here is an association, `describeEffect` says "associated
 *   with" and never "causes", and the only route to a causal claim is
 *   randomised rotation — which is the allocator, not this file. This is the
 *   best estimate available from observational data and it is labelled as
 *   exactly that.
 *
 * BLUEPRINTS
 *   Every export is pure. No database, no model, no clock. The impure half —
 *   reading creatives and metrics, writing estimates — is `genome.ts`.
 */

import type { Stage } from "./taxonomy";

// ---------------------------------------------------------------------------
// Honesty gates
// ---------------------------------------------------------------------------

/**
 * Below this many independent accounts, there is no cross-account finding —
 * there is one advertiser's habit. Mirrors MIN_EVIDENCE in `memory.ts` and
 * MIN_PRECEDENTS in `recall.ts`: the number is different, the rule is the same.
 */
export const MIN_ACCOUNTS = 4;

/**
 * An account contributes a contrast only if both arms cleared this many
 * trials. Two impressions on one side is not an arm, and its variance term
 * would let it in the door with a wide interval rather than keeping it out.
 */
export const MIN_TRIALS_PER_ARM: Record<Stage, number> = {
  CLICK: 500,
  LEAD: 40,
};

/** Both arms need at least this many successes between them, for the same reason. */
export const MIN_SUCCESSES_TOTAL: Record<Stage, number> = {
  CLICK: 10,
  LEAD: 5,
};

// ---------------------------------------------------------------------------
// Cells and contrasts
// ---------------------------------------------------------------------------

/** One arm of a comparison: successes out of trials. */
export interface Cell {
  successes: number;
  trials: number;
}

export interface Contrast {
  /** Log odds ratio, with-attribute versus without. */
  delta: number;
  /** Variance of `delta`. */
  variance: number;
  /** Whether a zero cell forced the continuity correction. */
  corrected: boolean;
}

function finite(n: number): boolean {
  return Number.isFinite(n);
}

/**
 * Pure: the log odds ratio between two arms, with its variance.
 *
 * Zero cells are handled by the Haldane-Anscombe correction — add 0.5 to every
 * cell — rather than by dropping the contrast. Dropping it is the subtly worse
 * option: a creative device that produced zero leads in one account is real
 * evidence about that device, and silently discarding exactly the arms where
 * something failed hardest biases every pooled estimate upward.
 *
 * The correction is reported rather than hidden, because a pool built mostly
 * from corrected contrasts is thin evidence wearing a normal-looking interval.
 */
export function contrastLogOdds(withAttr: Cell, without: Cell): Contrast | null {
  const a = withAttr.successes;
  const b = withAttr.trials - withAttr.successes;
  const c = without.successes;
  const d = without.trials - without.successes;

  if ([a, b, c, d].some((n) => !finite(n) || n < 0)) return null;

  const needsCorrection = a === 0 || b === 0 || c === 0 || d === 0;
  const k = needsCorrection ? 0.5 : 0;
  const [A, B, C, D] = [a + k, b + k, c + k, d + k];

  if (A <= 0 || B <= 0 || C <= 0 || D <= 0) return null;

  const delta = Math.log((A * D) / (B * C));
  const variance = 1 / A + 1 / B + 1 / C + 1 / D;

  if (!finite(delta) || !finite(variance) || variance <= 0) return null;

  return { delta, variance, corrected: needsCorrection };
}

/** Whether an account's two arms are substantial enough to contribute at all. */
export function armsQualify(withAttr: Cell, without: Cell, stage: Stage): boolean {
  const minTrials = MIN_TRIALS_PER_ARM[stage];
  const minSuccesses = MIN_SUCCESSES_TOTAL[stage];
  return (
    withAttr.trials >= minTrials &&
    without.trials >= minTrials &&
    withAttr.successes + without.successes >= minSuccesses
  );
}

// ---------------------------------------------------------------------------
// Random-effects pooling (DerSimonian-Laird)
// ---------------------------------------------------------------------------

/** One account's contribution to a pool. */
export interface Study {
  /** Opaque account identifier. Only used to count independent contributors. */
  accountId: string;
  delta: number;
  variance: number;
}

export interface Pooled {
  /** Pooled log odds ratio. */
  effect: number;
  /** Standard error of `effect`. */
  se: number;
  /** 95% confidence interval on the log odds scale. */
  ci: [number, number];
  /** Between-account variance. Zero means accounts look like replicates. */
  tau2: number;
  /** Cochran's Q — observed dispersion. */
  q: number;
  /** Share of dispersion that is between-account rather than noise, 0..1. */
  i2: number;
  /** Number of contributing accounts. */
  k: number;
}

/** 1.959964… — the normal quantile for a 95% interval. */
const Z95 = 1.959963984540054;

/**
 * Pure: combine per-account contrasts into one estimate by DerSimonian-Laird.
 *
 * Returns null below MIN_ACCOUNTS rather than returning a wide interval,
 * because a wide interval still renders as a row on a page and a null does
 * not. The distinction this file cares about is not "uncertain" versus
 * "certain" — it is "we have something to say" versus "we do not".
 */
export function poolRandomEffects(studies: Study[], minAccounts = MIN_ACCOUNTS): Pooled | null {
  const usable = studies.filter((s) => finite(s.delta) && finite(s.variance) && s.variance > 0);

  // Independent accounts, not independent rows. One account contributing twice
  // is one account, and counting it twice is how a pool of four becomes a pool
  // of one advertiser who happened to split their spend.
  const accounts = new Set(usable.map((s) => s.accountId));
  if (accounts.size < minAccounts) return null;

  const k = usable.length;
  const w = usable.map((s) => 1 / s.variance);
  const sumW = w.reduce((x, y) => x + y, 0);
  const sumW2 = w.reduce((x, y) => x + y * y, 0);
  const fixed = usable.reduce((acc, s, i) => acc + w[i] * s.delta, 0) / sumW;

  const q = usable.reduce((acc, s, i) => acc + w[i] * (s.delta - fixed) ** 2, 0);
  const c = sumW - sumW2 / sumW;
  const tau2 = c > 0 ? Math.max(0, (q - (k - 1)) / c) : 0;

  const wStar = usable.map((s) => 1 / (s.variance + tau2));
  const sumWStar = wStar.reduce((x, y) => x + y, 0);
  const effect = usable.reduce((acc, s, i) => acc + wStar[i] * s.delta, 0) / sumWStar;
  const se = Math.sqrt(1 / sumWStar);

  if (!finite(effect) || !finite(se)) return null;

  const i2 = q > 0 ? Math.max(0, (q - (k - 1)) / q) : 0;

  return {
    effect,
    se,
    ci: [effect - Z95 * se, effect + Z95 * se],
    tau2,
    q,
    i2,
    k: accounts.size,
  };
}

/** Whether a pooled estimate's interval excludes "no effect". */
export function isDecisive(p: Pooled): boolean {
  return (p.ci[0] > 0 && p.ci[1] > 0) || (p.ci[0] < 0 && p.ci[1] < 0);
}

// ---------------------------------------------------------------------------
// Empirical Bayes: what this means for one account
// ---------------------------------------------------------------------------

export interface Shrunk {
  /** Posterior mean for this account, on the log odds scale. */
  effect: number;
  se: number;
  ci: [number, number];
  /**
   * How much of the account's own observation survived, 0..1. Near 1 means the
   * account had enough data to speak for itself; near 0 means what it is being
   * told is essentially the book-wide average.
   */
  ownWeight: number;
}

/**
 * Pure: the account's own noisy contrast, pulled toward the pooled estimate in
 * proportion to how little it knows.
 *
 * This is the part clients actually see, and it is the honest answer to the
 * question "does that hold for *me*". An account with three weeks of data gets
 * told roughly what the book knows; an account with a year of data gets told
 * what it has proven for itself; nobody has to choose a cutoff, because the
 * arithmetic is the cutoff.
 */
export function shrinkToPool(own: Study, pooled: Pooled): Shrunk {
  const { tau2 } = pooled;
  const ownWeight = tau2 <= 0 ? 0 : tau2 / (tau2 + own.variance);
  const effect = pooled.effect + ownWeight * (own.delta - pooled.effect);

  // Posterior variance, plus the uncertainty in the pooled mean itself. The
  // second term is routinely dropped and its absence is what produces
  // per-account intervals narrower than the pool they came from.
  const posterior = tau2 <= 0 ? 0 : (own.variance * tau2) / (own.variance + tau2);
  const se = Math.sqrt(posterior + (1 - ownWeight) ** 2 * pooled.se ** 2);

  return { effect, se, ci: [effect - Z95 * se, effect + Z95 * se], ownWeight };
}

// ---------------------------------------------------------------------------
// Saying it in English
// ---------------------------------------------------------------------------

/** Convert a log odds ratio into a relative change in rate, at a given baseline. */
export function relativeLift(logOddsRatio: number, baselineRate: number): number | null {
  if (!finite(logOddsRatio) || !finite(baselineRate)) return null;
  if (baselineRate <= 0 || baselineRate >= 1) return null;
  const odds0 = baselineRate / (1 - baselineRate);
  const odds1 = odds0 * Math.exp(logOddsRatio);
  const p1 = odds1 / (1 + odds1);
  return (p1 - baselineRate) / baselineRate;
}

export interface Described {
  /** The sentence. Always hedged to the strength of the evidence. */
  sentence: string;
  /** Whether the interval excluded no-effect. */
  decisive: boolean;
  direction: "up" | "down" | "flat";
}

function pct(x: number): string {
  const v = Math.abs(x) * 100;
  return v >= 10 ? `${Math.round(v)}%` : `${v.toFixed(1)}%`;
}

/**
 * Pure: render a pooled estimate as a sentence a business owner can act on.
 *
 * The wording rules are load-bearing, not stylistic:
 *   - "associated with", never "causes" or "drives". See the header.
 *   - the interval is always quoted, so a decisive-looking headline can never
 *     travel without the range that qualifies it.
 *   - an interval spanning zero is reported as no detectable difference, not
 *     as a small effect. A point estimate quoted from a straddling interval is
 *     the most common way a dashboard lies.
 */
export function describeEffect(
  pooled: Pooled,
  opts: { axisLabel: string; valueLabel: string; stage: Stage; baselineRate: number },
): Described {
  const { axisLabel, valueLabel, stage, baselineRate } = opts;
  const metric = stage === "CLICK" ? "click-through" : "click-to-lead";
  const decisive = isDecisive(pooled);
  const lift = relativeLift(pooled.effect, baselineRate);
  const lo = relativeLift(pooled.ci[0], baselineRate);
  const hi = relativeLift(pooled.ci[1], baselineRate);
  const accounts = `${pooled.k} account${pooled.k === 1 ? "" : "s"}`;

  if (!decisive || lift == null || lo == null || hi == null) {
    return {
      decisive: false,
      direction: "flat",
      sentence: `${axisLabel} "${valueLabel}": no detectable difference in ${metric} across ${accounts}. The range still spans no-effect, so this is a device that has not been shown to matter either way — not a device shown not to matter.`,
    };
  }

  const direction = lift > 0 ? "up" : "down";
  const verb = lift > 0 ? "higher" : "lower";
  const range = [lo, hi].sort((a, b) => a - b);

  return {
    decisive: true,
    direction,
    sentence: `${axisLabel} "${valueLabel}" is associated with ${pct(lift)} ${verb} ${metric} (range ${pct(range[0])} to ${pct(range[1])}), pooled across ${accounts}. Association from observed spend, not a controlled test.`,
  };
}
