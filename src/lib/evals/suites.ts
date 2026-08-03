/**
 * THE EVAL HARNESS — the suites.
 *
 * Five model surfaces ship to paying clients, and this is the list:
 *
 *   qualifier   the reply that decides which lead gets called first
 *   outcomes    that same qualifier judged against deals that actually closed
 *   coder       the creative coding the entire genome is built on
 *   copy        the advertisement that goes out under a client's name
 *   extraction  what a conversation is recorded as having concluded
 *
 * WEIGHTS
 *   Weights encode what a failure costs, not how interesting it is.
 *
 *   `noFabricatedStats` is weighted highest of anything here because it is the
 *   only scorer whose failure is a legal problem rather than a quality one.
 *   `completeness` is weighted lowest — near zero — because the coder is
 *   instructed to omit rather than guess, so rewarding completeness would
 *   train the exact behaviour the taxonomy forbids. It is measured to notice a
 *   collapse, not to push a number up.
 */

import { parseScore } from "@/lib/night-shift";
import { parseCoding } from "@/lib/genome/genome";
import { parseExtraction } from "@/lib/conversations/ingest";
import {
  agreement,
  calibration,
  completeness,
  discrimination,
  noFabricatedStats,
  noFakeTestimonial,
  objectionMatch,
  outcomeMatch,
  priceFidelity,
  schemaCompliance,
  tierCoherence,
  vocabularyCompliance,
  type Graded,
} from "./scorers";
import { runSuite, type EvalCase, type SuiteResult } from "./suite";
import {
  HEALTHY_CODER,
  HEALTHY_COPY,
  HEALTHY_EXTRACTION,
  HEALTHY_OUTCOMES,
  HEALTHY_QUALIFIER,
  type CoderCase,
  type CopyCase,
  type ExtractionCase,
  type ReplyCase,
} from "./fixtures";

/** The fields the overnight instruction block demands. */
export const QUALIFIER_REQUIRED = ["score", "tier", "reasoning", "nextAction"];

export const WEIGHTS = {
  qualifier: { schema: 3, coherence: 2 },
  outcomes: { discrimination: 4, calibration: 2 },
  coder: { vocabulary: 3, agreement: 3, completeness: 0.25 },
  copy: { noFabricatedStats: 5, noFakeTestimonial: 3 },
  // priceFidelity outweighs the rest because a hallucinated figure does not
  // stop at the transcript: it flows through foldIntoMemory into the client's
  // average-deal-value fact, and nothing between here and there could catch it.
  extraction: { priceFidelity: 5, outcome: 3, objections: 2 },
} as const;

export function qualifierSuite(cases: ReplyCase[] = HEALTHY_QUALIFIER): SuiteResult {
  const evalCases: EvalCase<string>[] = cases.map((c) => ({
    key: c.key,
    about: c.about,
    output: c.reply,
  }));

  return runSuite(
    "qualifier",
    evalCases,
    (c) => {
      const parsed = parseScore(c.output);
      return {
        schema: schemaCompliance(parsed as unknown as Record<string, unknown>, QUALIFIER_REQUIRED),
        coherence: tierCoherence(parsed),
      };
    },
    WEIGHTS.qualifier,
  );
}

/**
 * The only suite graded against something that actually happened.
 *
 * One case, because discrimination and calibration are properties of a set of
 * predictions rather than of any single one — an AUC over one lead is not a
 * number.
 */
export function outcomeSuite(rows: Graded[] = HEALTHY_OUTCOMES): SuiteResult {
  const evalCases: EvalCase<Graded[]>[] = [
    { key: "closed-deals", about: "Scores next to the outcome each lead reached.", output: rows },
  ];

  return runSuite(
    "outcomes",
    evalCases,
    (c) => ({
      discrimination: discrimination(c.output),
      calibration: calibration(c.output),
    }),
    WEIGHTS.outcomes,
  );
}

export function coderSuite(cases: CoderCase[] = HEALTHY_CODER): SuiteResult {
  const evalCases: EvalCase<CoderCase>[] = cases.map((c) => ({
    key: c.key,
    about: c.about,
    output: c,
    gold: c.gold,
  }));

  return runSuite(
    "coder",
    evalCases,
    (c) => {
      const { coding, raw } = parseCoding(c.output.reply);
      return {
        vocabulary: vocabularyCompliance(raw),
        agreement: agreement(coding, c.output.gold),
        completeness: completeness(coding),
      };
    },
    WEIGHTS.coder,
  );
}

export function copySuite(cases: CopyCase[] = HEALTHY_COPY): SuiteResult {
  const evalCases: EvalCase<string>[] = cases.map((c) => ({
    key: c.key,
    about: c.about,
    output: c.copy,
  }));

  return runSuite(
    "copy",
    evalCases,
    (c) => ({
      noFabricatedStats: noFabricatedStats(c.output),
      noFakeTestimonial: noFakeTestimonial(c.output),
    }),
    WEIGHTS.copy,
  );
}

export function extractionSuite(cases: ExtractionCase[] = HEALTHY_EXTRACTION): SuiteResult {
  const evalCases: EvalCase<ExtractionCase>[] = cases.map((c) => ({
    key: c.key,
    about: c.about,
    output: c,
    gold: c.gold,
  }));

  return runSuite(
    "extraction",
    evalCases,
    (c) => {
      const { extraction } = parseExtraction(c.output.reply);
      const gold = c.output.gold;
      return {
        priceFidelity: priceFidelity(extraction.quotedCents, gold.quotedCents),
        outcome: outcomeMatch(extraction.outcome, gold.outcome),
        objections: objectionMatch(
          extraction.objections.map((o) => o.key),
          gold.objectionKeys,
        ),
      };
    },
    WEIGHTS.extraction,
  );
}

/** Everything CI grades, in one call. */
export function allSuites(): SuiteResult[] {
  return [qualifierSuite(), outcomeSuite(), coderSuite(), copySuite(), extractionSuite()];
}
