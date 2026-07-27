import { describe, it, expect } from "vitest";
import {
  checkDeliveryGap,
  checkPacing,
  checkCplDrift,
  checkCreativeFatigue,
  checkCpaBreach,
  checkRoasDecline,
  checkAnomaly,
  analyzeAccount,
  summarizeFindings,
  checksForPlan,
  watchCadenceFor,
  isSweepDue,
  dayBucket,
  MONITOR_MODULE_CHECKS,
  MIN_HISTORY_DAYS,
  MIN_LEADS_FOR_TREND,
  type DailyMetric,
  type AdAlertKind,
} from "@/lib/spend-watch";
import { SYSTEM_BLUEPRINTS, blueprintFor } from "@/lib/systems";

const NOW = new Date("2026-07-20T14:00:00Z"); // a Monday, day 20 of 31

/** `days` days of history ending yesterday, each day identical unless overridden. */
function history(days: number, row: Partial<DailyMetric> = {}): DailyMetric[] {
  return Array.from({ length: days }, (_, i) => ({
    date: new Date(dayBucket(NOW).getTime() - (days - i) * 86_400_000),
    spend: 10_000,
    impressions: 5_000,
    clicks: 150,
    leads: 5,
    conversions: 1,
    revenue: 40_000,
    ...row,
  }));
}

/** Override the most recent `n` days. */
function withRecent(rows: DailyMetric[], n: number, patch: Partial<DailyMetric>): DailyMetric[] {
  return rows.map((r, i) => (i >= rows.length - n ? { ...r, ...patch } : r));
}

const ALL: Set<AdAlertKind> = new Set([
  "PACING_OVER",
  "PACING_UNDER",
  "CPL_DRIFT",
  "DELIVERY_GAP",
  "CREATIVE_FATIGUE",
  "CPA_BREACH",
  "ROAS_DECLINE",
  "ANOMALY",
]);

describe("tier wiring", () => {
  it("derives every check from a MONITOR module that actually exists", () => {
    // The page selling the feature and the code running it must not drift.
    const monitorKeys = new Set(
      SYSTEM_BLUEPRINTS.flatMap((b) => b.modules)
        .filter((m) => m.kind === "MONITOR")
        .map((m) => m.key),
    );
    for (const key of Object.keys(MONITOR_MODULE_CHECKS)) {
      expect(monitorKeys.has(key), `no MONITOR module named "${key}"`).toBe(true);
    }
    for (const key of monitorKeys) {
      expect(MONITOR_MODULE_CHECKS[key], `MONITOR module "${key}" runs no check`).toBeDefined();
    }
  });

  it("turns on more checks as the tier climbs", () => {
    const monitor = checksForPlan("monitor");
    const operate = checksForPlan("operate");
    const dominate = checksForPlan("dominate");

    for (const c of monitor) expect(operate.has(c)).toBe(true);
    for (const c of operate) expect(dominate.has(c)).toBe(true);
    expect(dominate.size).toBeGreaterThan(operate.size);
    expect(operate.size).toBeGreaterThan(monitor.size);
  });

  it("gives the agents line no spend watch at all", () => {
    expect(checksForPlan("command").size).toBe(0);
    expect(watchCadenceFor("command")).toBeNull();
    expect(watchCadenceFor(null)).toBeNull();
  });

  it("sweeps daily for the hands-on tiers and weekly for Monitor", () => {
    expect(watchCadenceFor("monitor")).toBe("WEEKLY");
    expect(watchCadenceFor("operate")).toBe("DAILY");
    expect(watchCadenceFor("dominate")).toBe("DAILY");
  });
});

