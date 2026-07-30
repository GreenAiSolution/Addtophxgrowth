import { describe, expect, it } from "vitest";
import {
  emptyPriceBook,
  priceBookSchema,
  priceEstimate,
  quotePayload,
  resolveItem,
  roundSpoken,
  type PriceBook,
} from "@/lib/estimates";

/**
 * A number said out loud on a phone call is the number the customer holds the
 * business to. So these tests are about arithmetic and about refusal, in equal
 * measure — a wrong price is worse than no price, and the whole design leans on
 * that being true in code rather than in a comment.
 */

function book(over: Partial<PriceBook> = {}): PriceBook {
  return priceBookSchema.parse({
    currency: "USD",
    callOutFeeCents: 0,
    minimumJobCents: 0,
    items: [
      { key: "gutter_clean", label: "Gutter clean", unit: "linear_ft", rateCents: 450, minQty: 40, aliases: ["gutters"] },
      { key: "tap_repair", label: "Tap repair", unit: "each", rateCents: 12000, minQty: 0, aliases: [] },
      { key: "diagnostic", label: "Diagnostic visit", unit: "fixed", rateCents: 8900, minQty: 0, aliases: [] },
      { key: "labour", label: "Labour", unit: "hour", rateCents: 9500, minQty: 1, aliases: [] },
    ],
    modifiers: [
      { key: "second_storey", label: "Second storey", kind: "percent", amount: 25 },
      { key: "weekend", label: "Weekend", kind: "flat", amount: 5000 },
    ],
    travel: { includedMiles: 10, perMileCents: 150 },
    rangeSpreadPct: 20,
    maxSpokenTotalCents: 0,
    ...over,
  });
}

describe("finding the right line item", () => {
  it("matches on key, alias and label", () => {
    expect(resolveItem(book(), "gutter_clean")?.key).toBe("gutter_clean");
    expect(resolveItem(book(), "gutters")?.key).toBe("gutter_clean");
    expect(resolveItem(book(), "Tap repair")?.key).toBe("tap_repair");
  });

  it("forgives an extractor that nearly got the key right", () => {
    // A language model will confidently return `gutter clean` for an item keyed
    // `gutter_clean`. Refusing that is correct and commercially stupid.
    expect(resolveItem(book(), "gutter clean")?.key).toBe("gutter_clean");
  });

  it("refuses when two items could match", () => {
    const ambiguous = book({
      items: [
        { key: "roof_repair", label: "Roof repair", unit: "each", rateCents: 100, minQty: 0, aliases: [] },
        { key: "roof_replace", label: "Roof replace", unit: "each", rateCents: 200, minQty: 0, aliases: [] },
      ],
    });
    expect(resolveItem(ambiguous, "roof")).toBeUndefined();
  });

  it("matches nothing on an empty name", () => {
    expect(resolveItem(book(), "   ")).toBeUndefined();
  });
});

