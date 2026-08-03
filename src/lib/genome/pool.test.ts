import { describe, expect, it } from "vitest";
import {
  MIN_ACCOUNTS,
  armsQualify,
  contrastLogOdds,
  describeEffect,
  isDecisive,
  poolRandomEffects,
  relativeLift,
  shrinkToPool,
  type Study,
} from "./pool";

/**
 * The estimator is the one part of the genome nobody can eyeball. A wrong
 * coefficient here does not throw, does not fail a build, and does not look
 * wrong on a page — it produces a confident sentence telling a business owner
 * to write a different kind of advertisement. So these tests check the
 * arithmetic against values computed by hand, and check the honesty gates by
 * feeding them exactly the inputs they exist to refuse.
 */

describe("contrastLogOdds", () => {
  it("computes the log odds ratio of a hand-checked 2x2", () => {
    // with: 10/100 → odds 10/90. without: 5/100 → odds 5/95.
    // OR = (10*95)/(90*5) = 2.1111…, ln = 0.74721…
    const c = contrastLogOdds({ successes: 10, trials: 100 }, { successes: 5, trials: 100 });
    expect(c).not.toBeNull();
    expect(c!.delta).toBeCloseTo(0.747214, 5);
    // var = 1/10 + 1/90 + 1/5 + 1/95
    expect(c!.variance).toBeCloseTo(0.1 + 1 / 90 + 0.2 + 1 / 95, 8);
    expect(c!.corrected).toBe(false);
  });

  it("is antisymmetric — swapping the arms negates the effect", () => {
    const a = contrastLogOdds({ successes: 10, trials: 100 }, { successes: 5, trials: 100 })!;
    const b = contrastLogOdds({ successes: 5, trials: 100 }, { successes: 10, trials: 100 })!;
    expect(b.delta).toBeCloseTo(-a.delta, 10);
    expect(b.variance).toBeCloseTo(a.variance, 10);
  });

  it("returns exactly zero when both arms perform identically", () => {
    const c = contrastLogOdds({ successes: 50, trials: 500 }, { successes: 100, trials: 1000 })!;
    expect(c.delta).toBeCloseTo(0, 10);
  });

  it("corrects a zero cell rather than discarding the arm", () => {
    // A device that produced no leads at all is evidence about that device.
    // Dropping it would bias every pooled estimate upward.
    const c = contrastLogOdds({ successes: 0, trials: 200 }, { successes: 30, trials: 200 });
    expect(c).not.toBeNull();
    expect(c!.corrected).toBe(true);
    expect(c!.delta).toBeLessThan(0);
    expect(Number.isFinite(c!.delta)).toBe(true);
  });

  it("refuses impossible arms instead of returning a number", () => {
    expect(contrastLogOdds({ successes: 10, trials: 5 }, { successes: 1, trials: 100 })).toBeNull();
    expect(contrastLogOdds({ successes: -1, trials: 100 }, { successes: 1, trials: 100 })).toBeNull();
  });
});

describe("armsQualify", () => {
  it("refuses arms too thin to mean anything", () => {
    expect(armsQualify({ successes: 2, trials: 40 }, { successes: 3, trials: 900 }, "CLICK")).toBe(false);
    expect(armsQualify({ successes: 20, trials: 900 }, { successes: 30, trials: 900 }, "CLICK")).toBe(true);
  });

  it("holds the lead stage to a lower bar than the click stage", () => {
    // 60 clicks is a real lead-stage arm and a meaningless click-stage one.
    const arm = { successes: 5, trials: 60 };
    expect(armsQualify(arm, arm, "LEAD")).toBe(true);
    expect(armsQualify(arm, arm, "CLICK")).toBe(false);
  });
});

describe("poolRandomEffects", () => {
  const study = (accountId: string, delta: number, variance = 0.01): Study => ({
    accountId,
    delta,
    variance,
  });

  it("returns null below the account floor", () => {
    const studies = Array.from({ length: MIN_ACCOUNTS - 1 }, (_, i) => study(`a${i}`, 0.5));
    expect(poolRandomEffects(studies)).toBeNull();
  });

  it("counts independent accounts, not rows", () => {
    // One advertiser splitting spend across many ad accounts is still one
    // advertiser. Counting rows is how a pool of four becomes a pool of one.
    const studies = Array.from({ length: 12 }, (_, i) => study(i < 11 ? "same" : "other", 0.5));
    expect(poolRandomEffects(studies)).toBeNull();
  });

  it("recovers the common effect when every account agrees", () => {
    const studies = ["a", "b", "c", "d", "e"].map((id) => study(id, 0.4));
    const p = poolRandomEffects(studies)!;
    expect(p.effect).toBeCloseTo(0.4, 10);
    expect(p.tau2).toBe(0); // no dispersion beyond noise
    expect(p.i2).toBe(0);
    expect(p.k).toBe(5);
  });

  it("detects between-account heterogeneity and widens the interval for it", () => {
    const agreed = ["a", "b", "c", "d", "e"].map((id) => study(id, 0.4));
    const scattered = [
      study("a", -0.6),
      study("b", 0.2),
      study("c", 1.4),
      study("d", -0.2),
      study("e", 1.0),
    ];

    const tight = poolRandomEffects(agreed)!;
    const loose = poolRandomEffects(scattered)!;

    expect(loose.tau2).toBeGreaterThan(0);
    expect(loose.i2).toBeGreaterThan(0.5);
    // Same number of accounts, same per-account precision, far less certainty.
    const width = (p: { ci: [number, number] }) => p.ci[1] - p.ci[0];
    expect(width(loose)).toBeGreaterThan(width(tight) * 3);
  });

  it("calls a real, consistent effect decisive", () => {
    const p = poolRandomEffects(["a", "b", "c", "d", "e"].map((id) => study(id, 0.8, 0.02)))!;
    expect(isDecisive(p)).toBe(true);
  });

  it("does NOT call scattered evidence decisive — the check is not vacuous", () => {
    // Same magnitude of average effect as above, but the accounts disagree.
    // An estimator that reports this as a finding is the failure mode this
    // whole file exists to prevent.
    const p = poolRandomEffects([
      study("a", -1.2, 0.02),
      study("b", 2.6, 0.02),
      study("c", -0.8, 0.02),
      study("d", 2.4, 0.02),
      study("e", 1.0, 0.02),
    ])!;
    expect(isDecisive(p)).toBe(false);
  });

  it("weights precise accounts more heavily than noisy ones", () => {
    const p = poolRandomEffects([
      study("a", 1.0, 0.001), // very precise
      study("b", 0.0, 1.0),
      study("c", 0.0, 1.0),
      study("d", 0.0, 1.0),
    ])!;
    expect(p.effect).toBeGreaterThan(0.5);
  });
});

