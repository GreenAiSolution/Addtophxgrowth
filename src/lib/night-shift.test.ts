import { describe, it, expect } from "vitest";
import {
  cadenceForPlan,
  runDateFor,
  isDue,
  selectLeadsToScore,
  parseScore,
  planBrief,
  STALE_AFTER_HOURS,
  MAX_LEADS_PER_RUN,
  type ScoredLead,
} from "@/lib/night-shift";

function lead(over: Partial<ScoredLead> = {}): ScoredLead {
  return { id: "l1", name: "Dana", company: "Acme", score: 90, tier: "HOT", ageHours: 1, ...over };
}

describe("cadenceForPlan", () => {
  it("gives Command a nightly pass and Scale a weekly one", () => {
    expect(cadenceForPlan("command")).toBe("DAILY");
    expect(cadenceForPlan("scale")).toBe("WEEKLY");
  });

  it("gives Launch nothing — it is the reason to upgrade", () => {
    expect(cadenceForPlan("launch")).toBeNull();
    expect(cadenceForPlan(null)).toBeNull();
    expect(cadenceForPlan("dominate")).toBeNull();
  });
});

describe("isDue", () => {
  // 2026-07-27 is a Monday.
  const monday13 = new Date("2026-07-27T13:00:00Z");

  it("waits until the client's chosen hour", () => {
    expect(isDue({ cadence: "DAILY", now: new Date("2026-07-27T12:59:00Z"), briefHourUtc: 13 })).toBe(false);
    expect(isDue({ cadence: "DAILY", now: monday13, briefHourUtc: 13 })).toBe(true);
  });

  it("produces exactly one daily brief no matter how often the cron fires", () => {
    const already = new Date("2026-07-27T13:00:00Z");
    expect(
      isDue({ cadence: "DAILY", now: new Date("2026-07-27T18:00:00Z"), briefHourUtc: 13, lastRunDate: already }),
    ).toBe(false);
  });

  it("comes back around the next day", () => {
    expect(
      isDue({
        cadence: "DAILY",
        now: new Date("2026-07-28T13:00:00Z"),
        briefHourUtc: 13,
        lastRunDate: new Date("2026-07-27T13:00:00Z"),
      }),
    ).toBe(true);
  });

  it("runs a weekly brief only on its weekday", () => {
    expect(isDue({ cadence: "WEEKLY", now: monday13, briefHourUtc: 13 })).toBe(true);
    expect(isDue({ cadence: "WEEKLY", now: new Date("2026-07-28T13:00:00Z"), briefHourUtc: 13 })).toBe(false);
  });

  it("does not fire a weekly brief twice in the same week", () => {
    expect(
      isDue({
        cadence: "WEEKLY",
        now: monday13,
        briefHourUtc: 13,
        lastRunDate: new Date("2026-07-24T13:00:00Z"),
      }),
    ).toBe(false);
  });
});

describe("runDateFor", () => {
  it("buckets to UTC midnight so the unique constraint holds all day", () => {
    expect(runDateFor(new Date("2026-07-27T23:59:59Z")).toISOString()).toBe("2026-07-27T00:00:00.000Z");
    expect(runDateFor(new Date("2026-07-27T00:00:01Z")).toISOString()).toBe("2026-07-27T00:00:00.000Z");
  });
});

describe("selectLeadsToScore", () => {
  const leads = Array.from({ length: 40 }, (_, i) => ({
    id: `l${i}`,
    createdAt: new Date(Date.UTC(2026, 6, 1, i)),
  }));

  it("caps the batch so one busy night cannot run up an unbounded bill", () => {
    expect(selectLeadsToScore(leads)).toHaveLength(MAX_LEADS_PER_RUN);
  });

  it("takes the ones that have waited longest first", () => {
    expect(selectLeadsToScore(leads, 3).map((l) => l.id)).toEqual(["l0", "l1", "l2"]);
  });

  it("does not mutate the caller's array", () => {
    const input = [...leads];
    selectLeadsToScore(input, 5);
    expect(input.map((l) => l.id)).toEqual(leads.map((l) => l.id));
  });
});

