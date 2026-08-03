/**
 * THE CREATIVE GENOME — the runner.
 *
 * DIRECTION
 *   The pure half is done: `taxonomy.ts` fixes the vocabulary, `pool.ts` does
 *   the statistics, `assemble.ts` designs the comparison. This file is the
 *   only part that touches the database or a model, and it is deliberately
 *   thin, because everything worth getting wrong has already been got right
 *   somewhere that can be tested without either.
 *
 * THE TENANCY RULE, STATED ONCE
 *   `refreshGenome` is the single function in this codebase that reads across
 *   every tenant at once. That is the whole point of it and it is also the
 *   most dangerous thing here, so the boundary is drawn sharply:
 *
 *     - It reads delivery and codings. It never reads a lead, a deal, a
 *       message, a name or anything a client wrote.
 *     - What it writes — `GenomeEstimate` — has no `clientId` and belongs to
 *       nobody. It is a statement about advertising, not about an advertiser.
 *     - `studies` carries account identifiers because shrinkage needs them,
 *       and `genomeForClient` filters to the caller's own accounts before
 *       anything is returned. The raw column is never serialised to a client.
 *
 *   One account's numbers can be recovered from a pooled estimate only by
 *   somebody who already has the other accounts' numbers. That is the standard
 *   this design meets; it is not differential privacy and is not described as
 *   such anywhere a client can read.
 *
 * WHY CODING IS NOT METERED
 *   `checkAgentRun` / `recordRun` exist to stop a client's plan being spent
 *   without them knowing. Coding a creative is agency infrastructure — the
 *   client did not ask for it and gets no run's worth of value from it
 *   individually — so it is deliberately outside the meter. Scoring a lead is
 *   metered because the client asked for that lead to be scored.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { anthropic, ANTHROPIC_MODEL } from "@/lib/anthropic";
import {
  AXIS_KEYS,
  coderInstruction,
  sanitizeCoding,
  type Coding,
  type CodingProblem,
} from "./taxonomy";
import { buildGenome, clientView, briefingNotes, type CreativeRow, type ClientFinding } from "./assemble";
import { isDecisive, type Study } from "./pool";

/**
 * Vocabulary revision. Bump this whenever an axis or a value changes in
 * `taxonomy.ts` — codings made against an older vocabulary are not comparable
 * and are re-coded rather than quietly pooled with the new ones.
 */
export const CODING_REV = 1;

// ---------------------------------------------------------------------------
// Coding one advertisement
// ---------------------------------------------------------------------------

/**
 * Pure: pull a coding out of whatever the model replied with.
 *
 * `raw` is returned alongside the sanitized coding because the two carry
 * different information and the eval harness needs both: a coder that emitted
 * six axes of which two were invented is doing something different from one
 * that emitted four good ones, and after sanitizing they are indistinguishable.
 */
export function parseCoding(text: string): {
  coding: Coding;
  raw: Coding;
  problems: CodingProblem[];
} {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return { coding: {}, raw: {}, problems: [] };

  try {
    const obj = JSON.parse(candidate) as Record<string, unknown>;
    const raw: Coding = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string") raw[k] = v;
    }
    return { ...sanitizeCoding(raw), raw };
  } catch {
    // An unparseable reply codes nothing. It must never code partially — a
    // regex that scrapes "question" out of prose will find it in the ad copy
    // as often as in the answer.
    return { coding: {}, raw: {}, problems: [] };
  }
}

/** What the coder is shown. Only the ad itself — never the account's results. */
export function creativeToPrompt(c: {
  name: string;
  format: string;
  headline: string | null;
  body: string | null;
  assetNote: string | null;
}): string {
  return [
    `Format: ${c.format}`,
    `Name: ${c.name}`,
    `Headline: ${c.headline ?? "(none)"}`,
    `Body: ${c.body ?? "(none)"}`,
    `Visual: ${c.assetNote ?? "(not described)"}`,
  ].join("\n");
}

export interface CodeResult {
  creativeId: string;
  coding: Coding;
  problems: CodingProblem[];
  /** Axes the coder declined to answer. Expected and fine; tracked, not fixed. */
  omitted: string[];
}

