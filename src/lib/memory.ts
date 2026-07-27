/**
 * System memory — the part of the desk that gets better the longer you own it.
 *
 * DIRECTION
 *   A prompt is the same on day 1 and day 400. That is the ceiling on every
 *   "AI agent" product: it never learns your business, so leaving costs nothing.
 *   Here, every closed deal a client logs feeds back into what the agents know.
 *   After six months the Lead Qualifier is calibrated to what actually closes
 *   for *them* — and starting over somewhere else means starting from zero.
 *
 * BLUEPRINTS
 *   `computeCalibration` is pure: outcomes in, facts out. No database, no
 *   model call, fully tested. `refreshMemory` performs the writes and
 *   `memoryDigest` renders what survives the confidence floor into the block
 *   injected ahead of every agent run.
 *
 * The rules that matter:
 *   - Never state a fact from a handful of deals. MIN_EVIDENCE gates it.
 *   - Confidence rises with evidence and is shown to the client, not hidden.
 *   - Anything the client disagrees with can be muted. It is their memory, not
 *     an opaque model — a system nobody can correct is one nobody trusts.
 */

import { prisma } from "@/lib/prisma";

export interface OutcomeSample {
  outcome: "WON" | "LOST";
  valueCents: number;
  scoreAtQualification?: number | null;
  objection?: string | null;
  source?: string | null;
}

export interface MemoryCandidate {
  kind: "CALIBRATION" | "OBJECTION" | "SOURCE" | "VALUE";
  key: string;
  content: string;
  confidence: number;
  evidenceCount: number;
}

/** Below this, a pattern is a coincidence, not a fact. */
export const MIN_EVIDENCE = 5;
/** Full confidence at this much evidence. */
const CONFIDENCE_SATURATION = 20;
/** Entries below this are stored but never injected into a prompt. */
export const CONFIDENCE_FLOOR = 0.25;

export const SCORE_BANDS = [
  { key: "80-100", label: "80-100 (HOT)", min: 80, max: 100 },
  { key: "60-79", label: "60-79 (WARM)", min: 60, max: 79 },
  { key: "40-59", label: "40-59 (COLD)", min: 40, max: 59 },
  { key: "0-39", label: "below 40", min: 0, max: 39 },
] as const;

function confidenceFor(n: number): number {
  return Math.min(1, n / CONFIDENCE_SATURATION);
}

function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** Normalise free-text objections so "Too Expensive" and "too expensive " merge. */
export function normalizeObjection(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
}

/**
 * Pure: derive everything the system has learned from a client's closed deals.
 * Returns only patterns with enough evidence behind them to be worth stating.
 */
export function computeCalibration(samples: OutcomeSample[]): MemoryCandidate[] {
  const out: MemoryCandidate[] = [];
  if (samples.length === 0) return out;

  const wins = samples.filter((s) => s.outcome === "WON");
  const losses = samples.filter((s) => s.outcome === "LOST");
  const overallRate = pct(wins.length, samples.length);

  // --- Score-band calibration ------------------------------------------------
  const bandRates = new Map<string, { rate: number; n: number }>();
  for (const band of SCORE_BANDS) {
    const inBand = samples.filter(
      (s) =>
        s.scoreAtQualification != null &&
        s.scoreAtQualification >= band.min &&
        s.scoreAtQualification <= band.max,
    );
    if (inBand.length < MIN_EVIDENCE) continue;

    const bandWins = inBand.filter((s) => s.outcome === "WON").length;
    const rate = pct(bandWins, inBand.length);
    bandRates.set(band.key, { rate, n: inBand.length });

    out.push({
      kind: "CALIBRATION",
      key: `band-${band.key}`,
      content: `Leads scored ${band.label} close ${rate}% of the time for this business (${bandWins} of ${inBand.length} closed deals).`,
      confidence: confidenceFor(inBand.length),
      evidenceCount: inBand.length,
    });
  }

  // An inverted ladder means the rubric is wrong, and that is the single most
  // useful thing the system can tell an agent — it stops it trusting its own
  // scores until a human retunes the bar.
  const hot = bandRates.get("80-100");
  const warm = bandRates.get("60-79");
  if (hot && warm && warm.rate > hot.rate) {
    out.push({
      kind: "CALIBRATION",
      key: "inverted-ladder",
      content: `Warning: leads scored 60-79 close more often (${warm.rate}%) than leads scored 80-100 (${hot.rate}%). The qualification rubric is mis-weighted — be sceptical of high scores and say so when scoring.`,
      confidence: confidenceFor(hot.n + warm.n),
      evidenceCount: hot.n + warm.n,
    });
  }

  // --- Why deals are actually lost -------------------------------------------
  const objectionCounts = new Map<string, number>();
  for (const l of losses) {
    if (!l.objection) continue;
    const key = normalizeObjection(l.objection);
    if (!key) continue;
    objectionCounts.set(key, (objectionCounts.get(key) ?? 0) + 1);
  }
  const rankedObjections = [...objectionCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [objection, count] of rankedObjections.slice(0, 3)) {
    if (count < MIN_EVIDENCE) continue;
    out.push({
      kind: "OBJECTION",
      key: objection,
      content: `"${objection}" is a leading reason this business loses deals (${count} of ${losses.length} losses). Pre-empt it rather than waiting for it.`,
      confidence: confidenceFor(count),
      evidenceCount: count,
    });
  }

  // --- Which sources are worth the team's time -------------------------------
  const bySource = new Map<string, { won: number; total: number }>();
  for (const s of samples) {
    if (!s.source) continue;
    const key = s.source.trim().toLowerCase();
    const row = bySource.get(key) ?? { won: 0, total: 0 };
    row.total += 1;
    if (s.outcome === "WON") row.won += 1;
    bySource.set(key, row);
  }
  for (const [source, row] of bySource) {
    if (row.total < MIN_EVIDENCE) continue;
    const rate = pct(row.won, row.total);
    // Only worth saying when it diverges meaningfully from the baseline.
    if (Math.abs(rate - overallRate) < 15) continue;
    out.push({
      kind: "SOURCE",
      key: source,
      content: `Leads from ${source} close ${rate}% of the time versus ${overallRate}% overall (${row.total} closed deals). ${
        rate > overallRate ? "Prioritise them." : "Qualify them harder before spending rep time."
      }`,
      confidence: confidenceFor(row.total),
      evidenceCount: row.total,
    });
  }

  // --- What a customer is worth ----------------------------------------------
  const valuedWins = wins.filter((w) => w.valueCents > 0);
  if (valuedWins.length >= MIN_EVIDENCE) {
    const avg = Math.round(
      valuedWins.reduce((sum, w) => sum + w.valueCents, 0) / valuedWins.length,
    );
    out.push({
      kind: "VALUE",
      key: "average-won-deal",
      content: `The average won deal for this business is ${money(avg)} (${valuedWins.length} deals). Weigh how hard to chase a lead against that number.`,
      confidence: confidenceFor(valuedWins.length),
      evidenceCount: valuedWins.length,
    });
  }

  return out;
}

