import { describe, it, expect } from "vitest";
import {
  rankSignals,
  summarizeSignals,
  HANDOFF_COLD_HOURS,
  SWEEP_STALLED_HOURS,
  UNGRADED_BACKLOG,
  UNSCORED_ALARM_HOURS,
  type ClientFacts,
} from "@/lib/signals";

function facts(over: Partial<ClientFacts> = {}): ClientFacts {
  return {
    clientId: "c1",
    businessName: "Ironclad Roofing",
    hoursSinceSweep: 6,
    watchExpected: true,
    failedBriefs: 0,
    criticalAlerts: 0,
    unscoredLeads: 0,
    oldestUnscoredHours: null,
    staleLeads: 0,
    accountsMissingTargets: 0,
    agingRequests: 0,
    coldHandoffs: 0,
    oldestHandoffHours: null,
    ungradedCalls: 0,
    failedTextBacks: 0,
    callsOnDefaultPlaybook: 0,
    ...over,
  };
}

describe("rankSignals", () => {
  it("says nothing about a healthy client", () => {
    // A board listing every tenant with a green tick is a board nobody scans.
    expect(rankSignals([facts()])).toEqual([]);
  });

  it("returns nothing at all for no clients", () => {
    expect(rankSignals([])).toEqual([]);
  });

  it("flags a Spend Watch that has stalled", () => {
    const s = rankSignals([facts({ hoursSinceSweep: SWEEP_STALLED_HOURS })]);
    expect(s[0].kind).toBe("WATCH_STALLED");
    expect(s[0].severity).toBe("URGENT");
    expect(s[0].detail).toContain("unwatched");
  });

  it("flags a Spend Watch that has never run", () => {
    const s = rankSignals([facts({ hoursSinceSweep: null })]);
    expect(s[0].kind).toBe("WATCH_STALLED");
    expect(s[0].detail).toContain("No sweep has ever completed");
  });

  it("does not complain about a watch on a tier that has none", () => {
    expect(rankSignals([facts({ watchExpected: false, hoursSinceSweep: null })])).toEqual([]);
  });

  it("ranks silent breakage above loud breakage", () => {
    // A critical alert is already emailing the client. A stalled sweep is
    // telling nobody anything, which is the more dangerous state.
    const s = rankSignals([facts({ hoursSinceSweep: null, criticalAlerts: 3 })]);
    expect(s[0].kind).toBe("WATCH_STALLED");
    expect(s[0].severity).toBe("URGENT");
    expect(s[1].kind).toBe("CRITICAL_ALERT");
    expect(s[1].severity).toBe("ATTENTION");
  });

  it("treats unscored leads as urgent when the tier should have scored them", () => {
    const s = rankSignals([
      facts({ watchExpected: true, unscoredLeads: 4, oldestUnscoredHours: UNSCORED_ALARM_HOURS }),
    ]);
    const lead = s.find((x) => x.kind === "LEADS_UNSCORED")!;
    expect(lead.severity).toBe("URGENT");
    expect(lead.detail).toContain("check the cron");
  });

  it("treats the same leads as an upgrade conversation on a manual tier", () => {
    const s = rankSignals([
      facts({ watchExpected: false, unscoredLeads: 4, oldestUnscoredHours: 100 }),
    ]);
    const lead = s.find((x) => x.kind === "LEADS_UNSCORED")!;
    expect(lead.severity).toBe("ATTENTION");
    expect(lead.detail).toContain("upgrade");
  });

  it("ignores unscored leads that have not waited long", () => {
    const s = rankSignals([
      facts({ watchExpected: false, unscoredLeads: 9, oldestUnscoredHours: UNSCORED_ALARM_HOURS - 1 }),
    ]);
    expect(s.filter((x) => x.kind === "LEADS_UNSCORED")).toEqual([]);
  });

  it("flags failed briefs, because the client saw nothing and was told nothing", () => {
    const s = rankSignals([facts({ failedBriefs: 2 })]);
    expect(s[0].kind).toBe("BRIEF_FAILED");
    expect(s[0].severity).toBe("URGENT");
  });

  it("flags leads going cold and aging requests", () => {
    const s = rankSignals([facts({ staleLeads: 5, agingRequests: 2 })]);
    expect(s.map((x) => x.kind).sort()).toEqual(["LEADS_GOING_COLD", "REQUEST_WAITING"]);
  });

  it("keeps sleeping checks at the bottom as an FYI", () => {
    const s = rankSignals([facts({ accountsMissingTargets: 2, criticalAlerts: 1 })]);
    expect(s[s.length - 1].kind).toBe("CHECKS_ASLEEP");
    expect(s[s.length - 1].severity).toBe("FYI");
  });

  it("sorts by severity first and business name second", () => {
    const s = rankSignals([
      facts({ clientId: "b", businessName: "Zulu Roofing", criticalAlerts: 1 }),
      facts({ clientId: "a", businessName: "Alpha HVAC", criticalAlerts: 1 }),
      facts({ clientId: "c", businessName: "Mid Dental", failedBriefs: 1 }),
    ]);
    expect(s.map((x) => x.businessName)).toEqual(["Mid Dental", "Alpha HVAC", "Zulu Roofing"]);
  });

  it("carries a link for every signal", () => {
    const s = rankSignals([
      facts({ hoursSinceSweep: null, criticalAlerts: 1, staleLeads: 1, agingRequests: 1, accountsMissingTargets: 1 }),
    ]);
    expect(s.length).toBeGreaterThan(3);
    for (const sig of s) expect(sig.path.startsWith("/admin"), sig.kind).toBe(true);
  });

  it("is deterministic", () => {
    const input = [facts({ criticalAlerts: 2, staleLeads: 1 })];
    expect(rankSignals(input)).toEqual(rankSignals(input));
  });
});