describe("isSweepDue", () => {
  it("waits for the client's hour", () => {
    expect(isSweepDue({ cadence: "DAILY", now: new Date("2026-07-20T12:00:00Z"), hourUtc: 13 })).toBe(false);
    expect(isSweepDue({ cadence: "DAILY", now: NOW, hourUtc: 13 })).toBe(true);
  });

  it("sweeps once a day however often the cron fires", () => {
    expect(
      isSweepDue({
        cadence: "DAILY",
        now: new Date("2026-07-20T20:00:00Z"),
        hourUtc: 13,
        lastRunAt: NOW,
      }),
    ).toBe(false);
  });

  it("holds a weekly sweep to its weekday", () => {
    expect(isSweepDue({ cadence: "WEEKLY", now: NOW, hourUtc: 13 })).toBe(true);
    expect(
      isSweepDue({ cadence: "WEEKLY", now: new Date("2026-07-21T14:00:00Z"), hourUtc: 13 }),
    ).toBe(false);
  });
});

describe("delivery gap", () => {
  it("fires when a spending account goes silent", () => {
    const rows = withRecent(history(20), 2, { spend: 0, impressions: 0, clicks: 0, leads: 0 });
    const f = checkDeliveryGap(rows, NOW);
    expect(f?.severity).toBe("CRITICAL");
    expect(f?.detail).toContain("$100/day");
  });

  it("stays quiet for an account that never spent", () => {
    // Not a gap — just not running. Alerting here would be noise on day one.
    expect(checkDeliveryGap(history(20, { spend: 0 }), NOW)).toBeNull();
  });

  it("stays quiet while spend is still flowing", () => {
    expect(checkDeliveryGap(history(20), NOW)).toBeNull();
  });
});

describe("pacing", () => {
  const rows = history(20, { spend: 10_000 }); // $100/day → $2,000 by day 20

  it("says nothing without a budget rather than inventing one", () => {
    expect(checkPacing(rows, {}, NOW)).toBeNull();
    expect(checkPacing(rows, { monthlyBudgetCents: 0 }, NOW)).toBeNull();
  });

  it("flags overspend and projects the month", () => {
    // Budget $1,000/mo → expected ~$645 by day 20, actual $2,000.
    const f = checkPacing(rows, { monthlyBudgetCents: 100_000 }, NOW);
    expect(f?.kind).toBe("PACING_OVER");
    expect(f?.severity).toBe("CRITICAL");
    expect(f?.detail).toContain("month closes at");
  });

  it("flags underspend as lost volume", () => {
    const f = checkPacing(rows, { monthlyBudgetCents: 1_000_000 }, NOW);
    expect(f?.kind).toBe("PACING_UNDER");
    expect(f?.detail).toContain("lost volume");
  });

  it("stays quiet when pacing is on track", () => {
    // $2,000 by day 20 of 31 → on pace for ~$3,100.
    expect(checkPacing(rows, { monthlyBudgetCents: 310_000 }, NOW)).toBeNull();
  });

  it("refuses to judge pacing in the first days of a month", () => {
    const early = new Date("2026-07-03T14:00:00Z");
    expect(checkPacing(history(20), { monthlyBudgetCents: 100_000 }, early)).toBeNull();
  });
});

describe("cost-per-lead drift", () => {
  it("flags a real climb with the dollar cost attached", () => {
    // Baseline $20/lead; last 7 days $50/lead.
    const rows = withRecent(history(30), 7, { spend: 50_000, leads: 10 });
    const f = checkCplDrift(rows, NOW);
    expect(f?.severity).toBe("CRITICAL");
    expect(f?.title).toContain("up +");
    expect(f?.detail).toContain("extra cost this week");
  });

  it("ignores movement on too few leads", () => {
    // Two leads becoming one is a Tuesday, not a trend.
    const rows = withRecent(history(30, { leads: 1 }), 7, { spend: 50_000, leads: 1 });
    expect(checkCplDrift(rows, NOW)).toBeNull();
  });

  it("requires volume in the baseline too", () => {
    const rows = history(30, { leads: 0 }).map((r, i) =>
      i >= 23 ? { ...r, leads: MIN_LEADS_FOR_TREND } : r,
    );
    expect(checkCplDrift(rows, NOW)).toBeNull();
  });

  it("stays quiet when cost per lead is flat", () => {
    expect(checkCplDrift(history(30), NOW)).toBeNull();
  });

  it("never complains about cost per lead falling", () => {
    const rows = withRecent(history(30), 7, { spend: 2_000, leads: 10 });
    expect(checkCplDrift(rows, NOW)).toBeNull();
  });
});

