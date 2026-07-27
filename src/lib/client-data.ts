import { prisma } from "@/lib/prisma";
import { startOfMonthUTC } from "@/lib/utils";
import { getCapacityGrants } from "@/lib/entitlements";
import { applyCapacity } from "@/lib/capacity";
import type { ProductLineKey } from "@prisma/client";

/** Ensure a CLIENT user has a ClientProfile tenant row (created on first visit). */
export async function ensureClientProfile(userId: string, fallbackName?: string) {
  const existing = await prisma.clientProfile.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.clientProfile.create({
    data: { userId, businessName: fallbackName ?? "My Business" },
  });
}

export async function getClientOverview(clientId: string) {
  const [subs, agentRunsThisPeriod, adAccounts, openRequests] = await Promise.all([
    prisma.subscription.findMany({ where: { clientId }, include: { plan: true } }),
    prisma.usageRecord.count({ where: { clientId, lineKey: "AI_AGENTS", periodStart: startOfMonthUTC() } }),
    prisma.adAccount.findMany({ where: { clientId }, select: { id: true } }),
    prisma.request.count({ where: { clientId, status: { not: "DELIVERED" } } }),
  ]);

  const agentSub = subs.find((s) => s.lineKey === "AI_AGENTS");
  const adOpsSub = subs.find((s) => s.lineKey === "AD_OPS");

  // Capacity add-ons are folded in here so every surface that shows a limit
  // shows the same one the gate enforces.
  const grants = await getCapacityGrants(clientId);
  const limits = agentSub
    ? applyCapacity(
        {
          unlockedAgents: agentSub.plan.unlockedAgents,
          maxAgents: agentSub.plan.maxAgents,
          maxAgentRunsMonthly: agentSub.plan.maxAgentRunsMonthly,
          maxAdAccounts: agentSub.plan.maxAdAccounts,
        },
        grants,
      )
    : null;

  return {
    subs,
    agentSub,
    adOpsSub,
    agentRunsThisPeriod,
    adAccountCount: adAccounts.length,
    openRequests,
    grants,
    limits,
  };
}

export async function getAdMetrics(clientId: string, days = 30) {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  since.setUTCHours(0, 0, 0, 0);

  const accounts = await prisma.adAccount.findMany({
    where: { clientId },
    include: { metrics: { where: { date: { gte: since } }, orderBy: { date: "asc" } } },
  });

  // Aggregate by date across accounts.
  const byDate = new Map<string, { date: string; spend: number; leads: number; revenue: number; clicks: number; conversions: number }>();
  for (const acc of accounts) {
    for (const m of acc.metrics) {
      const key = m.date.toISOString().slice(0, 10);
      const row = byDate.get(key) ?? { date: key, spend: 0, leads: 0, revenue: 0, clicks: 0, conversions: 0 };
      row.spend += m.spend;
      row.leads += m.leads;
      row.revenue += m.revenue;
      row.clicks += m.clicks;
      row.conversions += m.conversions;
      byDate.set(key, row);
    }
  }
  const series = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));

  const totals = series.reduce(
    (acc, r) => {
      acc.spend += r.spend;
      acc.leads += r.leads;
      acc.revenue += r.revenue;
      return acc;
    },
    { spend: 0, leads: 0, revenue: 0 },
  );

  const cpl = totals.leads > 0 ? totals.spend / totals.leads : 0; // cents per lead
  const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;

  return { accounts, series, totals, cpl, roas };
}

export function lineActive(status?: string) {
  return status === "ACTIVE" || status === "TRIALING";
}

export type { ProductLineKey };
