import { describe, expect, it } from "vitest";
import {
  DEFAULT_VALID_DAYS,
  canSend,
  describeGap,
  estimateReference,
  expiryFor,
  isExpired,
  priceEstimate,
  unitShort,
  type Rate,
} from "@/lib/estimating";

const RATES: Rate[] = [
  { code: "LABOUR", label: "Labour", unit: "HOUR", unitPriceCents: 9500, minimumCents: 19000 },
  { code: "CALLOUT", label: "Callout", unit: "FLAT", unitPriceCents: 8500 },
  { code: "TILE", label: "Roof tile", unit: "EACH", unitPriceCents: 450, taxable: true },
  { code: "PERMIT", label: "Permit fee", unit: "FLAT", unitPriceCents: 12000, taxable: false },
];

describe("an unpriced line is never worth zero", () => {
  /**
   * The rule this whole file exists for. The obvious implementation contributes
   * 0 for a code it cannot find, producing a plausible, well-formatted,
   * confidently-wrong price commitment that undercharges — and nobody notices,
   * because a total that is too low looks exactly like a total.
   */
  it("refuses to price a code that is not on the card", () => {
    const e = priceEstimate({
      rates: RATES,
      lines: [
        { code: "LABOUR", quantity: 4 },
        { code: "SCAFFOLD", quantity: 1 },
      ],
    });
    expect(e.unpriced).toEqual(["SCAFFOLD"]);
    expect(e.complete).toBe(false);
    // The known line is still priced — one bad code must not lose the other
    // twelve the client already typed.
    expect(e.lines).toHaveLength(1);
    expect(e.subtotalCents).toBe(38000);
  });

  it("never contributes zero for the missing line", () => {
    const withMissing = priceEstimate({
      rates: RATES,
      lines: [{ code: "LABOUR", quantity: 4 }, { code: "NOPE", quantity: 99 }],
    });
    const without = priceEstimate({ rates: RATES, lines: [{ code: "LABOUR", quantity: 4 }] });
    // Identical totals is exactly the symptom: the estimate looks finished.
    // What distinguishes them has to be the refusal, not the arithmetic.
    expect(withMissing.subtotalCents).toBe(without.subtotalCents);
    expect(withMissing.complete).toBe(false);
    expect(without.complete).toBe(true);
    expect(canSend(withMissing).ok).toBe(false);
    expect(canSend(without).ok).toBe(true);
  });

  it("names every missing code once, however often it appears", () => {
    const e = priceEstimate({
      rates: RATES,
      lines: [
        { code: "SCAFFOLD", quantity: 1 },
        { code: "SCAFFOLD", quantity: 2 },
        { code: "CRANE", quantity: 1 },
      ],
    });
    expect(e.unpriced).toEqual(["SCAFFOLD", "CRANE"]);
    expect(describeGap(e)).toMatch(/2 items/);
  });

  it("says which code, so the refusal is actionable", () => {
    const e = priceEstimate({ rates: RATES, lines: [{ code: "SCAFFOLD", quantity: 1 }] });
    const verdict = canSend(e);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.why).toContain("SCAFFOLD");
    expect(describeGap(e)).toContain("SCAFFOLD");
    expect(describeGap(priceEstimate({ rates: RATES, lines: [] }))).toBeNull();
  });
});

describe("minimums", () => {
  it("charges the minimum when the quantity does not reach it", () => {
    // A callout that costs the same whether it takes ten minutes or an hour is
    // the most common shape of trade pricing, and the one quantity × price
    // gets wrong.
    const e = priceEstimate({ rates: RATES, lines: [{ code: "LABOUR", quantity: 1 }] });
    expect(e.lines[0].rawCents).toBe(9500);
    expect(e.lines[0].amountCents).toBe(19000);
    expect(e.lines[0].minimumApplied).toBe(true);
  });

  it("leaves a line above the minimum alone", () => {
    const e = priceEstimate({ rates: RATES, lines: [{ code: "LABOUR", quantity: 3 }] });
    expect(e.lines[0].amountCents).toBe(28500);
    expect(e.lines[0].minimumApplied).toBe(false);
  });

  it("does not charge a minimum for a line nobody asked for", () => {
    // Quantity zero is a line being removed, not a callout being incurred.
    const e = priceEstimate({ rates: RATES, lines: [{ code: "LABOUR", quantity: 0 }] });
    expect(e.lines[0].amountCents).toBe(0);
    expect(e.lines[0].minimumApplied).toBe(false);
  });

  it("keeps the raw figure so the minimum is visible rather than silent", () => {
    const e = priceEstimate({ rates: RATES, lines: [{ code: "LABOUR", quantity: 1 }] });
    expect(e.lines[0].rawCents).not.toBe(e.lines[0].amountCents);
  });
});

