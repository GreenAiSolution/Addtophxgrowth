import { prisma } from "@/lib/prisma";
import { startOfMonthUTC } from "@/lib/utils";
import { agentBySlug } from "@/lib/agents";
import { applyCapacity, type CapacityGrant, type ResolvedLimits } from "@/lib/capacity";
import type { ProductLineKey } from "@prisma/client";

/**
 * Feature gating. Subscription rows (kept in sync by the Stripe webhook) are the
 * single source of truth for the plan; `ClientEntitlement` rows are folded on
 * top for capacity add-ons a client has actually been granted. These helpers
 * answer: is the line active? is this agent unlocked? how many runs remain this
 * billing period?
 *
 * Nothing here reads a plan's limits directly any more — everything goes
 * through `resolveLimits`, so an add-on someone paid for can never be silently
 * ignored by one gate and honoured by another.
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

/** Capacity grants for a tenant, in the shape the pure resolver expects. */
export async function getCapacityGrants(clientId: string): Promise<CapacityGrant[]> {
  const rows = await prisma.clientEntitlement.findMany({
    where: { clientId },
    select: { addonKey: true, quantity: true, agentSlug: true, expiresAt: true },
  });
  return rows;
}

/**
 * A client's real limits: their plan, plus every active capacity add-on.
 * Returns null when the line has no active subscription.
 */
export async function resolveLimits(
  clientId: string,
  lineKey: ProductLineKey,
): Promise<{ planName: string; planKey: string; limits: ResolvedLimits } | null> {
  const sub = await getActiveSubscription(clientId, lineKey);
  if (!sub) return null;

  const grants = await getCapacityGrants(clientId);
  const limits = applyCapacity(
    {
      unlockedAgents: sub.plan.unlockedAgents,
      maxAgents: sub.plan.maxAgents,
      maxAgentRunsMonthly: sub.plan.maxAgentRunsMonthly,
      maxAdAccounts: sub.plan.maxAdAccounts,
    },
    grants,
  );

  return { planName: sub.plan.name, planKey: sub.planKey, limits };
}

export interface RunAvailability {
  allowed: boolean;
  reason?: "NO_SUBSCRIPTION" | "AGENT_LOCKED" | "LIMIT_REACHED";
  used: number;
  limit: number | null; // null = unlimited
  remaining: number | null;
  planName?: string;
  /** True when a capacity add-on is part of why this is allowed. */
  addonsApplied?: boolean;
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

  // Plan limits plus any capacity add-on this client has been granted.
  const grants = await getCapacityGrants(clientId);
  const resolved = applyCapacity(
    {
      unlockedAgents: sub.plan.unlockedAgents,
      maxAgents: sub.plan.maxAgents,
      maxAgentRunsMonthly: sub.plan.maxAgentRunsMonthly,
      maxAdAccounts: sub.plan.maxAdAccounts,
    },
    grants,
  );

  const limit = resolved.maxAgentRunsMonthly;
  const remaining = limit == null ? null : Math.max(0, limit - used);

  const agent = agentBySlug(agentSlug);
  if (!agent || !resolved.unlockedAgents.includes(agentSlug)) {
    return {
      allowed: false,
      reason: "AGENT_LOCKED",
      used,
      limit,
      remaining,
      planName: sub.plan.name,
      addonsApplied: resolved.hasGrants,
    };
  }

  if (limit != null && used >= limit) {
    return {
      allowed: false,
      reason: "LIMIT_REACHED",
      used,
      limit,
      remaining: 0,
      planName: sub.plan.name,
      addonsApplied: resolved.hasGrants,
    };
  }

  return {
    allowed: true,
    used,
    limit,
    remaining,
    planName: sub.plan.name,
    addonsApplied: resolved.hasGrants,
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
