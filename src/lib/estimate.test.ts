import { describe, it, expect } from "vitest";
import {
  priceEstimate,
  formatMoney,
  formatEstimateText,
  estimateDedupeKey,
  MINIMUM_LINE_KEY,
  type RateItem,
  type EstimateSettings,
} from "@/lib/estimate";

const NOW = new Date("2026-06-01T12:00:00.000Z");

const RATE: RateItem[] = [
  { key: "roof-tile", name: "Tile roof replacement", unit: "square", unitPriceCents: 45_000, minPriceCents: 0, active: true },
  { key: "inspection", name: "Roof inspection", unit: "job", unitPriceCents: 0, minPriceCents: 15_000, active: true },
  { key: "repair", name: "Leak repair", unit: "job", unitPriceCents: 60_000, minPriceCents: 0, active: true },
  { key: "retired", name: "Old service", unit: "job", unitPriceCents: 10_000, minPriceCents: 0, active: false },
];

function settings(over: Partial<EstimateSettings> = {}): EstimateSettings {
  return { taxRatePct: 0, depositPct: 0, minJobCents: null, travelFeeCents: 0, validDays: 30, ...over };
}

describe("formatMoney", () => {
  it("formats cents as USD with thousands separators", () => {
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(45_000)).toBe("$450.00");
    expect(formatMoney(1_234_567)).toBe("$12,345.67");
  });
  it("handles negatives and other currencies", () => {
    expect(formatMoney(-500)).toBe("-$5.00");
    expect(formatMoney(1000, "CAD")).toBe("10.00 CAD");
  });
});

describe("priceEstimate", () => {
  it("prices a straightforward multi-line job", () => {
    const p = priceEstimate({
      rateItems: RATE,
      requests: [{ key: "roof-tile", qty: 20 }, { key: "repair", qty: 1 }],
      settings: settings(),
      now: NOW,
    });
    expect(p.lineItems).toHaveLength(2);
    expect(p.lineItems[0]!.amountCents).toBe(900_000); // 20 × $450
    expect(p.subtotalCents).toBe(960_000);
    expect(p.totalCents).toBe(960_000);
    expect(p.warnings).toHaveLength(0);
  });

  it("applies the per-line minimum price floor", () => {
    // inspection has unit price 0 but a $150 floor.
    const p = priceEstimate({ rateItems: RATE, requests: [{ key: "inspection", qty: 1 }], settings: settings(), now: NOW });
    expect(p.lineItems[0]!.amountCents).toBe(15_000);
    expect(p.subtotalCents).toBe(15_000);
  });

  it("warns and skips an unknown or inactive service rather than guessing", () => {
    const p = priceEstimate({
      rateItems: RATE,
      requests: [{ key: "nope", qty: 1 }, { key: "retired", qty: 2 }, { key: "repair", qty: 1 }],
      settings: settings(),
      now: NOW,
    });
    expect(p.lineItems).toHaveLength(1);
    expect(p.lineItems[0]!.key).toBe("repair");
    expect(p.warnings).toHaveLength(2);
  });

  it("skips non-positive quantities", () => {
    const p = priceEstimate({
      rateItems: RATE,
      requests: [{ key: "repair", qty: 0 }, { key: "roof-tile", qty: -3 }],
      settings: settings(),
      now: NOW,
    });
    expect(p.lineItems).toHaveLength(0);
    expect(p.totalCents).toBe(0);
    expect(p.warnings).toHaveLength(2);
  });

  it("adds a trip charge only when there is real work", () => {
    const withWork = priceEstimate({ rateItems: RATE, requests: [{ key: "repair", qty: 1 }], settings: settings({ travelFeeCents: 5_000 }), now: NOW });
    expect(withWork.travelFeeCents).toBe(5_000);
    expect(withWork.totalCents).toBe(65_000);

    const noWork = priceEstimate({ rateItems: RATE, requests: [{ key: "nope", qty: 1 }], settings: settings({ travelFeeCents: 5_000 }), now: NOW });
    expect(noWork.travelFeeCents).toBe(0);
    expect(noWork.totalCents).toBe(0);
  });

  it("bumps a below-minimum job with a transparent adjustment", () => {
    const p = priceEstimate({
      rateItems: RATE,
      requests: [{ key: "inspection", qty: 1 }], // $150
      settings: settings({ minJobCents: 25_000 }),
      now: NOW,
    });
    expect(p.minimumAdjustmentCents).toBe(10_000); // bump 150 → 250
    expect(p.totalCents).toBe(25_000);
  });

  it("does not bump a job already over the minimum", () => {
    const p = priceEstimate({ rateItems: RATE, requests: [{ key: "repair", qty: 1 }], settings: settings({ minJobCents: 25_000 }), now: NOW });
    expect(p.minimumAdjustmentCents).toBe(0);
    expect(p.totalCents).toBe(60_000);
  });

  it("computes tax on the post-travel, post-minimum base", () => {
    const p = priceEstimate({
      rateItems: RATE,
      requests: [{ key: "repair", qty: 1 }], // 60,000
      settings: settings({ travelFeeCents: 5_000, taxRatePct: 10 }),
      now: NOW,
    });
    // base 65,000 → tax 6,500 → total 71,500
    expect(p.taxCents).toBe(6_500);
    expect(p.totalCents).toBe(71_500);
  });

  it("computes a deposit off the total", () => {
    const p = priceEstimate({ rateItems: RATE, requests: [{ key: "repair", qty: 1 }], settings: settings({ depositPct: 25 }), now: NOW });
    expect(p.depositCents).toBe(15_000); // 25% of 60,000
  });

  it("sets validUntil from the settings window", () => {
    const p = priceEstimate({ rateItems: RATE, requests: [{ key: "repair", qty: 1 }], settings: settings({ validDays: 14 }), now: NOW });
    expect(p.validUntil.toISOString().slice(0, 10)).toBe("2026-06-15");
  });

  it("rounds tax to the nearest cent deterministically", () => {
    const p = priceEstimate({
      rateItems: RATE,
      requests: [{ key: "repair", qty: 1 }], // 60,000
      settings: settings({ taxRatePct: 8.6 }),
      now: NOW,
    });
    // 60,000 × 0.086 = 5,160 exactly
    expect(p.taxCents).toBe(5_160);
  });
});

