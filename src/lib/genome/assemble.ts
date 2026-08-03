/**
 * THE CREATIVE GENOME — assembly.
 *
 * DIRECTION
 *   `taxonomy.ts` says what an ad can be described as. `pool.ts` says how two
 *   arms of a comparison become one estimate. This file is the part in
 *   between: it decides *what gets compared with what*, which is where the
 *   study is actually designed and therefore where it is most easily ruined.
 *
 * THE THREE DECISIONS THAT MATTER
 *
 *   1. AN UNCODED CREATIVE IS NOT A CONTROL.
 *      The tempting shortcut is to treat every creative without
 *      `hook: question` as the comparison arm. That silently sweeps in every
 *      ad the coder could not read — corrupted assets, video with no
 *      transcript, anything ambiguous — and those are not a random sample of
 *      "ads without a question hook". They are a sample of ads that were hard
 *      to interpret, which correlates with production quality, which
 *      correlates with performance. The control arm here is only creatives
 *      that were successfully coded on that same axis and got a different
 *      value.
 *
 *   2. THE COMPARISON IS ALWAYS WITHIN ONE ACCOUNT.
 *      Enforced by construction: contrasts are built per account and only then
 *      handed to the pool. There is no code path that compares one
 *      advertiser's creatives to another's.
 *
 *   3. AN ACCOUNT WITH ONLY ONE ARM CONTRIBUTES NOTHING.
 *      An advertiser who has only ever run question hooks has no information
 *      about question hooks. This feels like discarding data and is the
 *      opposite — it is declining to attribute that account's baseline
 *      performance to the one device it never varied.
 *
 * BLUEPRINTS
 *   Pure. Rows in, findings out. No database, no clock.
 */

import {
  AXES,
  STAGE_OF,
  axisByKey,
  type Coding,
  type Stage,
} from "./taxonomy";
import {
  armsQualify,
  contrastLogOdds,
  describeEffect,
  isDecisive,
  poolRandomEffects,
  shrinkToPool,
  type Cell,
  type Described,
  type Pooled,
  type Shrunk,
  type Study,
} from "./pool";

/** One creative's coding and its lifetime delivery, already aggregated. */
export interface CreativeRow {
  accountId: string;
  creativeId: string;
  coding: Coding;
  impressions: number;
  clicks: number;
  leads: number;
}

/** Successes and trials for a stage, so the two funnel stages share one path. */
function cellFor(rows: CreativeRow[], stage: Stage): Cell {
  if (stage === "CLICK") {
    return {
      successes: rows.reduce((n, r) => n + r.clicks, 0),
      trials: rows.reduce((n, r) => n + r.impressions, 0),
    };
  }
  return {
    successes: rows.reduce((n, r) => n + r.leads, 0),
    trials: rows.reduce((n, r) => n + r.clicks, 0),
  };
}

function rate(c: Cell): number {
  return c.trials === 0 ? 0 : c.successes / c.trials;
}

export interface Finding {
  axis: string;
  axisLabel: string;
  value: string;
  valueLabel: string;
  stage: Stage;
  pooled: Pooled;
  /** The pooled rate of the control arms — what the lift is relative to. */
  baselineRate: number;
  /** Per-account contrasts behind the pool, kept so a client can be shown their own. */
  studies: Study[];
  /** How many contributing accounts needed the zero-cell correction. */
  correctedCount: number;
  described: Described;
}

/** Group rows by account, preserving order of first appearance. */
function byAccount(rows: CreativeRow[]): Map<string, CreativeRow[]> {
  const out = new Map<string, CreativeRow[]>();
  for (const r of rows) {
    const list = out.get(r.accountId);
    if (list) list.push(r);
    else out.set(r.accountId, [r]);
  }
  return out;
}

/**
 * Pure: build the contrast for one attribute value in one account.
 *
 * Returns null whenever the account cannot speak to this attribute — no
 * treatment arm, no control arm, or arms too thin to clear the gates.
 */
export function accountContrast(
  rows: CreativeRow[],
  axis: string,
  value: string,
  stage: Stage,
): { study: Omit<Study, "accountId">; corrected: boolean; control: Cell } | null {
  // Only creatives coded on this axis are eligible for either arm. See (1).
  const coded = rows.filter((r) => r.coding[axis] != null);
  const treatment = coded.filter((r) => r.coding[axis] === value);
  const control = coded.filter((r) => r.coding[axis] !== value);

  if (treatment.length === 0 || control.length === 0) return null;

  const t = cellFor(treatment, stage);
  const c = cellFor(control, stage);

  if (!armsQualify(t, c, stage)) return null;

  const contrast = contrastLogOdds(t, c);
  if (!contrast) return null;

  return {
    study: { delta: contrast.delta, variance: contrast.variance },
    corrected: contrast.corrected,
    control: c,
  };
}

