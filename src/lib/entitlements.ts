import { prisma } from "@/lib/prisma";
import { startOfMonthUTC } from "@/lib/utils";
import { agentBySlug } from "@/lib/agents";
import type { ProductLineKey } from "@prisma/client";

/**
 * Feature gating. Subscription rows (kept in sync by the Stripe webhook) are the
 * single source of truth. These helpers answer: is the line active? is this
 * agent unlocked? how many runs remain this billing period?
 */

const ACTIVE_STATUSES = ["ACTIVE", "TRIALING"] as const;

export async function getActiveSubscription(clientId: string, lineKey: ProductLineKey) {
  const sub = await prisma.subscription.findUnique({
    where: { clientId_lineKey: { clientId, lineKey } },
    include: { plan: true },
  });
  if (!sub || !ACTIVE_STATUSES.includes(sub.status as (typeof ACTIVE_STATUSES)[number])) {
    return null;
  }
  return sub;
}

export interface RunAvailability {
  allowed: boolean;
  reason?: "NO_SUBSCRIPTION" | "AGENT_LOCKED" | "LIMIT_REACHED";
  used: number;
  limit: number | null; // null = unlimited
  remaining: number | null;
  planName?: string;
}

/**
 * Whether the client may run a given agent right now, plus the usage meter.
 * Callers MUST check `allowed` before invoking the Anthropic API.
 */
export async function checkAgentRun(
  clientId: string,
  agentSlug: string,
): Promise<RunAvailability> {
  const sub = await getActiveSubscription(clientId, "AI_AGENTS");

  const periodStart = sub?.currentPeriodStart ?? startOfMonthUTC();
  const used = await prisma.usageRecord.count({
    where: { clientId, lineKey: "AI_AGENTS", periodStart },
  });

  if (!sub) {
    return { allowed: false, reason: "NO_SUBSCRIPTION", used, limit: 0, remaining: 0 };
  }

  const agent = agentBySlug(agentSlug);
  const unlocked = sub.plan.unlockedAgents;
  if (!agent || !unlocked.includes(agentSlug)) {
    return {
      allowed: false,
      reason: "AGENT_LOCKED",
      used,
      limit: sub.plan.maxAgentRunsMonthly,
      remaining: sub.plan.maxAgentRunsMonthly == null ? null : Math.max(0, sub.plan.maxAgentRunsMonthly - used),
      planName: sub.plan.name,
    };
  }

  const limit = sub.plan.maxAgentRunsMonthly;
  if (limit != null && used >= limit) {
    return { allowed: false, reason: "LIMIT_REACHED", used, limit, remaining: 0, planName: sub.plan.name };
  }

  return {
    allowed: true,
    used,
    limit,
    remaining: limit == null ? null : limit - used,
    planName: sub.plan.name,
  };
}

/** Record one completed run against the meter. */
export async function recordRun(
  clientId: string,
  agentSlug: string,
  tokensIn: number,
  tokensOut: number,
) {
  const sub = await getActiveSubscription(clientId, "AI_AGENTS");
  const periodStart = sub?.currentPeriodStart ?? startOfMonthUTC();
  await prisma.usageRecord.create({
    data: { clientId, lineKey: "AI_AGENTS", agentSlug, periodStart, tokensIn, tokensOut },
  });
}
