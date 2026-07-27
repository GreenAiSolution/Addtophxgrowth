/**
 * Agency signals — what the desk needs to look at today.
 *
 * DIRECTION
 *   The platform grew three unattended systems (the night shift, the Spend
 *   Watch, system memory) and the agency console could see none of them. If a
 *   client rang and said "your alert flagged something", nobody here could
 *   look it up. Worse, the failure modes were invisible: a brief that errored,
 *   a sweep that stopped running, an account whose checks are all asleep for
 *   want of a target.
 *
 * BLUEPRINTS
 *   `rankSignals` is pure — facts in, a prioritised list out — so the triage
 *   order is testable without a database. `collectSignals` does the reads.
 *
 *   The ordering rule that matters: things that are silently broken outrank
 *   things that are loudly wrong. A CRITICAL alert is already emailing the
 *   client; a Spend Watch that stopped running three days ago is telling
 *   nobody anything, and that is far more dangerous.
 */

export type SignalKind =
  | "WATCH_STALLED"
  | "BRIEF_FAILED"
  | "CRITICAL_ALERT"
  | "LEADS_UNSCORED"
  | "LEADS_GOING_COLD"
  | "CHECKS_ASLEEP"
  | "REQUEST_WAITING";

export type SignalSeverity = "URGENT" | "ATTENTION" | "FYI";

export interface Signal {
  kind: SignalKind;
  severity: SignalSeverity;
  clientId: string;
  businessName: string;
  title: string;
  detail: string;
  /** Where in the admin console to go. */
  path: string;
}

export interface ClientFacts {
  clientId: string;
  businessName: string;
  /** Hours since the last completed Spend Watch sweep. null = never / not applicable. */
  hoursSinceSweep: number | null;
  /** True when this client's tier should be sweeping at all. */
  watchExpected: boolean;
  failedBriefs: number;
  criticalAlerts: number;
  /** Leads sitting at NEW. */
  unscoredLeads: number;
  /** Hours the oldest unscored lead has waited. */
  oldestUnscoredHours: number | null;
  /** Scored, qualified, untouched past the stale threshold. */
  staleLeads: number;
  /** Ad accounts with at least one check disabled for want of a target. */
  accountsMissingTargets: number;
  /** Open requests older than a working day. */
  agingRequests: number;
}

/** A sweep this far behind schedule is broken, not late. */
export const SWEEP_STALLED_HOURS = 48;
/** An unscored lead older than this on a tier that auto-scores means something failed. */
export const UNSCORED_ALARM_HOURS = 36;

const SEVERITY_ORDER: Record<SignalSeverity, number> = { URGENT: 0, ATTENTION: 1, FYI: 2 };

/**
 * Pure: turn per-client facts into a triage list, most dangerous first.
 *
 * Deliberately says nothing about a healthy client. A dashboard that lists
 * every tenant with a green tick is a dashboard nobody scans.
 */
