/**
 * The Tuning Lab, wired to the database.
 *
 * Three jobs, in the order the month runs them:
 *
 *   gradeUngradedCalls   Score every call nobody has scored, deterministically.
 *   refreshProposals     Aggregate those grades into suggestions, deduped by key
 *                        so a rejected idea does not come back next week.
 *   decideProposal       Apply one the owner approved — which writes a new
 *                        playbook version, never an update in place.
 *
 * Nothing here decides anything `training.ts` has not already decided. The
 * rubric, the thresholds and the patch application are all pure and tested;
 * this file only knows how to read rows and write versions.
 */

import { prisma } from "@/lib/prisma";
import {
  applyPatch,
  gradeCall,
  proposeRetunes,
  readOut,
  type GradedCall,
  type Patch,
} from "@/lib/training";
import { activePlaybook, activePriceBook, savePlaybook, savePriceBook } from "@/lib/voice-store";
import type { CallOutcome, Turn } from "@/lib/voice";
import type { Finding, Grade } from "@/lib/training";

/** How many calls one grading pass will take on. Keeps a cron predictable. */
const GRADE_BATCH = 200;

export async function gradeUngradedCalls(clientId: string): Promise<{ graded: number }> {
  const [playbook, priceBook, calls] = await Promise.all([
    activePlaybook(clientId),
    activePriceBook(clientId),
    prisma.voiceCall.findMany({
      where: { clientId, gradedAt: null, endedAt: { not: null } },
      orderBy: { startedAt: "desc" },
      take: GRADE_BATCH,
    }),
  ]);

  let graded = 0;
  for (const call of calls) {
    const turns = Array.isArray(call.turns) ? (call.turns as unknown as Turn[]) : [];
    const grade = gradeCall({
      playbook: playbook.value,
      turns,
      captured: (call.captured as Record<string, string> | null) ?? {},
      outcome: (call.outcome ?? "FAILED") as CallOutcome,
      quotedTotalCents: call.quotedTotalCents ?? undefined,
      spokenCapCents: priceBook.value.maxSpokenTotalCents,
      dealOutcome: call.dealOutcome ?? "OPEN",
      dealValueCents: call.dealValueCents ?? undefined,
    });

    await prisma.voiceCall.update({
      where: { id: call.id },
      data: {
        gradeScore: grade.score,
        gradeClean: grade.clean,
        gradeHeadline: grade.headline,
        gradeFindings: grade.findings as never,
        gradedAt: new Date(),
      },
    });
    graded++;
  }

  return { graded };
}

/** Graded calls in the shape the aggregator wants. */
export async function gradedCallsFor(clientId: string, since?: Date): Promise<GradedCall[]> {
  const rows = await prisma.voiceCall.findMany({
    where: { clientId, gradedAt: { not: null }, ...(since ? { startedAt: { gte: since } } : {}) },
    orderBy: { startedAt: "desc" },
    take: GRADE_BATCH,
  });

  return rows.map((r) => ({
    id: r.id,
    outcome: (r.outcome ?? "FAILED") as CallOutcome,
    grade: {
      score: r.gradeScore ?? 0,
      clean: r.gradeClean ?? false,
      headline: r.gradeHeadline ?? "",
      findings: (Array.isArray(r.gradeFindings) ? r.gradeFindings : []) as unknown as Finding[],
    } satisfies Grade,
    captured: (r.captured as Record<string, string> | null) ?? {},
    unpricedItems: r.unpricedItems,
    unansweredQuestions: r.unansweredQuestions,
    dealOutcome: r.dealOutcome ?? "OPEN",
  }));
}

/**
 * Write the proposals a batch of graded calls implies.
 *
 * Upserted on `key`, and a row that already exists is left alone. That is what
 * stops a rejected proposal from reappearing the moment the same three calls
 * come back round in the window — a lab that keeps asking the same question is
 * a lab an owner stops reading.
 */
export async function refreshProposals(clientId: string, since?: Date) {
  const [playbook, priceBook, calls] = await Promise.all([
    activePlaybook(clientId),
    activePriceBook(clientId),
    gradedCallsFor(clientId, since),
  ]);

  const retunes = proposeRetunes(playbook.value, priceBook.value, calls);
  let created = 0;

  for (const r of retunes) {
    const existing = await prisma.tuneProposal.findUnique({
      where: { clientId_key: { clientId, key: r.key } },
      select: { id: true, status: true },
    });
    if (existing) {
      // Only a still-pending proposal gets fresher evidence. A decided one is
      // history.
      if (existing.status === "PENDING") {
        await prisma.tuneProposal.update({
          where: { id: existing.id },
          data: { evidence: r.evidence, why: r.why, patch: r.patch as never },
        });
      }
      continue;
    }
    await prisma.tuneProposal.create({
      data: {
        clientId,
        key: r.key,
        target: r.target,
        title: r.title,
        why: r.why,
        evidence: r.evidence,
        patch: r.patch as never,
      },
    });
    created++;
  }

  return { proposed: retunes.length, created };
}