describe("summarizeSignals", () => {
  it("handles having no clients", () => {
    expect(summarizeSignals([], 0)).toBe("No clients yet.");
  });

  it("says everything is healthy when it is", () => {
    expect(summarizeSignals([], 12)).toContain("All 12 clients healthy");
  });

  it("leads with the urgent count when there is one", () => {
    const s = rankSignals([facts({ hoursSinceSweep: null })]);
    expect(summarizeSignals(s, 10)).toContain("1 urgent");
  });

  it("falls back to a review count when nothing is urgent", () => {
    const s = rankSignals([facts({ criticalAlerts: 1 })]);
    expect(summarizeSignals(s, 10)).toContain("to review");
  });

  it("counts affected clients, not signals", () => {
    const s = rankSignals([
      facts({ clientId: "a", businessName: "A", criticalAlerts: 1, staleLeads: 1 }),
    ]);
    expect(summarizeSignals(s, 10)).toContain("1 of 10 clients");
  });
});

describe("the voice signals", () => {
  it("raises a promised call back that nobody made", () => {
    // The worst failure this platform has: the customer was told, out loud,
    // that a person would ring them.
    const s = rankSignals([
      facts({ coldHandoffs: 3, oldestHandoffHours: HANDOFF_COLD_HOURS + 2 }),
    ]);
    const cold = s.find((x) => x.kind === "CALL_HANDOFF_COLD");
    expect(cold?.severity).toBe("URGENT");
    expect(cold?.title).toMatch(/promised a call back/);
  });

  it("gives a fresh handover time to be picked up", () => {
    const s = rankSignals([facts({ coldHandoffs: 2, oldestHandoffHours: 1 })]);
    expect(s.find((x) => x.kind === "CALL_HANDOFF_COLD")).toBeUndefined();
  });

  it("treats a failed text-back as urgent, because that lead heard nothing", () => {
    const s = rankSignals([facts({ failedTextBacks: 2 })]);
    expect(s.find((x) => x.kind === "TEXTBACK_FAILING")?.severity).toBe("URGENT");
  });

  it("flags real customers being answered by the built-in defaults", () => {
    const s = rankSignals([facts({ callsOnDefaultPlaybook: 9 })]);
    expect(s.find((x) => x.kind === "OPERATOR_UNTUNED")?.severity).toBe("ATTENTION");
  });

  it("only mentions an ungraded backlog once it is actually a backlog", () => {
    expect(
      rankSignals([facts({ ungradedCalls: UNGRADED_BACKLOG - 1 })]).find(
        (x) => x.kind === "CALLS_UNGRADED",
      ),
    ).toBeUndefined();
    expect(
      rankSignals([facts({ ungradedCalls: UNGRADED_BACKLOG })]).find(
        (x) => x.kind === "CALLS_UNGRADED",
      )?.severity,
    ).toBe("FYI");
  });

  it("puts a cold handover above a critical ad alert", () => {
    // Silently broken outranks loudly wrong: the alert already emailed them.
    const s = rankSignals([
      facts({ criticalAlerts: 4, coldHandoffs: 1, oldestHandoffHours: 9 }),
    ]);
    expect(s[0]!.kind).toBe("CALL_HANDOFF_COLD");
  });
});
