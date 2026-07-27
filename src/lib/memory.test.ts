import { describe, it, expect } from "vitest";
import {
  computeCalibration,
  renderDigest,
  normalizeObjection,
  MIN_EVIDENCE,
  CONFIDENCE_FLOOR,
  type OutcomeSample,
} from "@/lib/memory";

function sample(over: Partial<OutcomeSample> = {}): OutcomeSample {
  return { outcome: "WON", valueCents: 100_000, scoreAtQualification: 85, ...over };
}

/** n samples in one score band, `wins` of which closed. */
function band(score: number, wins: number, losses: number, over: Partial<OutcomeSample> = {}) {
  return [
    ...Array.from({ length: wins }, () =>
      sample({ outcome: "WON", scoreAtQualification: score, ...over }),
    ),
    ...Array.from({ length: losses }, () =>
      sample({ outcome: "LOST", scoreAtQualification: score, valueCents: 0, ...over }),
    ),
  ];
}

describe("computeCalibration", () => {
  it("says nothing at all from no data", () => {
    expect(computeCalibration([])).toEqual([]);
  });

  it("refuses to state a pattern below the evidence floor", () => {
    // Four deals is a coincidence. The whole product promise is that the system
    // only tells you things that are true, so this is the load-bearing test.
    const facts = computeCalibration(band(85, 4, 0));
    expect(facts).toEqual([]);
  });

  it("states a band's close rate once there is enough evidence", () => {
    const facts = computeCalibration(band(85, 6, 4));
    const hot = facts.find((f) => f.key === "band-80-100");
    expect(hot).toBeDefined();
    expect(hot!.content).toContain("60%");
    expect(hot!.evidenceCount).toBe(10);
  });

  it("raises confidence as evidence accumulates", () => {
    const few = computeCalibration(band(85, 3, 3)).find((f) => f.key === "band-80-100")!;
    const many = computeCalibration(band(85, 10, 10)).find((f) => f.key === "band-80-100")!;
    expect(many.confidence).toBeGreaterThan(few.confidence);
    expect(many.confidence).toBeLessThanOrEqual(1);
  });

  it("catches a rubric whose ladder is inverted", () => {
    // Warm closing better than hot means the scoring bar is wrong — the agents
    // need to know that before they keep trusting their own scores.
    const facts = computeCalibration([...band(85, 2, 8), ...band(70, 8, 2)]);
    const warning = facts.find((f) => f.key === "inverted-ladder");
    expect(warning).toBeDefined();
    expect(warning!.content).toContain("mis-weighted");
  });

  it("stays quiet when the ladder behaves", () => {
    const facts = computeCalibration([...band(85, 8, 2), ...band(70, 3, 7)]);
    expect(facts.find((f) => f.key === "inverted-ladder")).toBeUndefined();
  });

  it("surfaces the objection that keeps killing deals", () => {
    const facts = computeCalibration([
      ...Array.from({ length: 6 }, () =>
        sample({ outcome: "LOST", objection: "Too expensive", valueCents: 0 }),
      ),
      ...band(85, 5, 0),
    ]);
    const objection = facts.find((f) => f.kind === "OBJECTION");
    expect(objection?.key).toBe("too expensive");
    expect(objection?.evidenceCount).toBe(6);
  });

  it("merges objections that differ only in spacing and case", () => {
    const facts = computeCalibration(
      Array.from({ length: 6 }, (_, i) =>
        sample({
          outcome: "LOST",
          valueCents: 0,
          objection: i % 2 === 0 ? "Too  Expensive." : "too expensive",
        }),
      ),
    );
    expect(facts.filter((f) => f.kind === "OBJECTION")).toHaveLength(1);
  });

  it("flags a source only when it diverges from the baseline", () => {
    const facts = computeCalibration([
      ...band(85, 8, 2, { source: "google-ads" }),
      ...band(50, 1, 9, { source: "facebook" }),
    ]);
    const sources = facts.filter((f) => f.kind === "SOURCE");
    expect(sources.map((s) => s.key).sort()).toEqual(["facebook", "google-ads"]);
    expect(sources.find((s) => s.key === "google-ads")!.content).toContain("Prioritise");
    expect(sources.find((s) => s.key === "facebook")!.content).toContain("Qualify them harder");
  });

  it("does not bother mentioning a source that matches the baseline", () => {
    const facts = computeCalibration(band(85, 5, 5, { source: "google-ads" }));
    expect(facts.filter((f) => f.kind === "SOURCE")).toEqual([]);
  });

  it("averages won-deal value and ignores losses", () => {
    const facts = computeCalibration([
      ...Array.from({ length: 5 }, () => sample({ outcome: "WON", valueCents: 200_000 })),
      sample({ outcome: "LOST", valueCents: 0 }),
    ]);
    const value = facts.find((f) => f.kind === "VALUE");
    expect(value?.content).toContain("$2,000");
  });

  it("is deterministic — same input, same facts", () => {
    const input = [...band(85, 7, 3), ...band(70, 6, 4)];
    expect(computeCalibration(input)).toEqual(computeCalibration(input));
  });

  it("never emits a fact below the evidence floor", () => {
    const facts = computeCalibration([...band(85, 9, 1), ...band(50, 2, 1)]);
    for (const f of facts) {
      expect(f.evidenceCount, f.key).toBeGreaterThanOrEqual(MIN_EVIDENCE);
    }
  });
});

describe("renderDigest", () => {
  const solid = { kind: "CALIBRATION", content: "Solid fact.", confidence: 0.8, muted: false };

  it("returns nothing when there is nothing worth saying", () => {
    expect(renderDigest([])).toBe("");
  });

  it("omits facts that have not earned enough confidence", () => {
    const weak = { ...solid, content: "Shaky fact.", confidence: CONFIDENCE_FLOOR - 0.01 };
    expect(renderDigest([weak])).toBe("");
  });

  it("omits anything the client has muted", () => {
    expect(renderDigest([{ ...solid, muted: true }])).toBe("");
  });

  it("includes usable facts and tells the agent how to weigh them", () => {
    const digest = renderDigest([solid]);
    expect(digest).toContain("Solid fact.");
    expect(digest).toContain("their own closed deals");
  });

  it("caps the block so a long history cannot crowd out the prompt", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ ...solid, content: `Fact ${i}.` }));
    const lines = renderDigest(many).split("\n").filter((l) => l.startsWith("•"));
    expect(lines).toHaveLength(12);
  });

  it("puts the best-evidenced facts first", () => {
    const digest = renderDigest([
      { ...solid, content: "Weaker.", confidence: 0.3 },
      { ...solid, content: "Stronger.", confidence: 0.9 },
    ]);
    expect(digest.indexOf("Stronger.")).toBeLessThan(digest.indexOf("Weaker."));
  });
});

describe("normalizeObjection", () => {
  it("collapses case, spacing and trailing punctuation", () => {
    expect(normalizeObjection("  Too   Expensive!! ")).toBe("too expensive");
  });
});
