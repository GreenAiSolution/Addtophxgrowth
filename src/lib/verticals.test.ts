import { describe, it, expect } from "vitest";
import {
  VERTICAL_PACKS,
  verticalByKey,
  verticalForIndustry,
  resolveVertical,
  applyVertical,
  allOverrideKeys,
  knownModuleKeys,
} from "@/lib/verticals";
import { blueprintFor } from "@/lib/systems";

describe("vertical packs", () => {
  it("has unique keys", () => {
    const keys = VERTICAL_PACKS.map((v) => v.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("never overrides a module that does not exist", () => {
    // The load-bearing test: rename a module in systems.ts and this fails
    // loudly rather than silently dropping a pack's copy on the floor.
    const known = knownModuleKeys();
    for (const key of allOverrideKeys()) {
      expect(known.has(key), `pack overrides unknown module "${key}"`).toBe(true);
    }
  });

  it("only overrides ASSET bodies and PLAYBOOK prompts", () => {
    const command = blueprintFor("command")!;
    const byKey = new Map(command.modules.map((m) => [m.key, m]));
    for (const pack of VERTICAL_PACKS) {
      for (const key of Object.keys(pack.assetBodies)) {
        expect(byKey.get(key)?.kind, `${pack.key}/${key}`).toBe("ASSET");
      }
      for (const key of Object.keys(pack.playbookPrompts)) {
        expect(byKey.get(key)?.kind, `${pack.key}/${key}`).toBe("PLAYBOOK");
      }
    }
  });

  it("fills in all three assets for every pack", () => {
    // A pack that only tunes some of the assets ships a client a mix of
    // industry-specific and generic documents, which reads as unfinished.
    for (const pack of VERTICAL_PACKS) {
      expect(Object.keys(pack.assetBodies).sort(), pack.key).toEqual([
        "asset-escalation-matrix",
        "asset-qualification-rubric",
        "asset-voice-profile",
      ]);
    }
  });

  it("gives every pack enough substance to sell a landing page", () => {
    for (const pack of VERTICAL_PACKS) {
      expect(pack.painPoints.length, pack.key).toBeGreaterThanOrEqual(3);
      expect(pack.objections.length, pack.key).toBeGreaterThanOrEqual(3);
      expect(pack.headline.length, pack.key).toBeGreaterThan(20);
      expect(pack.promise.length, pack.key).toBeGreaterThan(40);
      expect(pack.typicalJobValueCents, pack.key).toBeGreaterThan(0);
    }
  });

  it("gives every pack a sane re-approach interval for The Comeback", () => {
    for (const pack of VERTICAL_PACKS) {
      // At least monthly-floor, at most a couple of years — a pack outside this
      // is almost certainly a typo, and it drives real customer outreach.
      expect(pack.serviceIntervalDays, pack.key).toBeGreaterThanOrEqual(30);
      expect(pack.serviceIntervalDays, pack.key).toBeLessThanOrEqual(1095);
    }
  });
});

describe("matching", () => {
  it("matches an industry string to a pack", () => {
    expect(verticalForIndustry("Commercial Roofing")?.key).toBe("roofing");
    expect(verticalForIndustry("HVAC & Plumbing")?.key).toBe("hvac");
    expect(verticalForIndustry("Underwater basket weaving")).toBeUndefined();
    expect(verticalForIndustry(null)).toBeUndefined();
  });

  it("lets an explicit choice beat the industry guess", () => {
    const resolved = resolveVertical({ verticalKey: "legal", industry: "roofing" });
    expect(resolved?.key).toBe("legal");
  });

  it("falls back to the industry guess when nothing is chosen", () => {
    expect(resolveVertical({ verticalKey: null, industry: "dental" })?.key).toBe("dental");
  });

  it("returns undefined for an unknown key rather than throwing", () => {
    expect(verticalByKey("not-a-trade")).toBeUndefined();
  });
});

describe("applyVertical", () => {
  const command = blueprintFor("command")!;
  const rubric = command.modules.find((m) => m.key === "asset-qualification-rubric")!;
  const scoreInbound = command.modules.find((m) => m.key === "playbook-score-inbound")!;
  const agent = command.modules.find((m) => m.kind === "AGENT")!;
  const roofing = verticalByKey("roofing")!;

  it("swaps in the pack's asset body", () => {
    const out = applyVertical(rubric, roofing);
    expect(out.body).toContain("insurance claim filed");
    expect(out.body).not.toBe(rubric.body);
  });

  it("swaps in the pack's playbook prompt", () => {
    const out = applyVertical(scoreInbound, roofing);
    expect(out.prompt).toContain("claim job or a cash job");
  });

  it("never changes identity or delivery", () => {
    const out = applyVertical(rubric, roofing);
    expect(out.key).toBe(rubric.key);
    expect(out.kind).toBe(rubric.kind);
    expect(out.delivery).toBe(rubric.delivery);
  });

  it("leaves agents and integrations untouched", () => {
    expect(applyVertical(agent, roofing)).toBe(agent);
  });

  it("is a no-op without a pack", () => {
    expect(applyVertical(rubric, undefined)).toBe(rubric);
  });

  it("leaves modules a pack has no opinion about alone", () => {
    const untouched = command.modules.find((m) => m.key === "playbook-weekly-review")!;
    expect(applyVertical(untouched, roofing)).toBe(untouched);
  });
});
