import { describe, expect, it } from "vitest";
import baselines from "./baselines.json";
import { gate, report, TOLERANCE, type Baseline } from "./suite";
import { allSuites, coderSuite, copySuite, extractionSuite, outcomeSuite, qualifierSuite } from "./suites";
import {
  ADVERSARIAL_CODER,
  ADVERSARIAL_COPY,
  ADVERSARIAL_EXTRACTION,
  ADVERSARIAL_FLAT_OUTCOMES,
  ADVERSARIAL_INVERTED_OUTCOMES,
  ADVERSARIAL_QUALIFIER,
  HEALTHY_COPY,
  HEALTHY_OUTCOMES,
} from "./fixtures";
import {
  calibration,
  discrimination,
  noFabricatedStats,
  noFakeTestimonial,
  objectionMatch,
  outcomeMatch,
  priceFidelity,
  tierCoherence,
} from "./scorers";

/**
 * Two jobs, and the second is the one that matters.
 *
 *   THE GATE asserts each suite still scores at least what it scored when the
 *   baseline was recorded. That is the regression half.
 *
 *   THE NON-VACUITY TESTS assert that every scorer actually fails on the thing
 *   it exists to catch. A harness of scorers that all return 1.0 no matter
 *   what would pass the gate forever and would be worse than having no
 *   harness at all, because the green build would be evidence.
 *
 *   The README describes doing exactly this for the catalogue rules — the
 *   additive check was "verified non-vacuous by re-adding a cut upgrade and
 *   confirming it fails". Same idea, applied to model output.
 */

const baselineFor = (key: string): Baseline =>
  (baselines as unknown as Record<string, Baseline>)[key];

describe("the gate", () => {
  for (const suite of allSuites()) {
    it(`${suite.key} holds its baseline`, () => {
      const baseline = baselineFor(suite.key);
      expect(baseline, `no baseline recorded for "${suite.key}"`).toBeDefined();

      const verdict = gate(suite, baseline);
      // The report is attached to the failure message rather than logged,
      // so a red CI run shows which case broke without a second command.
      expect(verdict.ok, `${verdict.message}\n\n${report(suite)}`).toBe(true);

      if (verdict.kind === "improved") {
        // Not a failure. A prompt: an unrecorded improvement is one the next
        // regression is free to undo silently.
        console.info(`[evals] ${verdict.message}`);
      }
    });
  }

  it("every suite has a baseline and every baseline has a suite", () => {
    const suiteKeys = new Set(allSuites().map((s) => s.key));
    const baselineKeys = Object.keys(baselines).filter((k) => !k.startsWith("_"));
    expect([...suiteKeys].sort()).toEqual(baselineKeys.sort());
  });

  it("fails a suite that drops below its floor", () => {
    // Guarding the guard. If `gate` cannot fail, none of the tests above mean
    // anything.
    const suite = copySuite();
    const impossible: Baseline = { overall: 1, scorers: { noFabricatedStats: 1.5 } };
    const verdict = gate(suite, impossible);
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain("noFabricatedStats");
  });

  it("tolerates float noise but not a real drop", () => {
    const suite = outcomeSuite();
    const justUnder: Baseline = { overall: suite.overall + TOLERANCE / 2 };
    const wellUnder: Baseline = { overall: suite.overall + 0.2 };
    expect(gate(suite, justUnder).ok).toBe(true);
    expect(gate(suite, wellUnder).ok).toBe(false);
  });
});

