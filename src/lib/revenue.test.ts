import { describe, it, expect } from "vitest";
import {
  computeRevenue,
  renderRevenueDigest,
  MIN_PIPELINE_EVIDENCE,
  type SubscriptionRow,
  type IssueRow,
  type OpportunityRow,
} from "@/lib/revenue";

const NOW = new Date("2026-03-15T12:00:00Z");
const LAST_MONTH = new Date("2026-02-10T12:00:00Z");
const THIS_MONTH = new Date("2026-03-04T12:00:00Z");

function sub(over: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    lineKey: "AI_AGENTS",
    planKey: "scale",
    status: "ACTIVE",
    priceMonthlyCents: 100_000,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: new Date("2026-04-01T00:00:00Z"),
    createdAt: LAST_MONTH,
    clientId: "c1",
    businessName: "Acme",
    ...over,
  };
}

function issue(over: Partial<IssueRow> = {}): IssueRow {
  return {
    clientId: "c1",
    businessName: "Acme",
    amountCents: 100_000,
    state: "OPEN",
    firstFailedAt: THIS_MONTH,
    recoveredAt: null,
    lostAt: null,
    ...over,
  };
}

function op(over: Partial<OpportunityRow> = {}): OpportunityRow {
  return { stage: "NEW", quotedMonthlyCents: 50_000, createdAt: THIS_MONTH, wonAt: null, ...over };
}

describe("MRR", () => {
  it("counts active, trialing and past-due", () => {
    // PAST_DUE stays in: the subscription exists and the work is still being
    // delivered. Dropping it would understate MRR *and* hide it from at-risk.
    const s = computeRevenue(
      [
        sub({ clientId: "a", status: "ACTIVE" }),
        sub({ clientId: "b", status: "TRIALING" }),
        sub({ clientId: "c", status: "PAST_DUE" }),
      ],
      [],
      [],
      NOW,
    );
    expect(s.mrrCents).toBe(300_000);
    expect(s.activeCount).toBe(3);
  });

  it("excludes cancelled and incomplete", () => {
    const s = computeRevenue(
      [sub({ status: "CANCELED" }), sub({ clientId: "b", status: "INCOMPLETE" })],
      [],
      [],
      NOW,
    );
    expect(s.mrrCents).toBe(0);
  });

  it("splits by product line", () => {
    const s = computeRevenue(
      [sub({ lineKey: "AI_AGENTS" }), sub({ clientId: "b", lineKey: "AD_OPS", priceMonthlyCents: 250_000 })],
      [],
      [],
      NOW,
    );
    expect(s.byLine.AI_AGENTS.mrrCents).toBe(100_000);
    expect(s.byLine.AD_OPS.mrrCents).toBe(250_000);
    expect(s.byLine.AD_OPS.count).toBe(1);
  });
});

describe("at risk", () => {
  it("counts a past-due subscription", () => {
    const s = computeRevenue([sub({ status: "PAST_DUE" })], [], [], NOW);
    expect(s.atRiskCents).toBe(100_000);
    expect(s.failingCents).toBe(100_000);
    expect(s.securedCents).toBe(0);
  });

  it("counts an open payment issue even when Stripe still says active", () => {
    // Stripe does not flip a subscription to past_due on the first decline, so
    // relying on status alone means the first days of a failure are invisible.
    const s = computeRevenue([sub({ status: "ACTIVE" })], [issue()], [], NOW);
    expect(s.failingCents).toBe(100_000);
  });

  it("counts a cancellation", () => {
    const s = computeRevenue([sub({ cancelAtPeriodEnd: true })], [], [], NOW);
    expect(s.cancellingCents).toBe(100_000);
    expect(s.atRiskCents).toBe(100_000);
  });

  it("never double-counts one that is both failing and cancelling", () => {
    // The whole point of the figure is that somebody acts on it. Inflating it
    // is how it stops being believed.
    const s = computeRevenue(
      [sub({ status: "PAST_DUE", cancelAtPeriodEnd: true })],
      [issue()],
      [],
      NOW,
    );
    expect(s.atRiskCents).toBe(100_000);
    expect(s.atRiskCount).toBe(1);
    expect(s.failingCents + s.cancellingCents).toBe(100_000);
  });

  it("ignores an issue that has already been recovered", () => {
    const s = computeRevenue([sub()], [issue({ state: "RECOVERED", recoveredAt: THIS_MONTH })], [], NOW);
    expect(s.atRiskCents).toBe(0);
    expect(s.securedCents).toBe(100_000);
  });

  it("reports nothing at risk as zero, not as absent", () => {
    const s = computeRevenue([sub()], [], [], NOW);
    expect(s.atRiskCents).toBe(0);
    expect(s.securedCents).toBe(s.mrrCents);
  });
});

