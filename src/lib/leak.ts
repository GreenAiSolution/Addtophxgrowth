/**
 * The Leak Calculator.
 *
 * DIRECTION
 *   PHX/GROWTH's Growth Calculator answers "what could my ad spend buy?" — it
 *   projects forward from budget and margin. Rebuilding that here would be a
 *   worse copy of a good tool.
 *
 *   This answers the opposite question, and the one this site is actually
 *   about: what is demand you already paid for costing you when nobody picks
 *   up? It runs backwards from calls you are already getting, so it needs no
 *   projection and no assumption about our performance.
 *
 * THE HONESTY CONSTRAINT
 *   Their calculator states its model out loud ("assumes ~28% lower CAC…
 *   illustrative, not a guarantee") and tells you when the maths does not
 *   work — "at these inputs the projected lift doesn't cover the Pilot
 *   retainer yet." That candour is the best thing on their site and this
 *   mirrors it exactly:
 *
 *   - Every output is the visitor's own four numbers multiplied. There is no
 *     lift factor, no benchmark, no industry average. Nothing here claims an
 *     outcome, because nothing here is our number.
 *   - `recovery` is an explicit, adjustable assumption about how much of a
 *     leak is actually recoverable — never hidden, and defaulted below 1
 *     because "answer every call" is not "win every call".
 *   - `coverage` can come out below 1, and when it does the tool says so. A
 *     calculator that always recommends buying is a brochure with sliders.
 */

export interface LeakInputs {
  /** Inbound calls a month. */
  callsPerMonth: number;
  /** Percentage of them that reach voicemail, 0–100. */
  missedPct: number;
  /** Cents. What one closed job is worth. */
  jobValue: number;
  /** Percentage of answered calls that become jobs, 0–100. */
  closeRate: number;
  /**
   * Share of missed calls a 24/7 operator could realistically convert at the
   * same close rate, 0–1. Deliberately a parameter rather than a constant, so
   * a sceptical visitor can drag it to something they believe.
   */
  recovery: number;
}

export interface LeakResult {
  /** Calls that hit voicemail each month. */
  missedCalls: number;
  /** Cents of booked work those calls represent, at the visitor's own rates. */
  monthlyLeak: number;
  annualLeak: number;
  /** Cents we assume are actually recoverable. */
  recoverable: number;
  /** Recoverable value ÷ cost of the fix. Below 1 means it does not pay. */
  coverage: number;
  /** True when the arithmetic does not justify the purchase. */
  underwater: boolean;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Pure. Four numbers in, the same four multiplied out — no model, no benchmark.
 *
 * `monthlyCost` is the price of whatever fixes it, passed in rather than
 * imported, so the function has no opinion about which upgrade is being sold
 * and the tests can check the underwater branch without touching the
 * catalogue.
 */
export function computeLeak(inputs: LeakInputs, monthlyCost: number): LeakResult {
  const calls = Math.max(0, Math.round(inputs.callsPerMonth));
  const missedPct = clamp(inputs.missedPct, 0, 100);
  const jobValue = Math.max(0, Math.round(inputs.jobValue));
  const closeRate = clamp(inputs.closeRate, 0, 100);
  const recovery = clamp(inputs.recovery, 0, 1);

  const missedCalls = Math.round((calls * missedPct) / 100);
  const monthlyLeak = Math.round((missedCalls * closeRate * jobValue) / 100);
  const recoverable = Math.round(monthlyLeak * recovery);

  // A zero-cost fix would divide by zero; treat it as fully covered rather
  // than returning Infinity into a render.
  const coverage = monthlyCost > 0 ? recoverable / monthlyCost : recoverable > 0 ? 1 : 0;

  return {
    missedCalls,
    monthlyLeak,
    annualLeak: monthlyLeak * 12,
    recoverable,
    coverage,
    underwater: coverage < 1,
  };
}

/** Sensible opening position — a small local business, not a flattering one. */
export const LEAK_DEFAULTS: LeakInputs = {
  callsPerMonth: 120,
  missedPct: 25,
  jobValue: 85000,
  closeRate: 35,
  recovery: 0.5,
};

/**
 * What this deliberately does not measure. Shown on the page, because a
 * calculator that quantifies one gap and stays silent about the other four
 * implies they are worth nothing.
 */
export const NOT_MEASURED = [
  "Buyers who asked an assistant and never saw you at all",
  "Work that never got filmed, so the ad queue ran dry",
  "A crew that never got graded against the deals it closed",
] as const;