describe("non-vacuity — every scorer catches what it exists to catch", () => {
  it("noFabricatedStats catches every banned form", () => {
    for (const c of ADVERSARIAL_COPY.filter((x) => x.key !== "invented-testimonial")) {
      const s = noFabricatedStats(c.copy);
      expect(s.score, `${c.key} was allowed through: ${s.detail}`).toBe(0);
    }
  });

  it("noFabricatedStats allows the parent's real fee rates", () => {
    // The check must be able to tell a price from a results claim. One that
    // couldn't would force the fee copy to go vague, which is a worse
    // advertisement rather than a more honest one.
    expect(noFabricatedStats("We take a flat 8% of managed spend.").score).toBe(1);
    expect(noFabricatedStats("6% at Squadron, 4% at Fleet Command.").score).toBe(1);
    expect(noFabricatedStats("Leads up 9% month over month.").score).toBe(0);
  });

  it("noFakeTestimonial catches an attributed quote and ignores ordinary quoting", () => {
    const fake = ADVERSARIAL_COPY.find((c) => c.key === "invented-testimonial")!;
    expect(noFakeTestimonial(fake.copy).score).toBe(0);
    expect(noFakeTestimonial(`Ask us "what will it actually cost" and we'll tell you.`).score).toBe(1);
  });

  it("every healthy copy fixture passes both copy scorers", () => {
    // The mirror of the test above. If the healthy set were also failing, the
    // scorers would be catching a property of English rather than of lying.
    for (const c of HEALTHY_COPY) {
      expect(noFabricatedStats(c.copy).score, c.key).toBe(1);
      expect(noFakeTestimonial(c.copy).score, c.key).toBe(1);
    }
  });

  it("tierCoherence catches a tier that contradicts its own score", () => {
    expect(tierCoherence({ score: 31, tier: "HOT" }).score).toBe(0);
    expect(tierCoherence({ score: 95, tier: "DISQUALIFIED" }).score).toBe(0);
    // And is not so strict that a boundary judgement call reads as a defect.
    expect(tierCoherence({ score: 79, tier: "HOT" }).score).toBe(0.5);
    expect(tierCoherence({ score: 88, tier: "HOT" }).score).toBe(1);
  });

  it("discrimination is blind to nothing except rank", () => {
    const healthy = discrimination(HEALTHY_OUTCOMES).score;
    const flat = discrimination(ADVERSARIAL_FLAT_OUTCOMES).score;
    const inverted = discrimination(ADVERSARIAL_INVERTED_OUTCOMES).score;

    expect(healthy).toBeGreaterThan(0.8);
    // A qualifier with no opinion scores exactly chance — not accidentally well.
    expect(flat).toBeCloseTo(0.5, 10);
    // And one that ranks backwards is worse than useless.
    expect(inverted).toBeLessThan(0.2);
  });

  it("discrimination survives a book with only one outcome class", () => {
    const allWon = HEALTHY_OUTCOMES.map((r) => ({ ...r, outcome: "WON" as const }));
    const s = discrimination(allWon);
    expect(s.score).toBe(0.5);
    expect(s.detail).toContain("one class is empty");
  });

  it("calibration catches confident-and-wrong separately from badly-ranked", () => {
    // The point of having both: this set ranks perfectly and is wildly
    // overconfident. Discrimination cannot see it.
    const overconfident = HEALTHY_OUTCOMES.map((r) => ({
      ...r,
      score: r.outcome === "WON" ? 99 : 96,
    }));
    expect(discrimination(overconfident).score).toBe(1);
    expect(calibration(overconfident).score).toBeLessThan(calibration(HEALTHY_OUTCOMES).score);
  });

  it("the qualifier suite scores adversarial replies below healthy ones", () => {
    expect(qualifierSuite(ADVERSARIAL_QUALIFIER).overall).toBeLessThan(qualifierSuite().overall);
  });

  it("the coder suite scores invented vocabulary below clean codings", () => {
    const adversarial = coderSuite(ADVERSARIAL_CODER);
    expect(adversarial.overall).toBeLessThan(coderSuite().overall);

    const vocab = adversarial.byScorer.find((s) => s.key === "vocabulary")!;
    expect(vocab.mean).toBeLessThan(1);
    expect(vocab.failures.map((f) => f.caseKey)).toContain("invented-values");
  });

  it("the copy suite scores adversarial copy far below healthy copy", () => {
    const adversarial = copySuite(ADVERSARIAL_COPY);
    expect(adversarial.overall).toBeLessThan(0.5);
    expect(copySuite().overall).toBe(1);
  });

  it("priceFidelity punishes an invented figure harder than a missed one", () => {
    // Asymmetric on purpose. Missing a price that was said costs a data point;
    // reporting one that was never said flows through foldIntoMemory into the
    // client's average-deal-value fact, and nothing downstream could catch it.
    expect(priceFidelity(1_200_000, null).score).toBe(0);
    expect(priceFidelity(null, 1_200_000).score).toBe(0.5);
    expect(priceFidelity(null, null).score).toBe(1);
    expect(priceFidelity(1_420_000, 1_420_000).score).toBe(1);
  });

  it("outcomeMatch scores giving up above being confidently wrong", () => {
    // Same principle as the coder being told to omit rather than guess.
    const gaveUp = outcomeMatch("UNCLEAR", "BOOKED").score;
    const confidentlyWrong = outcomeMatch("NOT_INTERESTED", "BOOKED").score;
    expect(gaveUp).toBeGreaterThan(confidentlyWrong);
    expect(outcomeMatch("BOOKED", "BOOKED").score).toBe(1);
  });

  it("objectionMatch does not reward returning everything", () => {
    // Recall alone would score a model that reports every objection in the
    // vocabulary as perfect. Jaccard does not.
    const exact = objectionMatch(["price"], ["price"]).score;
    const shotgun = objectionMatch(
      ["price", "timing", "trust", "competitor", "scope"],
      ["price"],
    ).score;
    expect(exact).toBe(1);
    expect(shotgun).toBeLessThan(0.3);
  });

  it("objectionMatch catches objections invented where a human found none", () => {
    expect(objectionMatch(["price"], []).score).toBe(0);
    expect(objectionMatch([], []).score).toBe(1);
  });

  it("the extraction suite scores adversarial replies below healthy ones", () => {
    const adversarial = extractionSuite(ADVERSARIAL_EXTRACTION);
    expect(adversarial.overall).toBeLessThan(extractionSuite().overall);

    // The invented price specifically has to be the thing that fails.
    const price = adversarial.byScorer.find((s) => s.key === "priceFidelity")!;
    expect(price.failures.map((f) => f.caseKey)).toContain("invented-price");
    expect(price.worst.detail).toContain("invented a price");
  });
});

describe("the runner", () => {
  it("surfaces the worst case, not just the mean", () => {
    // A mean of 0.9 across ten cases hides a zero, and the zero is the one
    // that shipped a fabricated statistic to a client.
    const suite = copySuite([...HEALTHY_COPY, ...ADVERSARIAL_COPY]);
    const stats = suite.byScorer.find((s) => s.key === "noFabricatedStats")!;
    expect(stats.mean).toBeGreaterThan(0.4);
    expect(stats.worst.score).toBe(0);
    expect(stats.worst.detail).toMatch(/fabricated|multiple|guaranteed/);
  });

  it("reports every case it graded", () => {
    const suite = qualifierSuite();
    expect(suite.cases).toBe(5);
    expect(report(suite)).toContain("qualifier");
  });
});