/**
 * Code one creative. The coder never sees performance — if it did, it would
 * learn to code the winners differently, and the estimate would be measuring
 * its own prior.
 */
export async function codeCreative(creativeId: string): Promise<CodeResult | null> {
  const creative = await prisma.creative.findUnique({ where: { id: creativeId } });
  if (!creative) return null;

  const res = await anthropic().messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 400,
    system: coderInstruction(),
    messages: [{ role: "user", content: creativeToPrompt(creative) }],
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const { coding, problems } = parseCoding(text);

  await prisma.creative.update({
    where: { id: creativeId },
    data: {
      coding: coding as object,
      codedBy: "MODEL",
      codedAt: new Date(),
      codedRev: CODING_REV,
    },
  });

  return {
    creativeId,
    coding,
    problems,
    omitted: AXIS_KEYS.filter((k) => coding[k] == null),
  };
}

// ---------------------------------------------------------------------------
// The coding sweep
// ---------------------------------------------------------------------------

/**
 * Per cron tick, not per night. The cap exists for the same reason the night
 * shift runs sequentially: a backlog of a thousand imported creatives must
 * become a few days of quiet catch-up, not one tick that spends the model
 * budget in a burst and trips a rate limit for every tenant at once.
 */
export const CODING_SWEEP_LIMIT = 25;

export interface SweepResult {
  /** How many uncoded creatives were waiting, up to the cap. */
  attempted: number;
  coded: number;
  /** Vocabulary violations the sanitizer dropped — a nonzero count here is
   *  the coder drifting, and worth a look before it costs data. */
  problems: number;
}

/**
 * Code whatever has arrived uncoded, oldest first.
 *
 * This is the missing stage between ingestion and estimation: creatives enter
 * by CSV or manual entry with no coding, and `refreshGenome` reads only coded
 * rows — without this sweep, an imported creative would simply never exist as
 * far as the book is concerned. Also picks up creatives coded against an old
 * vocabulary revision, which is what makes bumping CODING_REV safe: the next
 * few ticks re-code the book instead of anybody re-importing anything.
 */