export function rankSignals(facts: ClientFacts[]): Signal[] {
  const out: Signal[] = [];

  for (const f of facts) {
    const admin = `/admin/clients/${f.clientId}`;

    // Silently broken beats loudly wrong: nobody is being told about these.
    if (f.watchExpected && (f.hoursSinceSweep == null || f.hoursSinceSweep >= SWEEP_STALLED_HOURS)) {
      out.push({
        kind: "WATCH_STALLED",
        severity: "URGENT",
        clientId: f.clientId,
        businessName: f.businessName,
        title: "Spend Watch has stopped running",
        detail:
          f.hoursSinceSweep == null
            ? "No sweep has ever completed for this client. Their ad accounts are unwatched."
            : `Last sweep was ${Math.round(f.hoursSinceSweep / 24)} days ago. Their ad accounts are unwatched.`,
        path: admin,
      });
    }

    if (f.failedBriefs > 0) {
      out.push({
        kind: "BRIEF_FAILED",
        severity: "URGENT",
        clientId: f.clientId,
        businessName: f.businessName,
        title: `${f.failedBriefs} morning brief${f.failedBriefs === 1 ? "" : "s"} failed`,
        detail: "The client saw nothing that morning and was not told why.",
        path: admin,
      });
    }

    if (f.watchExpected === false && f.unscoredLeads > 0 && (f.oldestUnscoredHours ?? 0) >= UNSCORED_ALARM_HOURS) {
      // A tier with no night shift is expected to have unscored leads — but not
      // ones this old. Worth a nudge from the agency.
      out.push({
        kind: "LEADS_UNSCORED",
        severity: "ATTENTION",
        clientId: f.clientId,
        businessName: f.businessName,
        title: `${f.unscoredLeads} lead${f.unscoredLeads === 1 ? "" : "s"} never scored`,
        detail: `Oldest has waited ${Math.round((f.oldestUnscoredHours ?? 0) / 24)} days. Their tier has no night shift — a good upgrade conversation.`,
        path: admin,
      });
    } else if (f.unscoredLeads > 0 && (f.oldestUnscoredHours ?? 0) >= UNSCORED_ALARM_HOURS) {
      out.push({
        kind: "LEADS_UNSCORED",
        severity: "URGENT",
        clientId: f.clientId,
        businessName: f.businessName,
        title: `${f.unscoredLeads} lead${f.unscoredLeads === 1 ? "" : "s"} unscored on an auto-scoring tier`,
        detail: `Oldest has waited ${Math.round((f.oldestUnscoredHours ?? 0) / 24)} days. The night shift should have picked these up — check the cron.`,
        path: admin,
      });
    }

    if (f.criticalAlerts > 0) {
      out.push({
        kind: "CRITICAL_ALERT",
        severity: "ATTENTION",
        clientId: f.clientId,
        businessName: f.businessName,
        title: `${f.criticalAlerts} critical Spend Watch alert${f.criticalAlerts === 1 ? "" : "s"} open`,
        detail: "The client has been emailed. Worth a call if it's still open tomorrow.",
        path: admin,
      });
    }

    if (f.staleLeads > 0) {
      out.push({
        kind: "LEADS_GOING_COLD",
        severity: "ATTENTION",
        clientId: f.clientId,
        businessName: f.businessName,
        title: `${f.staleLeads} qualified lead${f.staleLeads === 1 ? "" : "s"} going cold`,
        detail: "Scored well and nobody has worked them. This is what churn looks like early.",
        path: admin,
      });
    }

    if (f.agingRequests > 0) {
      out.push({
        kind: "REQUEST_WAITING",
        severity: "ATTENTION",
        clientId: f.clientId,
        businessName: f.businessName,
        title: `${f.agingRequests} request${f.agingRequests === 1 ? "" : "s"} waiting over a day`,
        detail: "Unanswered requests are the most common reason a retainer gets cancelled.",
        path: `/admin/requests`,
      });
    }

    if (f.accountsMissingTargets > 0) {
      out.push({
        kind: "CHECKS_ASLEEP",
        severity: "FYI",
        clientId: f.clientId,
        businessName: f.businessName,
        title: `${f.accountsMissingTargets} ad account${f.accountsMissingTargets === 1 ? "" : "s"} with checks asleep`,
        detail: "No budget or target set, so pacing and CPA checks are skipped. Ask on the next call.",
        path: admin,
      });
    }
  }

  return out.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.businessName.localeCompare(b.businessName),
  );
}

/**
 * Gather the facts for every client. One query per concern rather than a query
 * per client — an agency with 50 clients shouldn't produce 300 round trips.
 */
