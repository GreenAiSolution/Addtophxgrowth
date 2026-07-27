/**
 * Capacity add-ons, made real.
 *
 * DIRECTION
 *   The Capacity group in lib/addons.ts sells three things — one more agent,
 *   5,000 more runs, one more ad account — and until now buying any of them
 *   changed nothing at all. `checkAgentRun` read its limits straight off the
 *   Plan row, so a client could pay $500/mo for "Additional Agent" and hit the
 *   identical upgrade wall. Charging for a product that has no effect is the
 *   worst kind of dead end, and this file is the fix.
 *
 * BLUEPRINTS
 *   `applyCapacity` is pure: plan limits in, grants in, resolved limits out. It
 *   is what every gate now reads. The DB half is one small model
 *   (`ClientEntitlement`) an admin writes once the add-on request is scoped and
 *   billed — same conversation-first flow the rest of the add-ons use.
 *
 * Two rules that matter:
 *   - `null` means unlimited and must stay unlimited. Adding a run pack to an
 *     unlimited plan must not quietly turn it into a 5,000-run cap.
 *   - An expired grant is ignored rather than deleted, so the history of what a
 *     client was given survives for billing questions.
 */

import { ADDONS } from "@/lib/addons";

/** Runs added per Agent Run Pack. Mirrors the add-on's own copy. */
export const RUNS_PER_PACK = 5000;

export const CAPACITY_KEYS = ADDONS.filter((a) => a.group === "capacity").map((a) => a.key);

export interface CapacityGrant {
  addonKey: string;
  quantity: number;
  agentSlug?: string | null;
  expiresAt?: Date | null;
}

export interface PlanLimits {
  unlockedAgents: string[];
  maxAgents: number | null;
  maxAgentRunsMonthly: number | null;
  maxAdAccounts: number | null;
}

export interface ResolvedLimits extends PlanLimits {
  /** What the plan alone would have allowed, for "X of which Y is add-ons" copy. */
  base: PlanLimits;
  /** True when any grant actually changed something. */
  hasGrants: boolean;
}

/** A grant with no end date, or one that hasn't passed yet. */
export function isGrantActive(grant: CapacityGrant, now = new Date()): boolean {
  if (grant.quantity <= 0) return false;
  if (!grant.expiresAt) return true;
  return grant.expiresAt.getTime() > now.getTime();
}

/**
 * Pure: fold active capacity grants onto a plan's limits.
 *
 * Unknown add-on keys are ignored rather than throwing — a grant left over from
 * a retired add-on should quietly stop applying, not break every gate the
 * client hits.
 */
export function applyCapacity(
  plan: PlanLimits,
  grants: CapacityGrant[],
  now = new Date(),
): ResolvedLimits {
  const base: PlanLimits = {
    unlockedAgents: [...plan.unlockedAgents],
    maxAgents: plan.maxAgents,
    maxAgentRunsMonthly: plan.maxAgentRunsMonthly,
    maxAdAccounts: plan.maxAdAccounts,
  };

  const active = grants.filter((g) => isGrantActive(g, now));

  const unlocked = new Set(plan.unlockedAgents);
  let extraAgents = 0;
  let extraRuns = 0;
  let extraAdAccounts = 0;

  for (const g of active) {
    switch (g.addonKey) {
      case "extra-agent": {
        // A grant that doesn't name an agent can't unlock one. Count the seat
        // anyway so the plan's agent cap reflects what was paid for.
        extraAgents += g.quantity;
        if (g.agentSlug && !unlocked.has(g.agentSlug)) unlocked.add(g.agentSlug);
        break;
      }
      case "run-pack":
        extraRuns += g.quantity * RUNS_PER_PACK;
        break;
      case "extra-ad-account":
        extraAdAccounts += g.quantity;
        break;
      default:
        break; // retired or unknown add-on
    }
  }

  // null = unlimited, and unlimited plus anything is still unlimited.
  const addTo = (value: number | null, extra: number) =>
    value == null ? null : value + extra;

  const resolved: ResolvedLimits = {
    base,
    unlockedAgents: [...unlocked],
    maxAgents: addTo(plan.maxAgents, extraAgents),
    maxAgentRunsMonthly: addTo(plan.maxAgentRunsMonthly, extraRuns),
    maxAdAccounts: addTo(plan.maxAdAccounts, extraAdAccounts),
    hasGrants: false,
  };

  resolved.hasGrants =
    resolved.unlockedAgents.length !== base.unlockedAgents.length ||
    resolved.maxAgents !== base.maxAgents ||
    resolved.maxAgentRunsMonthly !== base.maxAgentRunsMonthly ||
    resolved.maxAdAccounts !== base.maxAdAccounts;

  return resolved;
}

/** One line per grant, for the billing page and the admin audit trail. */
export function describeGrant(grant: CapacityGrant): string {
  const addon = ADDONS.find((a) => a.key === grant.addonKey);
  const name = addon?.name ?? grant.addonKey;
  switch (grant.addonKey) {
    case "extra-agent":
      return grant.agentSlug
        ? `${name} — ${grant.agentSlug} unlocked`
        : `${name} — no agent assigned yet`;
    case "run-pack":
      return `${name} — +${(grant.quantity * RUNS_PER_PACK).toLocaleString("en-US")} runs / mo`;
    case "extra-ad-account":
      return `${name} — +${grant.quantity} ad account${grant.quantity === 1 ? "" : "s"}`;
    default:
      return `${name} ×${grant.quantity}`;
  }
}
