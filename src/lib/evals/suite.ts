/**
 * THE EVAL HARNESS — the runner and the gate.
 *
 * TWO MODES, AND THE DIFFERENCE IS NOT DECORATION
 *
 *   REPLAY (what CI runs). Grades a fixed set of outputs held in
 *   `fixtures.ts`. It needs no API key, no database and no network, it is
 *   deterministic, and it runs on every push like every other test here.
 *
 *   What it actually protects is the deterministic code wrapped around the
 *   model — `parseScore`, `parseCoding`, `sanitizeCoding`, the scorers
 *   themselves, and the instruction blocks that shape the output. That is a
 *   real and currently unguarded surface: a well-meant tightening of
 *   `parseScore`'s regex silently drops `nextAction` on half of real replies,
 *   nothing fails, and the morning brief quietly loses its call list.
 *
 *   It does NOT measure the model. Fixtures are hand-authored to represent
 *   output shapes — good, degraded, and pathological — and are labelled as
 *   such in `fixtures.ts`. Calling that a measurement of Claude's quality
 *   would be the exact species of dishonesty the rest of this codebase spends
 *   its tests preventing.
 *
 *   LIVE (`pnpm evals:live`). Calls the real model on the real prompts and
 *   grades what comes back. That is the measurement. It needs a key, so it
 *   cannot be a build gate, so it is a script — and its results are written
 *   back as fixtures so a regression found live becomes a permanent CI case.
 *
 * THE RATCHET
 *   Baselines live in `baselines.json`. A suite may not score below its
 *   baseline minus a tolerance. When it scores meaningfully *above* baseline,
 *   the gate says so and asks for the baseline to be raised — an improvement
 *   nobody records is an improvement the next regression is free to undo.
 */

import type { Score } from "./scorers";

export interface EvalCase<O> {
  key: string;
  /** One sentence on what this case is here to catch. */
  about: string;
  output: O;
  gold?: unknown;
}

export type Grade<O> = (c: EvalCase<O>) => Record<string, Score>;

export interface ScorerResult {
  key: string;
  mean: number;
  /** The worst single case, because a mean of 0.9 over ten cases hides a zero. */
  worst: { caseKey: string; score: number; detail: string };
  failures: { caseKey: string; score: number; detail: string }[];
}

export interface SuiteResult {
  key: string;
  cases: number;
  byScorer: ScorerResult[];
  /** Weighted mean across scorers. The number the gate compares. */
  overall: number;
}

/** Pure: grade every case and roll it up. */
export function runSuite<O>(
  key: string,
  cases: EvalCase<O>[],
  grade: Grade<O>,
  weights: Record<string, number>,
): SuiteResult {
  const perScorer = new Map<string, { caseKey: string; score: number; detail: string }[]>();

  for (const c of cases) {
    for (const [scorerKey, score] of Object.entries(grade(c))) {
      const list = perScorer.get(scorerKey) ?? [];
      list.push({ caseKey: c.key, score: score.score, detail: score.detail });
      perScorer.set(scorerKey, list);
    }
  }

  const byScorer: ScorerResult[] = [...perScorer.entries()].map(([scorerKey, results]) => {
    const mean = results.reduce((n, r) => n + r.score, 0) / results.length;
    const worst = results.reduce((a, b) => (b.score < a.score ? b : a));
    return {
      key: scorerKey,
      mean,
      worst,
      failures: results.filter((r) => r.score < 1).sort((a, b) => a.score - b.score),
    };
  });

  const totalWeight = byScorer.reduce((n, s) => n + (weights[s.key] ?? 0), 0);
  const overall =
    totalWeight === 0
      ? 0
      : byScorer.reduce((n, s) => n + s.mean * (weights[s.key] ?? 0), 0) / totalWeight;

  return { key, cases: cases.length, byScorer, overall };
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

export interface Baseline {
  overall: number;
  /** Per-scorer floors, for the ones where a mean is not good enough. */
  scorers?: Record<string, number>;
}

/**
 * How far a suite may drift below its baseline before the build fails.
 *
 * Non-zero because the replay suite is deterministic but the scorers are not
 * all integer-valued, and a floating-point equality gate fails on a refactor
 * that changed nothing. Small, because the whole point is to catch drift.
 */
export const TOLERANCE = 0.01;

/**
 * How far above baseline counts as an improvement worth recording rather than
 * noise. Below this the gate stays quiet.
 */
export const RATCHET_MARGIN = 0.02;

export type Verdict =
  | { ok: true; kind: "held"; message: string }
  | { ok: true; kind: "improved"; message: string }
  | { ok: false; kind: "regressed"; message: string };

/** Pure: compare a run against its recorded baseline. */
export function gate(result: SuiteResult, baseline: Baseline): Verdict {
  const failures: string[] = [];

  if (result.overall < baseline.overall - TOLERANCE) {
    failures.push(
      `overall ${result.overall.toFixed(3)} below baseline ${baseline.overall.toFixed(3)}`,
    );
  }

  for (const [scorerKey, floor] of Object.entries(baseline.scorers ?? {})) {
    const s = result.byScorer.find((x) => x.key === scorerKey);
    if (!s) {
      failures.push(`scorer "${scorerKey}" has a floor but produced no results`);
      continue;
    }
    if (s.mean < floor - TOLERANCE) {
      failures.push(
        `${scorerKey} ${s.mean.toFixed(3)} below floor ${floor.toFixed(3)} — worst: ${s.worst.caseKey} (${s.worst.detail})`,
      );
    }
  }

  if (failures.length > 0) {
    return { ok: false, kind: "regressed", message: `${result.key}: ${failures.join("; ")}` };
  }

  if (result.overall > baseline.overall + RATCHET_MARGIN) {
    return {
      ok: true,
      kind: "improved",
      message: `${result.key}: ${result.overall.toFixed(3)} is above baseline ${baseline.overall.toFixed(
        3,
      )} — raise the baseline in baselines.json so this cannot be undone silently.`,
    };
  }

  return { ok: true, kind: "held", message: `${result.key}: ${result.overall.toFixed(3)}` };
}

/** Human-readable run report. Used by the live script and on CI failure. */
export function report(result: SuiteResult): string {
  const lines = [`${result.key} — ${result.overall.toFixed(3)} over ${result.cases} cases`];
  for (const s of result.byScorer) {
    lines.push(`  ${s.key.padEnd(22)} ${s.mean.toFixed(3)}`);
    for (const f of s.failures.slice(0, 3)) {
      lines.push(`      ${f.caseKey}: ${f.detail}`);
    }
  }
  return lines.join("\n");
}