describe("creative fatigue", () => {
  it("catches click-through decay before cost per lead moves", () => {
    const rows = withRecent(history(30), 7, { clicks: 50 }); // 3% → 1% CTR
    const f = checkCreativeFatigue(rows, NOW);
    expect(f?.kind).toBe("CREATIVE_FATIGUE");
    expect(f?.detail).toContain("Refresh now");
  });

  it("ignores decay on trivial impression volume", () => {
    const rows = withRecent(history(30, { impressions: 50, clicks: 5 }), 7, { clicks: 1 });
    expect(checkCreativeFatigue(rows, NOW)).toBeNull();
  });

  it("stays quiet on healthy creative", () => {
    expect(checkCreativeFatigue(history(30), NOW)).toBeNull();
  });
});

describe("cost-per-sale guardrail", () => {
  it("says nothing without a target", () => {
    expect(checkCpaBreach(history(20), {}, NOW)).toBeNull();
  });

  it("flags a breach against the client's own number", () => {
    // $100/day, 1 sale/day over 14 days → $100 CPA against a $50 target.
    const f = checkCpaBreach(history(20), { targetCpaCents: 5_000 }, NOW);
    expect(f?.severity).toBe("CRITICAL");
    expect(f?.expected).toBe(5_000);
  });

  it("stays quiet inside tolerance", () => {
    expect(checkCpaBreach(history(20), { targetCpaCents: 10_000 }, NOW)).toBeNull();
  });

  it("will not call a breach on a handful of sales", () => {
    const rows = history(20, { conversions: 0 }).map((r, i) =>
      i === 19 ? { ...r, conversions: 1 } : r,
    );
    expect(checkCpaBreach(rows, { targetCpaCents: 100 }, NOW)).toBeNull();
  });
});

describe("return on ad spend", () => {
  it("says nothing without a target", () => {
    expect(checkRoasDecline(history(20), {}, NOW)).toBeNull();
  });

  it("quantifies the gap when meaningfully below target", () => {
    // $400 revenue on $100 spend = 4×, against a 6× target.
    const f = checkRoasDecline(history(20), { targetRoas: 6 }, NOW);
    expect(f?.observed).toBe(4);
    expect(f?.detail).toContain("gap");
  });

  it("stays quiet at or above target", () => {
    expect(checkRoasDecline(history(20), { targetRoas: 4 }, NOW)).toBeNull();
    expect(checkRoasDecline(history(20), { targetRoas: 2 }, NOW)).toBeNull();
  });

  it("does not call a finding on a rounding-error miss", () => {
    // 4× against a 4.05× target is a normal fortnight. Alerting on it teaches
    // the client that the alert feed is noise.
    expect(checkRoasDecline(history(20), { targetRoas: 4.05 }, NOW)).toBeNull();
  });
});

describe("anomaly sweep", () => {
  it("flags a day that looks nothing like the fortnight around it", () => {
    const rows = withRecent(history(20), 1, { spend: 100_000 });
    const f = checkAnomaly(rows, NOW);
    expect(f?.kind).toBe("ANOMALY");
    expect(f?.detail).toContain("10.0×");
  });

  it("ignores ordinary variation", () => {
    const rows = withRecent(history(20), 1, { spend: 13_000 });
    expect(checkAnomaly(rows, NOW)).toBeNull();
  });
});

