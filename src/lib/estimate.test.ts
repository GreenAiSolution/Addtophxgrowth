import { describe, it, expect } from "vitest";
import { computeEstimate, formatCents, formatRange, RATE_CARDS, rateCardFor } from "@/lib/estimate";

describe("computeEstimate", () => {
  it("prices a quantity-based line item deterministically", () => {
    // 2200 sq ft × $450–$950 = $990,000–$2,090,000
    const r = computeEstimate({ verticalKey: "roofing", jobType: "roof replacement", quantity: 2200 });
    expect(r.priceLowCents).toBe(2200 * 450);
    expect(r.priceHighCents).toBe(2200 * 950);
    expect(r.confidence).toBe("RATE_CARD");
    expect(r.priceLowCents).toBeLessThan(r.priceHighCents);
  });

  it("falls back to a default quantity when none is given", () => {
    const withQty = computeEstimate({ verticalKey: "roofing", jobType: "roof replacement", quantity: 2200 });
    const withoutQty = computeEstimate({ verticalKey: "roofing", jobType: "roof replacement" });
    expect(withoutQty.quantity).toBeGreaterThan(0);
    expect(withoutQty.basis).toMatch(/typical job size/);
    expect(withQty.confidence).toBe(withoutQty.confidence);
  });

  it("prices a flat line item without multiplying by quantity", () => {
    const r = computeEstimate({ verticalKey: "hvac", jobType: "ac repair", quantity: 500 });
    expect(r.quantity).toBe(1);
    expect(r.priceLowCents).toBe(15_000);
    expect(r.priceHighCents).toBe(90_000);
  });

  it("applies the emergency multiplier without inverting the range", () => {
    const standard = computeEstimate({ verticalKey: "hvac", jobType: "ac repair" });
    const emergency = computeEstimate({ verticalKey: "hvac", jobType: "ac repair", urgency: "EMERGENCY" });
    expect(emergency.priceLowCents).toBeGreaterThan(standard.priceLowCents);
    expect(emergency.priceHighCents).toBeGreaterThan(standard.priceHighCents);
    expect(emergency.priceLowCents).toBeLessThan(emergency.priceHighCents);
  });

  it("matches loosely — 'roof replace' still finds 'roof replacement'", () => {
    const r = computeEstimate({ verticalKey: "roofing", jobType: "roof replace" });
    expect(r.confidence).toBe("RATE_CARD");
  });

  it("degrades to a disclosed fallback range for an unknown job type", () => {
    const r = computeEstimate({ verticalKey: "roofing", jobType: "solar panel install" });
    expect(r.confidence).toBe("FALLBACK");
    expect(r.priceLowCents).toBeLessThan(r.priceHighCents);
    expect(r.basis).toMatch(/didn't match/);
  });

  it("degrades to the widest fallback when the client has no vertical at all", () => {
    const r = computeEstimate({ verticalKey: null, jobType: "anything" });
    expect(r.confidence).toBe("FALLBACK");
    expect(r.priceLowCents).toBeGreaterThan(0);
    expect(r.priceLowCents).toBeLessThan(r.priceHighCents);
  });

  it("never returns a negative, zero-width-inverted, or non-finite range", () => {
    for (const card of RATE_CARDS) {
      for (const line of card.lines) {
        const r = computeEstimate({ verticalKey: card.key, jobType: line.jobType, quantity: 3 });
        expect(Number.isFinite(r.priceLowCents)).toBe(true);
        expect(Number.isFinite(r.priceHighCents)).toBe(true);
        expect(r.priceLowCents).toBeGreaterThanOrEqual(0);
        expect(r.priceHighCents).toBeGreaterThanOrEqual(r.priceLowCents);
      }
    }
  });

  it("every rate card resolves by key", () => {
    for (const card of RATE_CARDS) {
      expect(rateCardFor(card.key)).toBe(card);
    }
    expect(rateCardFor(null)).toBeUndefined();
    expect(rateCardFor("not-a-real-vertical")).toBeUndefined();
  });
});

describe("formatCents / formatRange", () => {
  it("formats whole dollars with thousands separators", () => {
    expect(formatCents(1_234_567)).toBe("$12,346");
    expect(formatRange(100_000, 200_000)).toBe("$1,000–$2,000");
  });
});
