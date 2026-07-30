import { describe, expect, it } from "vitest";
import {
  centsToDollars,
  dollarsToCents,
  parseList,
  parsePriceItems,
  parseQualifiers,
  serialiseList,
  serialisePriceItems,
  serialiseQualifiers,
} from "@/lib/voice-forms";

/**
 * The failure this file exists to prevent: an owner types a rate, presses save,
 * sees a green tick, and finds out three weeks later that the line was dropped
 * and the operator has been booking visits instead of quoting it.
 *
 * So the rule under test is not "parses good input". It is "never silently
 * discards anything".
 */

describe("lists", () => {
  it("splits on lines and commas, and drops duplicates", () => {
    expect(parseList("Roofing\ngutters, Roofing\n\n  ")).toEqual(["Roofing", "gutters"]);
  });

  it("round-trips", () => {
    const values = ["Phoenix", "Scottsdale"];
    expect(parseList(serialiseList(values))).toEqual(values);
  });
});

describe("qualifiers", () => {
  it("reads slot, question and optionality", () => {
    const r = parseQualifiers("caller_name | Can I take your name?\nurgency | Emergency? | optional");
    expect(r.errors).toEqual([]);
    expect(r.values).toHaveLength(2);
    expect(r.values[0]!.required).toBe(true);
    expect(r.values[1]!.required).toBe(false);
  });

  it("reports a line with no question instead of skipping it", () => {
    const r = parseQualifiers("caller_name");
    expect(r.values).toHaveLength(0);
    expect(r.errors[0]).toMatch(/Line 1/);
  });

  it("rejects a slot key the schema would not accept", () => {
    const r = parseQualifiers("Caller Name | Your name?");
    expect(r.values).toHaveLength(0);
    expect(r.errors).toHaveLength(1);
  });

  it("catches a duplicate slot, which would silently shadow one question", () => {
    const r = parseQualifiers("name | First?\nname | Second?");
    expect(r.values).toHaveLength(1);
    expect(r.errors[0]).toMatch(/twice/);
  });

  it("ignores blank lines without complaining about them", () => {
    const r = parseQualifiers("\n\ncaller_name | Name?\n\n");
    expect(r.errors).toEqual([]);
    expect(r.values).toHaveLength(1);
  });

  it("round-trips", () => {
    const text = "caller_name | Can I take your name?\nurgency | Emergency? | optional";
    const first = parseQualifiers(text);
    const again = parseQualifiers(serialiseQualifiers(first.values));
    expect(again.errors).toEqual([]);
    expect(again.values).toEqual(first.values);
  });
});

describe("price items", () => {
  it("reads a rate in dollars and stores integer cents", () => {
    const r = parsePriceItems("gutter_clean | Gutter clean | linear_ft | 4.50 | 40");
    expect(r.errors).toEqual([]);
    expect(r.values[0]).toMatchObject({ rateCents: 450, minQty: 40, unit: "linear_ft" });
  });

  it("accepts a dollar sign and commas, because that is how people paste", () => {
    const r = parsePriceItems("reroof | Re-roof | fixed | $12,500");
    expect(r.errors).toEqual([]);
    expect(r.values[0]!.rateCents).toBe(1250000);
  });

  it("refuses an unknown unit and names the valid ones", () => {
    const r = parsePriceItems("x | X | furlong | 10");
    expect(r.values).toHaveLength(0);
    expect(r.errors[0]).toMatch(/linear_ft/);
  });

  it("refuses a short line rather than guessing at it", () => {
    const r = parsePriceItems("x | X | each");
    expect(r.values).toHaveLength(0);
    expect(r.errors[0]).toMatch(/needs/);
  });

  it("catches a duplicate key", () => {
    const r = parsePriceItems("x | One | each | 10\nx | Two | each | 20");
    expect(r.values).toHaveLength(1);
    expect(r.errors[0]).toMatch(/twice/);
  });

  it("accepts a free item, because zero is a real rate", () => {
    const r = parsePriceItems("survey | Free survey | fixed | 0");
    expect(r.errors).toEqual([]);
    expect(r.values[0]!.rateCents).toBe(0);
  });

  it("round-trips", () => {
    const text = "gutter_clean | Gutter clean | linear_ft | 4.50 | 40\ndiag | Diagnostic | fixed | 89";
    const first = parsePriceItems(text);
    expect(first.errors).toEqual([]);
    const again = parsePriceItems(serialisePriceItems(first.values));
    expect(again.errors).toEqual([]);
    expect(again.values).toEqual(first.values);
  });
});

describe("money in a text box", () => {
  it("reads what people type", () => {
    expect(dollarsToCents("$1,250.50")).toBe(125050);
    expect(dollarsToCents("89")).toBe(8900);
    expect(dollarsToCents("")).toBe(0);
    expect(dollarsToCents(null)).toBe(0);
    expect(dollarsToCents("nonsense")).toBe(0);
  });

  it("shows a blank rather than a zero, so an unset field looks unset", () => {
    expect(centsToDollars(0)).toBe("");
    expect(centsToDollars(8900)).toBe("89");
    expect(centsToDollars(125050)).toBe("1250.50");
  });
});