describe("parseScore", () => {
  it("reads a clean fenced JSON reply", () => {
    const out = parseScore('```json\n{"score": 87, "tier": "hot", "reasoning": "Budget confirmed.", "nextAction": "Call today"}\n```');
    expect(out).toEqual({
      score: 87,
      tier: "HOT",
      reasoning: "Budget confirmed.",
      nextAction: "Call today",
    });
  });

  it("reads bare JSON with no fence", () => {
    expect(parseScore('{"score": 42, "tier": "COLD"}').score).toBe(42);
  });

  it("falls back to reading it out of prose", () => {
    const out = parseScore("Score: 73 — this one is WARM, worth a call this week.");
    expect(out.score).toBe(73);
    expect(out.tier).toBe("WARM");
  });

  it("clamps a nonsense score into range", () => {
    expect(parseScore('{"score": 5000}').score).toBe(100);
    expect(parseScore('{"score": -20}').score).toBe(0);
  });

  it("rejects a tier it does not recognise instead of storing junk", () => {
    expect(parseScore('{"score": 50, "tier": "SPICY"}').tier).toBeNull();
  });

  it("keeps the raw text when the reply is unparseable, and never throws", () => {
    // The whole night's work must survive one weird answer.
    const out = parseScore("I'm not sure about this one.");
    expect(out.score).toBeNull();
    expect(out.reasoning).toContain("not sure");
  });

  it("handles an empty reply", () => {
    expect(parseScore("").score).toBeNull();
  });
});

describe("planBrief", () => {
  const base = { businessName: "Acme Roofing", cadence: "DAILY" as const };

  it("puts the hottest leads first, one line each", () => {
    const plan = planBrief({
      ...base,
      scored: [lead({ id: "a", score: 82 }), lead({ id: "b", score: 95, name: "Kim" })],
      open: [],
    });
    expect(plan.sections[0].leadId).toBe("b");
    expect(plan.sections[0].priority).toBe("HIGH");
    expect(plan.sections[0].title).toContain("Kim");
  });

  it("never floods the brief with more than five call-firsts", () => {
    const scored = Array.from({ length: 12 }, (_, i) => lead({ id: `h${i}`, score: 90 }));
    const plan = planBrief({ ...base, scored, open: [] });
    expect(plan.sections.filter((s) => s.leadId)).toHaveLength(5);
  });

  it("flags qualified leads that have gone stale", () => {
    const plan = planBrief({
      ...base,
      scored: [],
      open: [lead({ id: "old", score: 85, ageHours: STALE_AFTER_HOURS + 24 })],
    });
    const stale = plan.sections.find((s) => s.title.includes("going cold"));
    expect(stale?.priority).toBe("HIGH");
  });

  it("does not call a fresh lead stale", () => {
    const plan = planBrief({
      ...base,
      scored: [],
      open: [lead({ score: 85, ageHours: STALE_AFTER_HOURS - 1 })],
    });
    expect(plan.sections.some((s) => s.title.includes("going cold"))).toBe(false);
  });

  it("ignores cold leads when deciding what has gone stale", () => {
    const plan = planBrief({
      ...base,
      scored: [],
      open: [lead({ score: 30, ageHours: 500 })],
    });
    expect(plan.sections.some((s) => s.title.includes("going cold"))).toBe(false);
  });

  it("groups warm leads into the cadence rather than the call list", () => {
    const plan = planBrief({ ...base, scored: [lead({ score: 65 })], open: [] });
    const warm = plan.sections.find((s) => s.title.includes("warm lead"));
    expect(warm?.priority).toBe("MEDIUM");
    expect(plan.sections.some((s) => s.leadId)).toBe(false);
  });

  it("asks for human eyes on leads it could not score", () => {
    const plan = planBrief({ ...base, scored: [lead({ score: null, tier: null })], open: [] });
    expect(plan.sections.some((s) => s.title.includes("human read"))).toBe(true);
  });

  it("says so plainly when there is genuinely nothing to do", () => {
    // A brief that invents urgency to look busy is worse than no brief.
    const plan = planBrief({ ...base, scored: [], open: [] });
    expect(plan.sections).toHaveLength(1);
    expect(plan.sections[0].priority).toBe("LOW");
    expect(plan.headline).toContain("Nothing new");
  });

  it("counts what needs attention in the headline", () => {
    const plan = planBrief({
      ...base,
      scored: [lead({ id: "a", score: 90 }), lead({ id: "b", score: 91 })],
      open: [],
    });
    expect(plan.headline).toContain("2 leads scored");
    expect(plan.headline).toContain("2 need");
  });

  it("says nothing urgent when nothing is", () => {
    const plan = planBrief({ ...base, scored: [lead({ score: 20 })], open: [] });
    expect(plan.headline).toContain("Nothing urgent");
  });

  it("uses the right time window for a weekly brief", () => {
    const plan = planBrief({ ...base, cadence: "WEEKLY", scored: [lead({ score: 30 })], open: [] });
    expect(plan.headline).toContain("this week");
  });

  it("is deterministic", () => {
    const input = { ...base, scored: [lead({ score: 88 })], open: [lead({ id: "o", score: 70, ageHours: 200 })] };
    expect(planBrief(input)).toEqual(planBrief(input));
  });
});
