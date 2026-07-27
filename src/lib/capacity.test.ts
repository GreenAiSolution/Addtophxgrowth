import { describe, it, expect } from "vitest";
import {
  applyCapacity,
  isGrantActive,
  describeGrant,
  CAPACITY_KEYS,
  RUNS_PER_PACK,
  type PlanLimits,
  type CapacityGrant,
} from "@/lib/capacity";
import { planByKey } from "@/lib/catalog";
import { ADDONS } from "@/lib/addons";

const NOW = new Date("2026-07-20T12:00:00Z");

/** Scale: 4 agents, 10,000 runs. */
const SCALE: PlanLimits = {
  unlockedAgents: ["lead-qualifier", "ad-copy-copilot", "follow-up-sequencer", "crm-updater"],
  maxAgents: 4,
  maxAgentRunsMonthly: 10_000,
  maxAdAccounts: null,
};

/** Command: everything, unlimited runs. */
const COMMAND: PlanLimits = {
  unlockedAgents: [
    "lead-qualifier",
    "ad-copy-copilot",
    "follow-up-sequencer",
    "crm-updater",
    "objection-handler",
  ],
  maxAgents: 5,
  maxAgentRunsMonthly: null,
  maxAdAccounts: null,
};

const MONITOR: PlanLimits = {
  unlockedAgents: [],
  maxAgents: null,
  maxAgentRunsMonthly: null,
  maxAdAccounts: 2,
};

function grant(over: Partial<CapacityGrant> = {}): CapacityGrant {
  return { addonKey: "run-pack", quantity: 1, ...over };
}

describe("capacity keys", () => {
  it("covers every add-on in the capacity group", () => {
    // If a fourth capacity add-on is ever added, this fails until the resolver
    // learns what to do with it — rather than silently selling another no-op.
    const group = ADDONS.filter((a) => a.group === "capacity").map((a) => a.key).sort();
    expect([...CAPACITY_KEYS].sort()).toEqual(group);
    expect(group).toEqual(["extra-ad-account", "extra-agent", "run-pack"]);
  });
});