/**
 * Pure: every finding the book of business currently supports.
 *
 * Attribute values with too few independent accounts simply do not appear.
 * That is the intended behaviour and it is why a young genome is nearly empty
 * — a table of twenty rows on four accounts' worth of data would be the most
 * expensive mistake this system could make, because every one of those rows
 * would be actioned by somebody.
 */
export function buildGenome(rows: CreativeRow[], minAccounts?: number): Finding[] {
  const accounts = byAccount(rows);
  const findings: Finding[] = [];

  for (const axis of AXES) {
    const stage = STAGE_OF[axis.key];

    for (const v of axis.values) {
      const studies: Study[] = [];
      const controls: Cell[] = [];
      let correctedCount = 0;

      for (const [accountId, accountRows] of accounts) {
        const built = accountContrast(accountRows, axis.key, v.key, stage);
        if (!built) continue;
        studies.push({ accountId, ...built.study });
        controls.push(built.control);
        if (built.corrected) correctedCount += 1;
      }

      const pooled = poolRandomEffects(studies, minAccounts);
      if (!pooled) continue;

      // The baseline is the control arms pooled — the rate the lift is a lift
      // *from*. Averaging the per-account rates instead would weight a tiny
      // account equally with a large one and produce a lift quoted against a
      // baseline no real account has.
      const baselineRate = rate({
        successes: controls.reduce((n, c) => n + c.successes, 0),
        trials: controls.reduce((n, c) => n + c.trials, 0),
      });

      findings.push({
        axis: axis.key,
        axisLabel: axis.label,
        value: v.key,
        valueLabel: v.label,
        stage,
        pooled,
        baselineRate,
        studies,
        correctedCount,
        described: describeEffect(pooled, {
          axisLabel: axis.label,
          valueLabel: v.label,
          stage,
          baselineRate,
        }),
      });
    }
  }

  // Decisive findings first, then by how large the effect is. A page that
  // leads with the biggest number regardless of whether it is real teaches
  // people to read the number and skip the interval.
  return findings.sort((a, b) => {
    const da = isDecisive(a.pooled) ? 1 : 0;
    const db = isDecisive(b.pooled) ? 1 : 0;
    if (da !== db) return db - da;
    return Math.abs(b.pooled.effect) - Math.abs(a.pooled.effect);
  });
}

// ---------------------------------------------------------------------------
// What it means for one account
// ---------------------------------------------------------------------------

export interface ClientFinding extends Finding {
  /** This account's own posterior, or null if it has never varied this device. */
  own: Shrunk | null;
  /** Whether the account's own data materially disagrees with the book. */
  divergent: boolean;
  /** The sentence to show this specific client. */
  clientSentence: string;
}

/**
 * Pure: re-express the genome for one account.
 *
 * The interesting output is `divergent` — a device the book likes and this
 * account's own data does not, with enough evidence behind the disagreement
 * that the intervals do not overlap. That is the single most useful thing a
 * cross-client system can tell somebody, and it is the thing a naive
 * "here's what works" table can never say, because it has already averaged the
 * disagreement away.
 */
export function clientView(findings: Finding[], accountIds: string[]): ClientFinding[] {
  const mine = new Set(accountIds);

  return findings.map((f) => {
    const ownStudies = f.studies.filter((s) => mine.has(s.accountId));
    if (ownStudies.length === 0) {
      return {
        ...f,
        own: null,
        divergent: false,
        clientSentence: `${f.described.sentence} You have not run enough of both to have your own read on this yet.`,
      };
    }

    // An account with several ad accounts gets them combined by inverse
    // variance before shrinkage — they are the same advertiser.
    const sumW = ownStudies.reduce((n, s) => n + 1 / s.variance, 0);
    const combined: Study = {
      accountId: accountIds[0],
      delta: ownStudies.reduce((n, s) => n + s.delta / s.variance, 0) / sumW,
      variance: 1 / sumW,
    };

    const own = shrinkToPool(combined, f.pooled);
    const overlap = own.ci[0] <= f.pooled.ci[1] && f.pooled.ci[0] <= own.ci[1];
    const divergent = !overlap;

    let clientSentence: string;
    if (divergent) {
      clientSentence = `${f.described.sentence} Your own accounts disagree with this, and have enough behind the disagreement to be taken seriously — trust yours over the book here.`;
    } else if (own.ownWeight >= 0.5) {
      clientSentence = `${f.described.sentence} Your own data broadly agrees and is now the larger part of your estimate.`;
    } else {
      clientSentence = `${f.described.sentence} You do not yet have enough of your own to confirm it, so this is mostly the book talking.`;
    }

    return { ...f, own, divergent, clientSentence };
  });
}

/** The findings a copywriting brief should actually carry: decisive ones, best first. */
export function briefingNotes(findings: ClientFinding[], limit = 6): string[] {
  return findings
    .filter((f) => isDecisive(f.pooled))
    .slice(0, limit)
    .map((f) => f.clientSentence);
}

export { axisByKey };