export async function codingSweep(limit = CODING_SWEEP_LIMIT): Promise<SweepResult> {
  const waiting = await prisma.creative.findMany({
    where: { OR: [{ codedAt: null }, { codedRev: { not: CODING_REV } }] },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let coded = 0;
  let problems = 0;
  // Sequential on purpose — see the cap's comment.
  for (const c of waiting) {
    const res = await codeCreative(c.id);
    if (!res) continue;
    coded += 1;
    problems += res.problems.length;
  }

  return { attempted: waiting.length, coded, problems };
}

// ---------------------------------------------------------------------------
// Refreshing the book
// ---------------------------------------------------------------------------

export interface RefreshResult {
  creatives: number;
  accounts: number;
  findings: number;
  decisive: number;
}

/**
 * Recompute every pooled estimate from scratch.
 *
 * Full recompute rather than an incremental update, deliberately. The pool is
 * over a few thousand rows at the scale this business operates at, an
 * incremental random-effects update is not a thing that exists in closed form,
 * and an estimate that has silently diverged from the data it claims to
 * summarise is the worst outcome available here. It runs nightly.
 */
export async function refreshGenome(): Promise<RefreshResult> {
  const creatives = await prisma.creative.findMany({
    // `Prisma.DbNull` rather than `null`: on a nullable Json column the two
    // mean different things to Postgres — SQL NULL versus the JSON value
    // `null` — and Prisma makes you say which. A coding that was never written
    // is the first; there is no legitimate way to get the second here.
    where: { codedRev: CODING_REV, coding: { not: Prisma.DbNull } },
    select: {
      id: true,
      adAccountId: true,
      coding: true,
      metrics: { select: { impressions: true, clicks: true, leads: true } },
    },
  });

  const rows: CreativeRow[] = creatives.map((c) => ({
    accountId: c.adAccountId,
    creativeId: c.id,
    coding: (c.coding ?? {}) as Coding,
    impressions: c.metrics.reduce((n, m) => n + m.impressions, 0),
    clicks: c.metrics.reduce((n, m) => n + m.clicks, 0),
    leads: c.metrics.reduce((n, m) => n + m.leads, 0),
  }));

  const findings = buildGenome(rows);

  for (const f of findings) {
    const data = {
      stage: f.stage,
      effect: f.pooled.effect,
      se: f.pooled.se,
      ciLow: f.pooled.ci[0],
      ciHigh: f.pooled.ci[1],
      tau2: f.pooled.tau2,
      i2: f.pooled.i2,
      accounts: f.pooled.k,
      baselineRate: f.baselineRate,
      corrected: f.correctedCount,
      decisive: isDecisive(f.pooled),
      studies: f.studies as unknown as object,
      sentence: f.described.sentence,
      computedAt: new Date(),
    };
    await prisma.genomeEstimate.upsert({
      where: { axis_value_rev: { axis: f.axis, value: f.value, rev: CODING_REV } },
      create: { axis: f.axis, value: f.value, rev: CODING_REV, ...data },
      update: data,
    });
  }

  // An attribute that no longer clears the gates must stop being displayed.
  // Leaving a stale row is how a finding outlives the evidence for it.
  const live = findings.map((f) => `${f.axis}:${f.value}`);
  const stale = await prisma.genomeEstimate.findMany({
    where: { rev: CODING_REV },
    select: { id: true, axis: true, value: true },
  });
  const doomed = stale.filter((r) => !live.includes(`${r.axis}:${r.value}`)).map((r) => r.id);
  if (doomed.length > 0) {
    await prisma.genomeEstimate.deleteMany({ where: { id: { in: doomed } } });
  }

  return {
    creatives: rows.length,
    accounts: new Set(rows.map((r) => r.accountId)).size,
    findings: findings.length,
    decisive: findings.filter((f) => isDecisive(f.pooled)).length,
  };
}

// ---------------------------------------------------------------------------
// Reading it, as one client
// ---------------------------------------------------------------------------

/**
 * The genome as it applies to one tenant.
 *
 * Reads the pooled rows, filters `studies` down to this client's own accounts
 * before anything leaves this function, and shrinks their own contrast toward
 * the book. The client is never handed another advertiser's contrast.
 */
export async function genomeForClient(clientId: string): Promise<ClientFinding[]> {
  const [estimates, accounts] = await Promise.all([
    prisma.genomeEstimate.findMany({
      where: { rev: CODING_REV },
      orderBy: [{ decisive: "desc" }, { effect: "desc" }],
    }),
    prisma.adAccount.findMany({ where: { clientId }, select: { id: true } }),
  ]);

  const mine = accounts.map((a) => a.id);

  const findings = estimates.map((e) => ({
    axis: e.axis,
    axisLabel: e.axis,
    value: e.value,
    valueLabel: e.value,
    stage: e.stage as "CLICK" | "LEAD",
    pooled: {
      effect: e.effect,
      se: e.se,
      ci: [e.ciLow, e.ciHigh] as [number, number],
      tau2: e.tau2,
      q: 0,
      i2: e.i2,
      k: e.accounts,
    },
    baselineRate: e.baselineRate,
    studies: ((e.studies ?? []) as unknown as Study[]).filter((s) => mine.includes(s.accountId)),
    correctedCount: e.corrected,
    described: { sentence: e.sentence, decisive: e.decisive, direction: "flat" as const },
  }));

  return clientView(findings, mine);
}

/**
 * The block injected ahead of a copywriting run, the same way `memoryDigest`
 * is injected ahead of a qualification run.
 *
 * This is the payoff for the entire subsystem: MUSE-9 stops writing from a
 * fixed prompt and starts writing from what the book has actually observed,
 * with this client's own divergences overriding it where they have earned it.
 */
export async function creativeBriefing(clientId: string): Promise<string> {
  const view = await genomeForClient(clientId);
  const notes = briefingNotes(view);
  if (notes.length === 0) return "";

  return [
    "\n\nWhat the book of business has observed about creative devices:",
    ...notes.map((n) => `- ${n}`),
    "These are associations from observed spend across many advertisers, not controlled tests. Treat them as a starting bias, not a rule, and never repeat these figures to the client as a promise.",
  ].join("\n");
}
