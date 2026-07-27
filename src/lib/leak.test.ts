import { describe, it, expect } from "vitest";
import { computeLeak, LEAK_DEFAULTS, NOT_MEASURED, type LeakInputs } from "@/lib/leak";

const base: LeakInputs = {
  callsPerMonth: 100,
  missedPct: 20,
  jobValue: 100000, // $1,000
  closeRate: 50,
  recovery: 1,
};

describe("computeLeak", () => {
  it("multiplies the visitor's own numbers and nothing else", () => {
    // 100 calls · 20% missed = 20 missed · 50% close = 10 jobs · $1,000 = $10,000
    const r = computeLeak(base, 100000);
    expect(r.missedCalls).toBe(20);
    expect(r.monthlyLeak).toBe(1_000_000);
    expect(r.annualLeak).toBe(12_000_000);
  });

  it("applies recovery as a visible discount, never a hidden uplift", () => {
    // The number can only ever go *down* from the raw leak. If this ever
    // produced more than the leak itself, the tool would be projecting
    // performance rather than reporting arithmetic.
    for (const recovery of [0, 0.25, 0.5, 1]) {
      const r = computeLeak({ ...base, recovery }, 100000);
      expect(r.recoverable).toBeLessThanOrEqual(r.monthlyLeak);
      expect(r.recoverable).toBe(Math.round(r.monthlyLeak * recovery));
    }
  });

  it("reports coverage below 1 and says so", () => {
    // The branch that makes this a calculator rather than a brochure.
    const r = computeLeak({ ...base, callsPerMonth: 4, recovery: 0.5 }, 190000);
    expect(r.coverage).toBeLessThan(1);
    expect(r.underwater).toBe(true);
  });

  it("reports coverage above 1 when the maths genuinely works", () => {
    const r = computeLeak(base, 190000);
    expect(r.coverage).toBeGreaterThan(1);
    expect(r.underwater).toBe(false);
  });

  it("clamps nonsense rather than returning nonsense", () => {
    const r = computeLeak(
      {
        callsPerMonth: -50,
        missedPct: 900,
        jobValue: -1,
        closeRate: -20,
        recovery: 5,
      },
      100000,
    );
    expect(r.missedCalls).toBe(0);
    expect(r.monthlyLeak).toBe(0);
    expect(r.recoverable).toBe(0);
    expect(Number.isFinite(r.coverage)).toBe(true);
  });

  it("never returns Infinity, even at zero cost", () => {
    // Infinity rendered into a price panel is a broken page, not a great deal.
    const free = computeLeak(base, 0);
    expect(Number.isFinite(free.coverage)).toBe(true);
    const nothing = computeLeak({ ...base, callsPerMonth: 0 }, 0);
    expect(nothing.coverage).toBe(0);
  });

  it("is monotonic in the things that should raise the leak", () => {
    const cost = 190000;
    const more = computeLeak({ ...base, missedPct: 40 }, cost);
    expect(more.monthlyLeak).toBeGreaterThan(computeLeak(base, cost).monthlyLeak);

    const richer = computeLeak({ ...base, jobValue: 200000 }, cost);
    expect(richer.monthlyLeak).toBeGreaterThan(computeLeak(base, cost).monthlyLeak);
  });
});

describe("defaults", () => {
  it("opens on a modest business rather than a flattering one", () => {
    // A default that makes every visitor look like they're leaking six figures
    // is a rigged demo. This should be an ordinary local operation.
    const r = computeLeak(LEAK_DEFAULTS, 190000);
    expect(LEAK_DEFAULTS.recovery).toBeLessThan(1);
    expect(r.monthlyLeak).toBeLessThan(2_000_000); // under $20k/mo
  });

  it("names what it does not measure", () => {
    // Quantifying one gap while staying silent on the others implies the
    // others are worth nothing.
    expect(NOT_MEASURED.length).toBeGreaterThanOrEqual(3);
  });
});