describe("discount and tax", () => {
  const lines = [
    { code: "LABOUR", quantity: 4 }, // 38000, taxable
    { code: "PERMIT", quantity: 1 }, // 12000, not taxable
  ];

  it("totals without tax when no rate is given", () => {
    const e = priceEstimate({ rates: RATES, lines });
    expect(e.subtotalCents).toBe(50000);
    expect(e.taxCents).toBe(0);
    expect(e.totalCents).toBe(50000);
  });

  it("taxes only the taxable part", () => {
    const e = priceEstimate({ rates: RATES, lines, taxRatePercent: 10 });
    expect(e.taxableBaseCents).toBe(38000);
    expect(e.taxCents).toBe(3800);
    expect(e.totalCents).toBe(53800);
  });

  it("shares a discount across taxable and untaxable in proportion", () => {
    // Discounting a job must not quietly change which part of it was taxed.
    const e = priceEstimate({ rates: RATES, lines, discountCents: 5000, taxRatePercent: 10 });
    // 38000/50000 of the 5000 discount lands on the taxable side.
    expect(e.taxableBaseCents).toBe(38000 - 3800);
    expect(e.totalCents).toBe(50000 - 5000 + e.taxCents);
  });

  it("never produces a negative total", () => {
    // "You owe -$40" on a document somebody signs is not a refund, it is a bug.
    const e = priceEstimate({ rates: RATES, lines, discountCents: 999999 });
    expect(e.discountCents).toBe(50000);
    expect(e.totalCents).toBe(0);
    expect(e.taxableBaseCents).toBeGreaterThanOrEqual(0);
  });

  it("ignores a negative discount rather than treating it as a surcharge", () => {
    const e = priceEstimate({ rates: RATES, lines, discountCents: -5000 });
    expect(e.discountCents).toBe(0);
    expect(e.totalCents).toBe(50000);
  });

  it("ignores a nonsense tax rate", () => {
    for (const bad of [NaN, Infinity, -5, undefined]) {
      const e = priceEstimate({ rates: RATES, lines, taxRatePercent: bad as number });
      expect(e.taxCents, String(bad)).toBe(0);
    }
  });
});