describe("shrinkToPool", () => {
  const pooled = poolRandomEffects([
    { accountId: "a", delta: 0.5, variance: 0.05 },
    { accountId: "b", delta: 0.1, variance: 0.05 },
    { accountId: "c", delta: 0.9, variance: 0.05 },
    { accountId: "d", delta: 0.3, variance: 0.05 },
    { accountId: "e", delta: 0.7, variance: 0.05 },
  ])!;

  it("pulls a noisy account almost all the way to the book", () => {
    const own = { accountId: "new", delta: 5.0, variance: 100 };
    const s = shrinkToPool(own, pooled);
    expect(s.ownWeight).toBeLessThan(0.05);
    expect(s.effect).toBeCloseTo(pooled.effect, 1);
  });

  it("lets a well-evidenced account speak for itself", () => {
    const own = { accountId: "big", delta: 5.0, variance: 0.0001 };
    const s = shrinkToPool(own, pooled);
    expect(s.ownWeight).toBeGreaterThan(0.95);
    expect(s.effect).toBeGreaterThan(4.5);
  });

  it("never reports more certainty than the raw observation had", () => {
    const own = { accountId: "x", delta: 2.0, variance: 0.4 };
    const s = shrinkToPool(own, pooled);
    const rawWidth = 2 * 1.959964 * Math.sqrt(own.variance);
    expect(s.ci[1] - s.ci[0]).toBeLessThanOrEqual(rawWidth);
    expect(s.ci[1] - s.ci[0]).toBeGreaterThan(0);
  });

  it("collapses onto the pool when accounts are indistinguishable", () => {
    const homogeneous = poolRandomEffects(
      ["a", "b", "c", "d", "e"].map((id) => ({ accountId: id, delta: 0.4, variance: 0.05 })),
    )!;
    expect(homogeneous.tau2).toBe(0);
    const s = shrinkToPool({ accountId: "x", delta: 3.0, variance: 0.05 }, homogeneous);
    expect(s.ownWeight).toBe(0);
    expect(s.effect).toBeCloseTo(homogeneous.effect, 10);
  });
});

describe("relativeLift", () => {
  it("is zero when there is no effect", () => {
    expect(relativeLift(0, 0.02)).toBeCloseTo(0, 12);
  });

  it("converts a log odds ratio at a hand-checked baseline", () => {
    // baseline 50% → odds 1. lnOR = ln(3) → odds 3 → p = 0.75. lift = +50%.
    expect(relativeLift(Math.log(3), 0.5)).toBeCloseTo(0.5, 10);
  });

  it("refuses degenerate baselines rather than returning Infinity", () => {
    expect(relativeLift(1, 0)).toBeNull();
    expect(relativeLift(1, 1)).toBeNull();
  });
});

describe("describeEffect", () => {
  const opts = { axisLabel: "Hook", valueLabel: "Question", stage: "CLICK" as const, baselineRate: 0.02 };

  it("never claims causation", () => {
    const decisive = poolRandomEffects(
      ["a", "b", "c", "d", "e"].map((id) => ({ accountId: id, delta: 0.8, variance: 0.02 })),
    )!;
    const d = describeEffect(decisive, opts);
    expect(d.decisive).toBe(true);
    expect(d.sentence).toContain("associated with");
    expect(d.sentence.toLowerCase()).not.toMatch(/\bcause|\bdrives\b|\bbecause of\b/);
    // The qualifier travels with the claim, always.
    expect(d.sentence).toContain("not a controlled test");
  });

  it("quotes the range alongside the point estimate", () => {
    const decisive = poolRandomEffects(
      ["a", "b", "c", "d", "e"].map((id) => ({ accountId: id, delta: 0.8, variance: 0.02 })),
    )!;
    expect(describeEffect(decisive, opts).sentence).toContain("range");
  });

  it("reports a straddling interval as no detectable difference, not a small effect", () => {
    const indecisive = poolRandomEffects([
      { accountId: "a", delta: -1.2, variance: 0.02 },
      { accountId: "b", delta: 2.6, variance: 0.02 },
      { accountId: "c", delta: -0.8, variance: 0.02 },
      { accountId: "d", delta: 2.4, variance: 0.02 },
      { accountId: "e", delta: 1.0, variance: 0.02 },
    ])!;
    const d = describeEffect(indecisive, opts);
    expect(d.decisive).toBe(false);
    expect(d.direction).toBe("flat");
    expect(d.sentence).toContain("no detectable difference");
    // And it must not be mistaken for evidence of absence.
    expect(d.sentence).toContain("not a device shown not to matter");
  });
});
