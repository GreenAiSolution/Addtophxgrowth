import { describe, it, expect } from "vitest";
import { CREATIVE_STAGES, CREATIVE_THESIS, stageSourceLabel } from "@/lib/creative";
import { planByKey } from "@/lib/catalog";

describe("the creative engine", () => {
  it("tells a complete loop", () => {
    expect(CREATIVE_STAGES.map((s) => s.key)).toEqual([
      "write",
      "test",
      "watch",
      "refresh",
      "produce",
    ]);
  });

  it("has unique stage keys", () => {
    const keys = CREATIVE_STAGES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every stage points at something that actually exists", () => {
    // The load-bearing test. This section is a marketing claim about the
    // product; if a module is renamed or an add-on retired, the claim must
    // break loudly here rather than become a quiet lie on the landing page.
    for (const stage of CREATIVE_STAGES) {
      expect(stageSourceLabel(stage), `${stage.key} → ${JSON.stringify(stage.source)}`).not.toBeNull();
    }
  });

  it("only claims tiers we sell", () => {
    for (const stage of CREATIVE_STAGES) {
      expect(planByKey(stage.availableFrom), stage.key).toBeDefined();
    }
  });

  it("gives every stage a promise and a reason, not just a name", () => {
    for (const stage of CREATIVE_STAGES) {
      expect(stage.name.length, stage.key).toBeGreaterThan(2);
      expect(stage.promise.length, stage.key).toBeGreaterThan(30);
      // The rationale is what separates this from a feature list — it has to
      // actually argue something.
      expect(stage.rationale.length, stage.key).toBeGreaterThan(80);
    }
  });

  it("resolves each source to a human-readable label", () => {
    const labels = CREATIVE_STAGES.map((s) => stageSourceLabel(s));
    expect(labels).toContain("Ad Copy Co-Pilot (MUSE-9)");
    expect(labels).toContain("Creative Fatigue Radar");
    expect(labels).toContain("Creative Studio");
  });

  it("returns null rather than inventing a label for a missing source", () => {
    expect(
      stageSourceLabel({
        key: "x",
        name: "X",
        promise: "…",
        rationale: "…",
        source: { kind: "MODULE", key: "not-a-module" },
        availableFrom: "scale",
      }),
    ).toBeNull();
    expect(
      stageSourceLabel({
        key: "y",
        name: "Y",
        promise: "…",
        rationale: "…",
        source: { kind: "AGENT", slug: "not-an-agent" },
        availableFrom: "scale",
      }),
    ).toBeNull();
  });
});

describe("the thesis", () => {
  it("makes an argument rather than a boast", () => {
    expect(CREATIVE_THESIS.headline.length).toBeGreaterThan(15);
    expect(CREATIVE_THESIS.body.length).toBeGreaterThan(150);
  });

  it("frames creative against media buying, which is the actual point", () => {
    const text = `${CREATIVE_THESIS.headline} ${CREATIVE_THESIS.body}`.toLowerCase();
    expect(text).toContain("media buying");
    expect(text).toContain("creative");
  });
});