describe("pricing a job", () => {
  it("multiplies rate by quantity, in integer cents", () => {
    const r = priceEstimate(book(), { lines: [{ item: "tap_repair", qty: 2, measured: true }] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lines[0]!.totalCents).toBe(24000);
      expect(r.totalCents).toBe(24000);
    }
  });

  it("applies an item minimum and says it did", () => {
    const r = priceEstimate(book(), { lines: [{ item: "gutter_clean", qty: 10, measured: true }] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lines[0]!.billedQty).toBe(40);
      expect(r.lines[0]!.totalCents).toBe(18000);
      expect(r.lines[0]!.note).toMatch(/minimum/);
    }
  });

  it("charges a fixed item once, without a quantity", () => {
    const r = priceEstimate(book(), { lines: [{ item: "diagnostic", qty: 0 }] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.totalCents).toBe(8900);
  });

  it("adds the call-out fee and travel past the free miles", () => {
    const r = priceEstimate(book({ callOutFeeCents: 4900 }), {
      lines: [{ item: "tap_repair", qty: 1, measured: true }],
      milesFromBase: 30,
    });
    expect(r.ok).toBe(true);
    // 120.00 + 49.00 call-out + 20 chargeable miles at 1.50
    if (r.ok) expect(r.totalCents).toBe(12000 + 4900 + 3000);
  });

  it("charges no travel inside the free radius", () => {
    const r = priceEstimate(book(), {
      lines: [{ item: "tap_repair", qty: 1 }],
      milesFromBase: 5,
    });
    if (r.ok) expect(r.travelCents).toBe(0);
  });

  it("applies a percent modifier to the subtotal, not to itself", () => {
    const r = priceEstimate(book(), {
      lines: [{ item: "tap_repair", qty: 1, measured: true }],
      modifiers: ["second_storey", "weekend"],
    });
    expect(r.ok).toBe(true);
    // 120 + 25% of 120 + 50 flat. The flat surcharge must not be inside the
    // percentage, or two orderings of the same job price differently.
    if (r.ok) expect(r.totalCents).toBe(12000 + 3000 + 5000);
  });

  it("ignores a modifier it does not know rather than refusing the quote", () => {
    const r = priceEstimate(book(), {
      lines: [{ item: "tap_repair", qty: 1 }],
      modifiers: ["nonsense"],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.modifiersApplied).toEqual([]);
  });

  it("lifts a small job to the minimum and marks it", () => {
    const r = priceEstimate(book({ minimumJobCents: 25000 }), {
      lines: [{ item: "tap_repair", qty: 1, measured: true }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.totalCents).toBe(25000);
      expect(r.minimumApplied).toBe(true);
      // Nothing about the description can move a fixed floor, so this is the
      // one guessed-quantity case that is still high confidence.
      expect(r.confidence).toBe("HIGH");
    }
  });
});

describe("confidence, and what it changes", () => {
  it("is high when everything was measured", () => {
    const r = priceEstimate(book(), { lines: [{ item: "tap_repair", qty: 1, measured: true }] });
    if (r.ok) expect(r.confidence).toBe("HIGH");
  });

  it("is medium when only some of it was", () => {
    const r = priceEstimate(book(), {
      lines: [
        { item: "tap_repair", qty: 1, measured: true },
        { item: "labour", qty: 2 },
      ],
    });
    if (r.ok) expect(r.confidence).toBe("MEDIUM");
  });

  it("is low when the caller guessed all of it", () => {
    const r = priceEstimate(book(), { lines: [{ item: "labour", qty: 3 }] });
    if (r.ok) {
      expect(r.confidence).toBe("LOW");
      expect(r.confidenceWhy).toMatch(/description/);
    }
  });

  it("refuses to speak a firm figure it is not confident in", () => {
    // A firm price nobody can stand behind is worse than a range.
    const r = priceEstimate(book(), { lines: [{ item: "labour", qty: 3 }] }, "firm");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lowCents).toBeLessThan(r.highCents);
      expect(r.spoken).toMatch(/ to /);
    }
  });

  it("speaks one figure when it is confident and asked to", () => {
    const r = priceEstimate(book(), { lines: [{ item: "tap_repair", qty: 1, measured: true }] }, "firm");
    if (r.ok) {
      expect(r.lowCents).toBe(r.highCents);
      expect(r.spoken).toContain("$120");
    }
  });
});

describe("when it refuses", () => {
  it("refuses everything on a playbook that does not quote", () => {
    const r = priceEstimate(book(), { lines: [{ item: "tap_repair", qty: 1 }] }, "none");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.escalate).toBe(true);
  });

  it("refuses with an empty book", () => {
    const r = priceEstimate(emptyPriceBook(), { lines: [{ item: "anything", qty: 1 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("EMPTY_BOOK");
  });

  it("refuses the whole quote when one item is unknown", () => {
    // A total missing one of the things they asked for is the number they will
    // remember, and it will be wrong.
    const r = priceEstimate(book(), {
      lines: [
        { item: "tap_repair", qty: 1 },
        { item: "hot tub installation", qty: 1 },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("UNKNOWN_ITEM");
      expect(r.why).toContain("hot tub installation");
    }
  });

  it("refuses without a measurement", () => {
    const r = priceEstimate(book(), { lines: [{ item: "labour", qty: 0 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("NO_QUANTITY");
  });

  it("refuses above the phone cap", () => {
    const r = priceEstimate(book({ maxSpokenTotalCents: 100000 }), {
      lines: [{ item: "tap_repair", qty: 20, measured: true }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("ABOVE_SPOKEN_CAP");
      // The owner's reason names both numbers; the caller's does not mention a
      // cap, a book or a system at all.
      expect(r.why).toMatch(/\$2,400.*\$1,000/);
      expect(r.spoken).not.toMatch(/cap|book|system/i);
    }
  });

  it("quotes right up to the cap", () => {
    const r = priceEstimate(book({ maxSpokenTotalCents: 12000 }), {
      lines: [{ item: "tap_repair", qty: 1, measured: true }],
    });
    expect(r.ok).toBe(true);
  });

  it("refuses when the call extracted nothing to price", () => {
    const r = priceEstimate(book(), { lines: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("NOTHING_REQUESTED");
  });

  it("always offers a way forward, never a dead end", () => {
    const refusals = [
      priceEstimate(emptyPriceBook(), { lines: [{ item: "x", qty: 1 }] }),
      priceEstimate(book(), { lines: [{ item: "nope", qty: 1 }] }),
      priceEstimate(book(), { lines: [{ item: "labour", qty: 0 }] }),
      priceEstimate(book({ maxSpokenTotalCents: 100 }), { lines: [{ item: "tap_repair", qty: 1 }] }),
    ];
    for (const r of refusals) {
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.escalate).toBe(true);
        expect(r.spoken.length).toBeGreaterThan(20);
      }
    }
  });
});

describe("how a price is said", () => {
  it("rounds to the nearest five dollars, the way a person says it", () => {
    expect(roundSpoken(12234)).toBe(12000);
    expect(roundSpoken(12350)).toBe(12500);
  });

  it("always attaches the disclaimer", () => {
    const r = priceEstimate(book({ disclaimer: "Confirmed in writing." }), {
      lines: [{ item: "tap_repair", qty: 1 }],
    });
    if (r.ok) expect(r.spoken).toContain("Confirmed in writing.");
  });
});

describe("the written quote", () => {
  it("carries the breakdown, the range and why it is confident", () => {
    const r = priceEstimate(book({ callOutFeeCents: 4900 }), {
      lines: [{ item: "gutter_clean", qty: 60, measured: true }],
      modifiers: ["second_storey"],
      milesFromBase: 20,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const doc = quotePayload(r, { name: "Dana", phone: "602 555 0134", description: "Gutters" });
    expect(doc.customer).toMatchObject({ name: "Dana" });
    expect(Array.isArray(doc.lines)).toBe(true);
    expect(doc.total).toMatch(/^\$/);
    expect(doc.range).toMatch(/–/);
    expect(doc.confidenceWhy).toBeTruthy();
    // What was actually said out loud, kept verbatim. If a customer says "you
    // told me eleven hundred", this is the answer.
    expect(doc.quotedOnCall).toBe(r.spoken);
    expect(doc.surcharges).toHaveLength(1);
  });
});