describe("analyzeAccount", () => {
  it("refuses to judge an account without enough history", () => {
    // A brand new account has no baseline; every "trend" would be invented.
    expect(analyzeAccount(history(MIN_HISTORY_DAYS - 1), { monthlyBudgetCents: 1 }, ALL, NOW)).toEqual([]);
  });

  it("only runs the checks the tier pays for", () => {
    // Data that would trip both a Monitor check and an Operate-only one.
    const rows = withRecent(history(30), 7, { spend: 50_000, leads: 10, clicks: 50 });
    const monitorFindings = analyzeAccount(rows, {}, checksForPlan("monitor"), NOW);
    const dominateFindings = analyzeAccount(rows, {}, checksForPlan("dominate"), NOW);
    expect(monitorFindings.some((f) => f.kind === "CPL_DRIFT")).toBe(true);
    expect(monitorFindings.some((f) => f.kind === "CREATIVE_FATIGUE")).toBe(false);
    expect(dominateFindings.some((f) => f.kind === "CREATIVE_FATIGUE")).toBe(true);
  });

  it("puts critical findings first", () => {
    const rows = withRecent(history(30), 2, { spend: 0, impressions: 0, clicks: 0, leads: 0 });
    const findings = analyzeAccount(rows, { monthlyBudgetCents: 100_000 }, ALL, NOW);
    expect(findings[0].severity).toBe("CRITICAL");
  });

  it("does not pile an underspend complaint on top of a dead account", () => {
    // The gap already explains the underspend; two alerts for one problem is
    // how an alert feed teaches people to ignore it.
    const rows = withRecent(history(30), 2, { spend: 0, impressions: 0, clicks: 0, leads: 0 });
    const findings = analyzeAccount(rows, { monthlyBudgetCents: 10_000_000 }, ALL, NOW);
    expect(findings.some((f) => f.kind === "DELIVERY_GAP")).toBe(true);
    expect(findings.some((f) => f.kind === "PACING_UNDER")).toBe(false);
  });

  it("returns nothing for a healthy account with no targets set", () => {
    expect(analyzeAccount(history(30), {}, ALL, NOW)).toEqual([]);
  });

  it("is deterministic", () => {
    const rows = withRecent(history(30), 7, { spend: 50_000, leads: 10 });
    const targets = { monthlyBudgetCents: 100_000, targetCpaCents: 5_000, targetRoas: 6 };
    expect(analyzeAccount(rows, targets, ALL, NOW)).toEqual(analyzeAccount(rows, targets, ALL, NOW));
  });
});

describe("summarizeFindings", () => {
  it("says so plainly when everything is fine", () => {
    expect(summarizeFindings([], 3)).toContain("nothing needs you");
  });

  it("handles a client with no accounts yet", () => {
    expect(summarizeFindings([], 0)).toContain("No ad accounts");
  });

  it("counts critical separately from the rest", () => {
    const rows = withRecent(history(30), 2, { spend: 0, impressions: 0, clicks: 0, leads: 0 });
    const findings = analyzeAccount(rows, { monthlyBudgetCents: 100_000 }, ALL, NOW);
    expect(summarizeFindings(findings, 1)).toContain("critical");
  });
});

describe("ad-ops blueprints", () => {
  it("covers all three ad-ops tiers", () => {
    for (const key of ["monitor", "operate", "dominate"]) {
      expect(blueprintFor(key), key).toBeDefined();
    }
  });

  it("ad-ops tiers are supersets — upgrading never removes a check", () => {
    const keysOf = (k: string) => new Set(blueprintFor(k)!.modules.map((m) => m.key));
    const monitor = keysOf("monitor");
    const operate = keysOf("operate");
    const dominate = keysOf("dominate");
    for (const k of monitor) expect(operate.has(k)).toBe(true);
    for (const k of operate) expect(dominate.has(k)).toBe(true);
    expect(dominate.size).toBeGreaterThan(operate.size);
  });

  it("promises no AI agents on the ad-ops line", () => {
    for (const key of ["monitor", "operate", "dominate"]) {
      expect(blueprintFor(key)!.modules.filter((m) => m.kind === "AGENT")).toEqual([]);
    }
  });
});
