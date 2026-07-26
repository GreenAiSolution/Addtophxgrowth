import { prisma } from "@/lib/prisma";
import { startOfMonthUTC } from "@/lib/utils";

/** Aggregate view of every client for the admin console. */
export async function getAdminClientRows() {
  const clients = await prisma.clientProfile.findMany({
    include: {
      user: { select: { email: true, name: true } },
      subscriptions: { include: { plan: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const periodStart = startOfMonthUTC();

  const rows = await Promise.all(
    clients.map(async (c) => {
      const mrr = c.subscriptions
        .filter((s) => s.status === "ACTIVE" || s.status === "TRIALING")
        .reduce((sum, s) => sum + s.plan.priceMonthly, 0);

      const [runs, lastMsg] = await Promise.all([
        prisma.usageRecord.count({ where: { clientId: c.id, lineKey: "AI_AGENTS", periodStart } }),
        prisma.agentMessage.findFirst({
          where: { conversation: { clientId: c.id } },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
      ]);

      return {
        id: c.id,
        businessName: c.businessName,
        email: c.user.email,
        agentsPlan: c.subscriptions.find((s) => s.lineKey === "AI_AGENTS")?.plan.name,
        adOpsPlan: c.subscriptions.find((s) => s.lineKey === "AD_OPS")?.plan.name,
        mrr,
        runs,
        lastActivity: lastMsg?.createdAt ?? c.updatedAt,
        onboarded: Boolean(c.onboardedAt),
      };
    }),
  );

  return rows;
}

export async function getAdminTotals() {
  const [clientCount, activeSubs, openRequests] = await Promise.all([
    prisma.clientProfile.count(),
    prisma.subscription.findMany({
      where: { status: { in: ["ACTIVE", "TRIALING"] } },
      include: { plan: true },
    }),
    prisma.request.count({ where: { status: { not: "DELIVERED" } } }),
  ]);
  const mrr = activeSubs.reduce((s, sub) => s + sub.plan.priceMonthly, 0);
  return { clientCount, mrr, activeSubCount: activeSubs.length, openRequests };
}
