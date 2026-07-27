import { describe, expect, it } from "vitest";
import { AGENTS } from "@/lib/agents";
import { PLANS, planByKey } from "@/lib/catalog";
import {
  SYSTEM_BLUEPRINTS,
  blueprintFor,
  modulesByDelivery,
  playbooksForAgent,
} from "@/lib/systems";
import { planProvisioning } from "@/lib/provisioning";

const AGENT_SLUGS = new Set(AGENTS.map((a) => a.slug));

describe("system blueprints", () => {
  it("covers every plan in the catalog, on both lines", () => {
    // Every tier is a system, not just a price — including ad-ops.
    const allPlans = PLANS.map((p) => p.key).sort();
    const blueprinted = SYSTEM_BLUEPRINTS.map((b) => b.planKey).sort();
    expect(blueprinted).toEqual(allPlans);
  });

  it.each(SYSTEM_BLUEPRINTS)("$planKey has unique module keys", (b) => {
    const keys = b.modules.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(SYSTEM_BLUEPRINTS)("$planKey only references real agents", (b) => {
    for (const m of b.modules) {
      if (m.agentSlug) expect(AGENT_SLUGS.has(m.agentSlug)).toBe(true);
    }
  });

  /**
   * The important one: a blueprint must promise exactly the agents the catalog
   * actually unlocks. Drift here means selling an agent the entitlement gate
   * will refuse to run.
   */
  it.each(SYSTEM_BLUEPRINTS)("$planKey promises exactly the agents it unlocks", (b) => {
    const promised = b.modules
      .filter((m) => m.kind === "AGENT")
      .map((m) => m.agentSlug)
      .sort();
    const unlocked = [...(planByKey(b.planKey)?.unlockedAgents ?? [])].sort();
    expect(promised).toEqual(unlocked);
  });

  it("tiers are supersets — upgrading never removes a system", () => {
    const keysOf = (planKey: string) =>
      new Set(blueprintFor(planKey)!.modules.map((m) => m.key));
    const launch = keysOf("launch");
    const scale = keysOf("scale");
    const command = keysOf("command");

    for (const k of launch) expect(scale.has(k)).toBe(true);
    for (const k of scale) expect(command.has(k)).toBe(true);
    expect(command.size).toBeGreaterThan(scale.size);
    expect(scale.size).toBeGreaterThan(launch.size);
  });

  it.each(SYSTEM_BLUEPRINTS)("$planKey playbooks carry a usable starter prompt", (b) => {
    for (const m of b.modules.filter((x) => x.kind === "PLAYBOOK")) {
      expect(m.prompt?.trim().length ?? 0).toBeGreaterThan(20);
      expect(m.agentSlug).toBeTruthy();
    }
  });

  it.each(SYSTEM_BLUEPRINTS)("$planKey delivers something instantly on payment", (b) => {
    expect(modulesByDelivery(b, "INSTANT").length).toBeGreaterThan(0);
  });

  it("only surfaces playbooks for agents the tier unlocks", () => {
    // Objection Handler is Command-only; Launch must not offer its playbooks.
    expect(playbooksForAgent("launch", "objection-handler")).toHaveLength(0);
    expect(playbooksForAgent("command", "objection-handler").length).toBeGreaterThan(0);
  });
});

describe("provisioning planner", () => {
  it("plans every instant module and skips nothing on a fresh client", () => {
    const plan = planProvisioning("scale", new Set());
    const instant = modulesByDelivery(blueprintFor("scale")!, "INSTANT");
    expect(plan.toCreate).toHaveLength(blueprintFor("scale")!.modules.length);
    expect(plan.toSkip).toHaveLength(0);
    expect(plan.toCreate.filter((m) => m.delivery === "INSTANT")).toHaveLength(instant.length);
  });

  it("is idempotent — a second run creates nothing", () => {
    const blueprint = blueprintFor("launch")!;
    const already = new Set(blueprint.modules.map((m) => m.key));
    const plan = planProvisioning("launch", already);
    expect(plan.toCreate).toHaveLength(0);
    expect(plan.toSkip).toHaveLength(blueprint.modules.length);
  });

  it("upgrading provisions only the newly added modules", () => {
    const launchKeys = new Set(blueprintFor("launch")!.modules.map((m) => m.key));
    const plan = planProvisioning("command", launchKeys);
    const commandCount = blueprintFor("command")!.modules.length;
    expect(plan.toCreate).toHaveLength(commandCount - launchKeys.size);
    expect(plan.toCreate.map((m) => m.key)).not.toContain("agent-lead-qualifier");
    expect(plan.toCreate.map((m) => m.key)).toContain("agent-objection-handler");
  });

  it("provisions ad-ops tiers too", () => {
    const plan = planProvisioning("operate", new Set());
    expect(plan.toCreate.map((m) => m.key)).toContain("adops-monitor-creative-fatigue");
    expect(plan.toCreate.some((m) => m.kind === "MONITOR")).toBe(true);
  });

  it("returns an empty plan for a plan key that does not exist", () => {
    expect(planProvisioning("not-a-plan", new Set()).toCreate).toHaveLength(0);
  });
});