describe("formatEstimateText", () => {
  const priced = priceEstimate({
    rateItems: RATE,
    requests: [{ key: "roof-tile", qty: 10 }],
    settings: settings({ travelFeeCents: 5_000, taxRatePct: 8.6, depositPct: 25 }),
    now: NOW,
  });

  it("writes the quote in the business's name with the figures", () => {
    const text = formatEstimateText({ businessName: "Ironclad Roofing", customerName: "Dana Reyes", priced });
    expect(text).toContain("Ironclad Roofing");
    expect(text).toContain("Dana");
    expect(text).toContain("Tile roof replacement");
    expect(text).toContain(formatMoney(priced.totalCents));
    expect(text).toContain("Deposit to book");
    // No platform leakage into a customer-facing quote.
    expect(text).not.toMatch(/PHX|Growth Plus|Claude/i);
  });

  it("degrades gracefully with no customer name", () => {
    const text = formatEstimateText({ businessName: "Ironclad", customerName: null, priced });
    expect(text).toContain("Hi there");
  });
});

describe("estimateDedupeKey", () => {
  it("prefers the lead id, so re-quoting a lead updates in place", () => {
    expect(estimateDedupeKey({ leadId: "lead-9", customerEmail: "a@b.com" })).toBe("estimate:lead-9");
  });
  it("falls back to a normalised email, then name", () => {
    expect(estimateDedupeKey({ customerEmail: "  Dana@Example.com " })).toBe("estimate:dana@example.com");
    expect(estimateDedupeKey({ customerName: "Dana Reyes" })).toBe("estimate:dana reyes");
  });
  it("never returns an empty anchor", () => {
    expect(estimateDedupeKey({})).toBe("estimate:adhoc");
  });
});

describe("invariants", () => {
  it("exposes a stable minimum-line key", () => {
    expect(MINIMUM_LINE_KEY).toBe("minimum-job-charge");
  });
});