describe("applyCapacity", () => {
  it("changes nothing when there are no grants", () => {
    const r = applyCapacity(SCALE, [], NOW);
    expect(r.maxAgentRunsMonthly).toBe(10_000);
    expect(r.unlockedAgents).toEqual(SCALE.unlockedAgents);
    expect(r.hasGrants).toBe(false);
  });

  it("actually unlocks the agent an extra-agent grant names", () => {
    // The whole point: this used to be a $500/mo no-op.
    const r = applyCapacity(
      SCALE,
      [grant({ addonKey: "extra-agent", agentSlug: "objection-handler" })],
      NOW,
    );
    expect(r.unlockedAgents).toContain("objection-handler");
    expect(r.maxAgents).toBe(5);
    expect(r.hasGrants).toBe(true);
  });

  it("counts the seat even when no agent has been assigned yet", () => {
    const r = applyCapacity(SCALE, [grant({ addonKey: "extra-agent" })], NOW);
    expect(r.maxAgents).toBe(5);
    expect(r.unlockedAgents).toEqual(SCALE.unlockedAgents);
  });

  it("does not double-unlock an agent the plan already includes", () => {
    const r = applyCapacity(
      SCALE,
      [grant({ addonKey: "extra-agent", agentSlug: "lead-qualifier" })],
      NOW,
    );
    expect(r.unlockedAgents.filter((a) => a === "lead-qualifier")).toHaveLength(1);
  });

  it("adds runs, and stacks packs", () => {
    expect(applyCapacity(SCALE, [grant()], NOW).maxAgentRunsMonthly).toBe(10_000 + RUNS_PER_PACK);
    expect(applyCapacity(SCALE, [grant({ quantity: 3 })], NOW).maxAgentRunsMonthly).toBe(
      10_000 + 3 * RUNS_PER_PACK,
    );
  });

  it("stacks multiple separate grants of the same kind", () => {
    const r = applyCapacity(SCALE, [grant(), grant(), grant()], NOW);
    expect(r.maxAgentRunsMonthly).toBe(10_000 + 3 * RUNS_PER_PACK);
  });

  it("keeps unlimited unlimited", () => {
    // Adding a run pack to Command must not turn "unlimited" into 5,000.
    const r = applyCapacity(COMMAND, [grant({ quantity: 4 })], NOW);
    expect(r.maxAgentRunsMonthly).toBeNull();
    expect(r.hasGrants).toBe(false);
  });

  it("adds ad accounts on the ad-ops line", () => {
    const r = applyCapacity(MONITOR, [grant({ addonKey: "extra-ad-account", quantity: 2 })], NOW);
    expect(r.maxAdAccounts).toBe(4);
  });

  it("ignores a grant that has expired", () => {
    const r = applyCapacity(
      SCALE,
      [grant({ expiresAt: new Date("2026-07-19T00:00:00Z") })],
      NOW,
    );
    expect(r.maxAgentRunsMonthly).toBe(10_000);
  });

  it("honours a grant that has not expired yet", () => {
    const r = applyCapacity(
      SCALE,
      [grant({ expiresAt: new Date("2026-08-01T00:00:00Z") })],
      NOW,
    );
    expect(r.maxAgentRunsMonthly).toBe(10_000 + RUNS_PER_PACK);
  });

  it("ignores a zero or negative quantity", () => {
    expect(applyCapacity(SCALE, [grant({ quantity: 0 })], NOW).maxAgentRunsMonthly).toBe(10_000);
    expect(applyCapacity(SCALE, [grant({ quantity: -5 })], NOW).maxAgentRunsMonthly).toBe(10_000);
  });

  it("ignores an add-on key it no longer sells instead of throwing", () => {
    const r = applyCapacity(SCALE, [grant({ addonKey: "retired-thing" })], NOW);
    expect(r.maxAgentRunsMonthly).toBe(10_000);
    expect(r.hasGrants).toBe(false);
  });

  it("always reports what the plan alone would have allowed", () => {
    const r = applyCapacity(SCALE, [grant({ quantity: 2 })], NOW);
    expect(r.base.maxAgentRunsMonthly).toBe(10_000);
    expect(r.maxAgentRunsMonthly).toBe(20_000);
  });

  it("never mutates the plan it was handed", () => {
    const plan: PlanLimits = { ...SCALE, unlockedAgents: [...SCALE.unlockedAgents] };
    applyCapacity(plan, [grant({ addonKey: "extra-agent", agentSlug: "objection-handler" })], NOW);
    expect(plan.unlockedAgents).toEqual(SCALE.unlockedAgents);
    expect(plan.maxAgents).toBe(4);
  });

  it("composes every kind of grant at once", () => {
    const r = applyCapacity(
      SCALE,
      [
        grant({ addonKey: "extra-agent", agentSlug: "objection-handler" }),
        grant({ addonKey: "run-pack", quantity: 2 }),
        grant({ addonKey: "extra-ad-account", quantity: 1 }),
      ],
      NOW,
    );
    expect(r.unlockedAgents).toHaveLength(5);
    expect(r.maxAgentRunsMonthly).toBe(20_000);
    expect(r.maxAdAccounts).toBeNull(); // Scale has no ad-account cap to raise
  });

  it("takes a real catalog plan without adaptation", () => {
    const scale = planByKey("scale")!;
    const r = applyCapacity(
      {
        unlockedAgents: scale.unlockedAgents,
        maxAgents: scale.limits.agents,
        maxAgentRunsMonthly: scale.limits.agentRunsPerMonth,
        maxAdAccounts: scale.limits.adAccounts,
      },
      [grant()],
      NOW,
    );
    expect(r.maxAgentRunsMonthly).toBe(scale.limits.agentRunsPerMonth! + RUNS_PER_PACK);
  });
});

describe("isGrantActive", () => {
  it("treats a missing expiry as open-ended", () => {
    expect(isGrantActive(grant(), NOW)).toBe(true);
  });

  it("is false the moment the expiry passes", () => {
    expect(isGrantActive(grant({ expiresAt: NOW }), NOW)).toBe(false);
  });
});

describe("describeGrant", () => {
  it("says which agent an extra-agent grant unlocked", () => {
    expect(describeGrant(grant({ addonKey: "extra-agent", agentSlug: "objection-handler" })))
      .toContain("objection-handler");
  });

  it("flags an extra-agent grant that still needs assigning", () => {
    expect(describeGrant(grant({ addonKey: "extra-agent" }))).toContain("no agent assigned");
  });

  it("spells out the runs a pack adds", () => {
    expect(describeGrant(grant({ quantity: 2 }))).toContain("10,000 runs");
  });

  it("pluralises ad accounts", () => {
    expect(describeGrant(grant({ addonKey: "extra-ad-account", quantity: 1 }))).toContain("1 ad account");
    expect(describeGrant(grant({ addonKey: "extra-ad-account", quantity: 3 }))).toContain("3 ad accounts");
  });
});