/**
 * Render learned facts into the block injected ahead of an agent run. Muted and
 * low-confidence entries are excluded. Returns "" when there is nothing solid
 * to say — an agent should never be told about patterns that aren't real yet.
 */
export function renderDigest(
  entries: { kind: string; content: string; confidence: number; muted: boolean }[],
): string {
  const usable = entries
    .filter((e) => !e.muted && e.confidence >= CONFIDENCE_FLOOR)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 12);
  if (usable.length === 0) return "";

  return [
    "",
    "WHAT THIS BUSINESS HAS TAUGHT US (learned from their own closed deals, not assumptions):",
    ...usable.map((e) => `• ${e.content}`),
    "Weigh these above generic best practice — they come from this client's real results. If a fact here contradicts your instinct, say so in your answer rather than ignoring it.",
  ].join("\n");
}

/** The digest for one tenant, ready to append to a system prompt. */
export async function memoryDigest(clientId: string): Promise<string> {
  const entries = await prisma.memoryEntry.findMany({
    where: { clientId, muted: false },
    select: { kind: true, content: true, confidence: true, muted: true },
  });
  return renderDigest(entries);
}

/**
 * Recompute a tenant's memory from every outcome they've logged. Cheap enough
 * to run on each new outcome; deterministic, so running it twice is harmless.
 */
export async function refreshMemory(clientId: string): Promise<number> {
  const outcomes = await prisma.dealOutcome.findMany({
    where: { clientId },
    select: {
      outcome: true,
      valueCents: true,
      scoreAtQualification: true,
      objection: true,
      source: true,
    },
  });

  const candidates = computeCalibration(outcomes as OutcomeSample[]);

  for (const c of candidates) {
    await prisma.memoryEntry.upsert({
      where: { clientId_kind_key: { clientId, kind: c.kind, key: c.key } },
      // Never un-mute on refresh: a client silencing a fact is a decision, and
      // recomputing must not quietly overrule it.
      update: {
        content: c.content,
        confidence: c.confidence,
        evidenceCount: c.evidenceCount,
      },
      create: {
        clientId,
        kind: c.kind,
        key: c.key,
        content: c.content,
        confidence: c.confidence,
        evidenceCount: c.evidenceCount,
      },
    });
  }

  // Drop facts the evidence no longer supports (e.g. an outcome was corrected).
  const liveKeys = new Set(candidates.map((c) => `${c.kind}:${c.key}`));
  const stored = await prisma.memoryEntry.findMany({
    where: { clientId },
    select: { id: true, kind: true, key: true },
  });
  const stale = stored.filter((s) => !liveKeys.has(`${s.kind}:${s.key}`)).map((s) => s.id);
  if (stale.length > 0) {
    await prisma.memoryEntry.deleteMany({ where: { id: { in: stale } } });
  }

  return candidates.length;
}

export interface RecordOutcomeInput {
  clientId: string;
  leadId?: string | null;
  outcome: "WON" | "LOST";
  valueCents?: number;
  objection?: string | null;
  notes?: string | null;
}

/**
 * Log a closed deal and fold it into memory. Snapshots the qualification score
 * from the lead so calibration survives later edits to the lead row.
 */
export async function recordOutcome(input: RecordOutcomeInput) {
  const lead = input.leadId
    ? await prisma.lead.findFirst({
        where: { id: input.leadId, clientId: input.clientId },
        select: { id: true, score: true, tier: true, source: true },
      })
    : null;

  const created = await prisma.dealOutcome.create({
    data: {
      clientId: input.clientId,
      leadId: lead?.id ?? null,
      outcome: input.outcome,
      valueCents: input.valueCents ?? 0,
      scoreAtQualification: lead?.score ?? null,
      tierAtQualification: lead?.tier ?? null,
      objection: input.objection?.trim() || null,
      source: lead?.source ?? null,
      notes: input.notes?.trim() || null,
    },
  });

  if (lead) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: input.outcome },
    });
  }

  await refreshMemory(input.clientId);
  return created;
}