describe("movement", () => {
  it("counts only subscriptions started this calendar month as new", () => {
    const s = computeRevenue(
      [sub({ createdAt: THIS_MONTH }), sub({ clientId: "b", createdAt: LAST_MONTH })],
      [],
      [],
      NOW,
    );
    expect(s.newThisMonthCents).toBe(100_000);
  });

  it("counts cancellations that ended this month as lost", () => {
    const s = computeRevenue(
      [sub({ status: "CANCELED", currentPeriodEnd: THIS_MONTH, priceMonthlyCents: 70_000 })],
      [],
      [],
      NOW,
    );
    expect(s.lostThisMonthCents).toBe(70_000);
    expect(s.netThisMonthCents).toBe(-70_000);
  });

  it("credits recovery to the month the money actually arrived", () => {
    const s = computeRevenue(
      [sub()],
      [
        issue({ state: "RECOVERED", firstFailedAt: LAST_MONTH, recoveredAt: THIS_MONTH }),
        issue({ state: "RECOVERED", firstFailedAt: LAST_MONTH, recoveredAt: LAST_MONTH }),
      ],
      [],
      NOW,
    );
    expect(s.recoveredThisMonthCount).toBe(1);
    expect(s.recoveredThisMonthCents).toBe(100_000);
  });
});

describe("pipeline", () => {
  it("counts open opportunities and ignores dormant ones", () => {
    // A prospect the ladder gave up on is not forecastable revenue. Counting
    // them is how a pipeline number becomes fiction.
    const s = computeRevenue(
      [],
      [],
      [op(), op({ stage: "WORKING" }), op({ stage: "DORMANT" })],
      NOW,
    );
    expect(s.pipelineCount).toBe(2);
    expect(s.pipelineMonthlyCents).toBe(100_000);
  });

  it("states no win rate below the evidence threshold", () => {
    const resolved = Array.from({ length: MIN_PIPELINE_EVIDENCE - 1 }, () => op({ stage: "WON" }));
    const s = computeRevenue([], [], [op(), ...resolved], NOW);
    expect(s.winRate).toBeNull();
    expect(s.weightedPipelineCents).toBeNull();
  });

  it("weights the pipeline once there is enough evidence", () => {
    const resolved = [
      ...Array.from({ length: 3 }, () => op({ stage: "WON" as const })),
      ...Array.from({ length: 3 }, () => op({ stage: "LOST" as const })),
    ];
    const s = computeRevenue([], [], [op({ quotedMonthlyCents: 100_000 }), ...resolved], NOW);
    expect(s.winRate).toBeCloseTo(0.5);
    expect(s.weightedPipelineCents).toBe(50_000);
  });
});

describe("the digest", () => {
  const money = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;

  it("leads with the number", () => {
    const s = computeRevenue([sub()], [], [], NOW);
    expect(renderRevenueDigest(s, money).split("\n")[0]).toContain("$1,000");
  });

  it("says plainly when nothing is at risk", () => {
    const text = renderRevenueDigest(computeRevenue([sub()], [], [], NOW), money);
    expect(text).toContain("Nothing at risk");
  });

  it("names both halves of the risk", () => {
    const s = computeRevenue(
      [sub({ status: "PAST_DUE" }), sub({ clientId: "b", cancelAtPeriodEnd: true })],
      [],
      [],
      NOW,
    );
    const text = renderRevenueDigest(s, money);
    expect(text).toContain("failing payment");
    expect(text).toContain("cancelling at period end");
  });

  it("admits it has no win rate rather than implying one", () => {
    const s = computeRevenue([], [], [op()], NOW);
    expect(renderRevenueDigest(s, money)).toContain("no win rate yet");
  });

  it("never claims a recovery that did not happen", () => {
    const text = renderRevenueDigest(computeRevenue([sub()], [], [], NOW), money);
    expect(text).not.toContain("Recovered");
  });
});