describe("nothing NaN or Infinite reaches a price panel", () => {
  it("survives a blank form field", () => {
    const e = priceEstimate({
      rates: RATES,
      lines: [{ code: "LABOUR", quantity: NaN as number }],
      discountCents: NaN,
      taxRatePercent: NaN,
    });
    expect(Number.isFinite(e.totalCents)).toBe(true);
    expect(e.totalCents).toBe(0);
  });

  it("survives a runaway quantity", () => {
    const e = priceEstimate({ rates: RATES, lines: [{ code: "TILE", quantity: Infinity }] });
    expect(Number.isFinite(e.totalCents)).toBe(true);
  });

  it("refuses a negative quantity rather than crediting it", () => {
    const e = priceEstimate({ rates: RATES, lines: [{ code: "TILE", quantity: -50 }] });
    expect(e.lines[0].quantity).toBe(0);
    expect(e.totalCents).toBe(0);
  });

  it("returns whole cents, never fractions", () => {
    const e = priceEstimate({
      rates: RATES,
      lines: [{ code: "TILE", quantity: 2.5 }],
      taxRatePercent: 8.6,
    });
    for (const n of [e.subtotalCents, e.taxCents, e.totalCents, e.lines[0].amountCents]) {
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it("keeps the parts adding up to the whole", () => {
    const e = priceEstimate({
      rates: RATES,
      lines: [
        { code: "LABOUR", quantity: 3.25 },
        { code: "TILE", quantity: 17 },
        { code: "PERMIT", quantity: 1 },
      ],
      discountCents: 2500,
      taxRatePercent: 8.6,
    });
    expect(e.lines.reduce((n, l) => n + l.amountCents, 0)).toBe(e.subtotalCents);
    expect(e.totalCents).toBe(e.subtotalCents - e.discountCents + e.taxCents);
  });

  it("handles an empty estimate without dividing by zero", () => {
    const e = priceEstimate({ rates: RATES, lines: [], discountCents: 100, taxRatePercent: 10 });
    expect(e.totalCents).toBe(0);
    expect(e.taxableBaseCents).toBe(0);
    expect(Number.isFinite(e.totalCents)).toBe(true);
  });
});

describe("a line is a snapshot, not a reference", () => {
  it("carries everything needed to re-read it after the rate card changes", () => {
    // Rate cards get edited — that is what they are for. An estimate that
    // re-read live rates would silently restate a price a customer already
    // holds.
    const e = priceEstimate({ rates: RATES, lines: [{ code: "LABOUR", quantity: 4 }] });
    const line = e.lines[0];
    expect(line).toMatchObject({
      code: "LABOUR",
      label: "Labour",
      unit: "HOUR",
      unitPriceCents: 9500,
    });
    expect(line.taxable).toBe(true);
  });

  it("defaults an unstated taxable flag to true", () => {
    const e = priceEstimate({ rates: RATES, lines: [{ code: "CALLOUT", quantity: 1 }] });
    expect(e.lines[0].taxable).toBe(true);
  });

  it("keeps a note against the line it was written on", () => {
    const e = priceEstimate({
      rates: RATES,
      lines: [{ code: "TILE", quantity: 10, note: "Matched to the existing ridge" }],
    });
    expect(e.lines[0].note).toBe("Matched to the existing ridge");
  });
});

describe("what may be put in front of a customer", () => {
  it("passes a complete, priced estimate", () => {
    const e = priceEstimate({ rates: RATES, lines: [{ code: "LABOUR", quantity: 4 }] });
    expect(canSend(e)).toEqual({ ok: true });
  });

  it("refuses an empty one", () => {
    const verdict = canSend(priceEstimate({ rates: RATES, lines: [] }));
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.why).toMatch(/nothing on this estimate/i);
  });

  it("refuses one that totals nothing", () => {
    // Zero is a legitimate thing to do and never a legitimate thing to send by
    // accident, so it needs a deliberate act rather than a silent pass.
    const e = priceEstimate({ rates: RATES, lines: [{ code: "TILE", quantity: 0 }] });
    expect(canSend(e).ok).toBe(false);
  });
});

describe("references and expiry", () => {
  it("reads down a phone", () => {
    expect(estimateReference(42)).toBe("EST-0042");
    expect(estimateReference(1)).toBe("EST-0001");
    expect(estimateReference(12345)).toBe("EST-12345");
  });

  it("never produces a nonsense reference", () => {
    for (const n of [0, -3, NaN, Infinity]) {
      expect(estimateReference(n), String(n)).toBe("EST-0001");
    }
  });

  it("stands for thirty days by default and expires after", () => {
    // Quoting materials at last month's price is how a trade loses money on a
    // job it won.
    const from = new Date("2026-07-01T00:00:00Z");
    const at = expiryFor(from);
    expect(at.getTime() - from.getTime()).toBe(DEFAULT_VALID_DAYS * 86_400_000);
    expect(isExpired(at, new Date("2026-07-30T00:00:00Z"))).toBe(false);
    expect(isExpired(at, new Date("2026-08-05T00:00:00Z"))).toBe(true);
  });

  it("falls back to the default rather than an instant expiry", () => {
    const from = new Date("2026-07-01T00:00:00Z");
    for (const bad of [0, -5, NaN]) {
      expect(expiryFor(from, bad).getTime()).toBe(from.getTime() + DEFAULT_VALID_DAYS * 86_400_000);
    }
  });

  it("treats a missing expiry as standing rather than lapsed", () => {
    expect(isExpired(null, new Date())).toBe(false);
    expect(isExpired(undefined, new Date())).toBe(false);
  });
});

describe("units", () => {
  it("has a short form for every unit", () => {
    for (const u of ["HOUR", "DAY", "EACH", "SQ_FT", "LINEAR_FT", "FLAT"] as const) {
      expect(unitShort(u).length, u).toBeGreaterThan(0);
    }
  });
});