/**
 * Patches the owner has to finish before they mean anything.
 *
 * `add_answer` with an empty answer, or a rate of zero, is a proposal that has
 * identified a gap and cannot fill it. The screen asks for the missing words
 * rather than applying an empty change and calling it done.
 */
export function needsInput(patch: Patch): { needs: boolean; label: string } {
  switch (patch.op) {
    case "add_answer":
      return { needs: !patch.a.trim(), label: "What should it say?" };
    case "add_price_item":
      return { needs: patch.item.rateCents <= 0, label: "Rate, in dollars" };
    case "add_never_say":
      return { needs: !patch.value.trim(), label: "The exact phrase to ban" };
    case "set_spoken_cap":
      return { needs: true, label: "New cap, in dollars" };
    default:
      return { needs: false, label: "" };
  }
}

/** Fold the owner's typed value into the patch before it is applied. */
export function fillPatch(patch: Patch, value: string): Patch {
  const v = value.trim();
  if (!v) return patch;
  switch (patch.op) {
    case "add_answer":
      return { ...patch, a: v };
    case "add_never_say":
      return { ...patch, value: v };
    case "add_price_item": {
      const dollars = Number(v.replace(/[^0-9.]/g, ""));
      return Number.isFinite(dollars) && dollars > 0
        ? { ...patch, item: { ...patch.item, rateCents: Math.round(dollars * 100) } }
        : patch;
    }
    case "set_spoken_cap": {
      const dollars = Number(v.replace(/[^0-9.]/g, ""));
      return Number.isFinite(dollars) && dollars >= 0
        ? { ...patch, cents: Math.round(dollars * 100) }
        : patch;
    }
    default:
      return patch;
  }
}

export async function decideProposal(
  clientId: string,
  proposalId: string,
  decision: { approve: boolean; by: string; value?: string },
): Promise<{ applied: boolean; version?: number; why?: string }> {
  const row = await prisma.tuneProposal.findFirst({ where: { id: proposalId, clientId } });
  if (!row) throw new Error("No such proposal");
  if (row.status !== "PENDING") return { applied: false, why: `already ${row.status.toLowerCase()}` };

  if (!decision.approve) {
    await prisma.tuneProposal.update({
      where: { id: row.id },
      data: { status: "REJECTED", decidedBy: decision.by, decidedAt: new Date() },
    });
    return { applied: false, why: "rejected" };
  }

  const patch = fillPatch(row.patch as unknown as Patch, decision.value ?? "");
  const check = needsInput(patch);
  if (check.needs) {
    return { applied: false, why: `this change needs a value first — ${check.label.toLowerCase()}` };
  }

  const [playbook, priceBook] = await Promise.all([
    activePlaybook(clientId),
    activePriceBook(clientId),
  ]);

  const next = applyPatch({ playbook: playbook.value, priceBook: priceBook.value }, patch);
  const note = `Tuning Lab: ${row.title}`;

  const version =
    row.target === "pricebook"
      ? (await savePriceBook(clientId, next.priceBook, { name: decision.by, note })).version
      : (await savePlaybook(clientId, next.playbook, { name: decision.by, note })).version;

  await prisma.tuneProposal.update({
    where: { id: row.id },
    data: {
      status: "APPLIED",
      decidedBy: decision.by,
      decidedAt: new Date(),
      filledValue: decision.value ?? null,
      resultVersion: version,
    },
  });

  return { applied: true, version };
}

/** The month's read-out, assembled from what is on the record. */
export async function monthlyReadOut(clientId: string, since: Date) {
  const [calls, applied] = await Promise.all([
    gradedCallsFor(clientId, since),
    prisma.tuneProposal.findMany({
      where: { clientId, status: "APPLIED", decidedAt: { gte: since } },
      orderBy: { decidedAt: "desc" },
      select: { title: true, decidedAt: true },
    }),
  ]);

  const previous = await prisma.voiceCall.aggregate({
    where: {
      clientId,
      gradedAt: { not: null },
      startedAt: { lt: since, gte: new Date(since.getTime() - (Date.now() - since.getTime())) },
    },
    _avg: { gradeScore: true },
  });

  return readOut({
    calls,
    applied: applied.map((a) => ({ title: a.title, at: a.decidedAt ?? new Date() })),
    previousAverage: previous._avg.gradeScore != null ? Math.round(previous._avg.gradeScore) : undefined,
  });
}
