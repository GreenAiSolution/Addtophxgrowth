import { describe, expect, it } from "vitest";
import { summarise, leadText, MIN_PRECEDENTS, type Precedent } from "@/lib/recall";

/**
 * Recall is the surface where retrieval turns into a claim, and a claim is the
 * thing this codebase is strictest about. The marketing site is forbidden from
 * printing a statistic it cannot stand behind; a console that says "leads like
 * this usually close" off the back of two matches would be the same failure,
 * with more authority because it is addressed to one person about their own
 * business.
 *
 * So the interesting behaviour here is when the system declines to say
 * anything. That is most of these tests.
 */

const p = (over: Partial<Precedent>): Precedent => ({
  leadId: "l1",
  name: null,
  company: null,
  outcome: "OPEN",
  valueCents: null,
  content: "",
  score: 0.5,
  via: ["vector"],
  ...over,
});

describe("what the index will and will not assert", () => {
  it("says nothing at all from a handful of matches", () => {
    // Two similar leads is an anecdote. The floor exists so nobody makes a
    // decision on one.
    const two = [p({ outcome: "WON" }), p({ outcome: "WON" })];
    expect(summarise(two, true).verdict).toBeNull();
    expect(MIN_PRECEDENTS).toBeGreaterThanOrEqual(3);
  });

  it("speaks once there is enough that closed", () => {
    const enough = [
      p({ outcome: "WON" }),
      p({ outcome: "WON" }),
      p({ outcome: "LOST" }),
    ];
    expect(summarise(enough, true).verdict).toBe("2 of the 3 closest matches that closed were won.");
  });

  it("counts only what actually closed toward the floor", () => {
    /*
      Five matches, two closed. An implementation counting all five would clear
      the floor and then describe the two — a sentence with the confidence of
      five behind it and the evidence of two.
    */
    const mostlyOpen = [
      p({ outcome: "WON" }),
      p({ outcome: "LOST" }),
      p({ outcome: "OPEN" }),
      p({ outcome: "OPEN" }),
      p({ outcome: "OPEN" }),
    ];
    const r = summarise(mostlyOpen, true);
    expect(r.open).toBe(3);
    expect(r.verdict, "spoke from two closed deals").toBeNull();
  });

  it("refuses to say anything when the results were not semantic", () => {
    /*
      The load-bearing honesty rule. With no embedding key the search still
      runs — lexically — and still returns real, relevant leads. What it must
      never do is let a keyword overlap masquerade as "this reads like".
    */
    const plenty = [
      p({ outcome: "WON" }),
      p({ outcome: "WON" }),
      p({ outcome: "WON" }),
      p({ outcome: "LOST" }),
    ];
    expect(summarise(plenty, true).verdict).not.toBeNull();
    expect(summarise(plenty, false).verdict, "claimed resemblance from a keyword match").toBeNull();
  });

  it("still counts honestly when it will not conclude", () => {
    // Declining to draw a conclusion is not the same as hiding the data. The
    // counts are always real; only the sentence is withheld.
    const some = [p({ outcome: "WON", valueCents: 100_000 }), p({ outcome: "LOST" })];
    const r = summarise(some, false);
    expect(r.won).toBe(1);
    expect(r.lost).toBe(1);
    expect(r.averageWonCents).toBe(100_000);
    expect(r.verdict).toBeNull();
  });

  it("averages only the ones that were won and carried a value", () => {
    const mixed = [
      p({ outcome: "WON", valueCents: 100_000 }),
      p({ outcome: "WON", valueCents: 300_000 }),
      p({ outcome: "WON", valueCents: null }),
      p({ outcome: "LOST", valueCents: 900_000 }),
    ];
    // Not (100k + 300k + 900k)/3, and not counting the null as a zero.
    expect(summarise(mixed, true).averageWonCents).toBe(200_000);
  });

  it("reports nothing rather than zero when nothing closed", () => {
    // An average of zero reads as "these are worth nothing". Null reads as
    // "we do not know", which is the true statement.
    expect(summarise([p({ outcome: "OPEN" })], true).averageWonCents).toBeNull();
    expect(summarise([], true).averageWonCents).toBeNull();
  });

  it("handles an empty recall without inventing a verdict", () => {
    const r = summarise([], true);
    expect(r).toEqual({ won: 0, lost: 0, open: 0, averageWonCents: null, verdict: null });
  });

  it("does not pick a side when the evidence is split", () => {
    const split = [
      p({ outcome: "WON" }),
      p({ outcome: "WON" }),
      p({ outcome: "LOST" }),
      p({ outcome: "LOST" }),
    ];
    expect(summarise(split, true).verdict).toBe("The 4 closest matches that closed split evenly.");
  });
});

describe("the text a lead is indexed and searched by", () => {
  it("is built in one place, so index time and query time agree", () => {
    /*
      A lead indexed from one shape and searched with another compares two
      different documents. The similarity score still comes back, still sorts,
      and means nothing — a failure with no symptom, which is why this is a
      single exported function rather than two inline template literals.
    */
    const lead = { name: "Dana Reyes", company: "Copper State", message: "Boiler died", source: "web" };
    expect(leadText(lead)).toBe(
      "Company: Copper State\nContact: Dana Reyes\nSource: web\nBoiler died",
    );
  });

  it("skips what is missing rather than embedding the word 'null'", () => {
    // Empty fields must not contribute tokens. "Contact: null" is a string
    // that embeds, and it embeds the same way for every lead missing a name —
    // which makes them all look alike.
    const sparse = leadText({ message: "No heat upstairs" });
    expect(sparse).toBe("No heat upstairs");
    expect(sparse).not.toMatch(/null|undefined/);
  });

  it("returns nothing embeddable for an empty lead", () => {
    expect(leadText({}).trim()).toBe("");
    expect(leadText({ name: null, company: null, message: "   " }).trim()).toBe("");
  });
});