export async function collectSignals(now = new Date()): Promise<{
  signals: Signal[];
  clientCount: number;
}> {
  // Imported here rather than at module scope so the pure half of this file
  // stays importable from tests without pulling in Prisma.
  const { prisma } = await import("@/lib/prisma");
  const { watchCadenceFor } = await import("@/lib/spend-watch");
  const { STALE_AFTER_HOURS } = await import("@/lib/night-shift");

  const dayAgo = new Date(now.getTime() - 24 * 3_600_000);
  const staleBefore = new Date(now.getTime() - STALE_AFTER_HOURS * 3_600_000);

  const [clients, subs, alerts, failedBriefs, leadRows, requests, accounts] = await Promise.all([
    prisma.clientProfile.findMany({
      select: { id: true, businessName: true, spendWatchLastRunAt: true },
    }),
    prisma.subscription.findMany({
      where: { status: { in: ["ACTIVE", "TRIALING"] } },
      select: { clientId: true, lineKey: true, planKey: true },
    }),
    prisma.adAlert.groupBy({
      by: ["clientId"],
      where: { severity: "CRITICAL", status: { in: ["OPEN", "ACKNOWLEDGED"] } },
      _count: true,
    }),
    prisma.briefRun.groupBy({
      by: ["clientId"],
      where: { status: "FAILED" },
      _count: true,
    }),
    prisma.lead.findMany({
      where: { status: { in: ["NEW", "SCORED", "WORKING"] } },
      select: { clientId: true, status: true, createdAt: true, scoredAt: true, score: true },
    }),
    prisma.request.groupBy({
      by: ["clientId"],
      where: { status: "OPEN", createdAt: { lt: dayAgo } },
      _count: true,
    }),
    prisma.adAccount.findMany({
      select: {
        clientId: true,
        monthlyBudgetCents: true,
        targetCpaCents: true,
        targetRoas: true,
      },
    }),
  ]);

  const countBy = (rows: { clientId: string; _count: number }[]) =>
    new Map(rows.map((r) => [r.clientId, r._count]));

  const criticalByClient = countBy(alerts);
  const failedByClient = countBy(failedBriefs);
  const agingByClient = countBy(requests);

  const adOpsPlan = new Map(
    subs.filter((s) => s.lineKey === "AD_OPS").map((s) => [s.clientId, s.planKey]),
  );

  const missingTargets = new Map<string, number>();
  for (const a of accounts) {
    const incomplete =
      a.monthlyBudgetCents == null || a.targetCpaCents == null || a.targetRoas == null;
    if (incomplete) missingTargets.set(a.clientId, (missingTargets.get(a.clientId) ?? 0) + 1);
  }

  const unscored = new Map<string, { count: number; oldest: Date }>();
  const stale = new Map<string, number>();
  for (const l of leadRows) {
    if (l.status === "NEW") {
      const row = unscored.get(l.clientId);
      if (!row || l.createdAt < row.oldest) {
        unscored.set(l.clientId, { count: (row?.count ?? 0) + 1, oldest: l.createdAt });
      } else {
        row.count += 1;
      }
    } else if ((l.score ?? 0) >= 60 && l.scoredAt && l.scoredAt < staleBefore) {
      stale.set(l.clientId, (stale.get(l.clientId) ?? 0) + 1);
    }
  }

  const facts: ClientFacts[] = clients.map((c) => {
    const u = unscored.get(c.id);
    return {
      clientId: c.id,
      businessName: c.businessName,
      hoursSinceSweep:
        c.spendWatchLastRunAt == null
          ? null
          : (now.getTime() - c.spendWatchLastRunAt.getTime()) / 3_600_000,
      watchExpected: watchCadenceFor(adOpsPlan.get(c.id)) !== null,
      failedBriefs: failedByClient.get(c.id) ?? 0,
      criticalAlerts: criticalByClient.get(c.id) ?? 0,
      unscoredLeads: u?.count ?? 0,
      oldestUnscoredHours: u ? (now.getTime() - u.oldest.getTime()) / 3_600_000 : null,
      staleLeads: stale.get(c.id) ?? 0,
      accountsMissingTargets: missingTargets.get(c.id) ?? 0,
      agingRequests: agingByClient.get(c.id) ?? 0,
    };
  });

  return { signals: rankSignals(facts), clientCount: clients.length };
}

/** Headline for the top of the signals page. */
export function summarizeSignals(signals: Signal[], clientCount: number): string {
  if (clientCount === 0) return "No clients yet.";
  if (signals.length === 0) {
    return `All ${clientCount} client${clientCount === 1 ? "" : "s"} healthy — nothing needs the desk today.`;
  }
  const urgent = signals.filter((s) => s.severity === "URGENT").length;
  const affected = new Set(signals.map((s) => s.clientId)).size;
  return urgent > 0
    ? `${urgent} urgent across ${affected} of ${clientCount} clients.`
    : `${signals.length} to review across ${affected} of ${clientCount} clients.`;
}
