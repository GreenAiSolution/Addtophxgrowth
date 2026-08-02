import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  MAX_ATTEMPTS,
  backoffMs,
  confidenceVerdict,
  escalationBrief,
  extractJson,
  nextStep,
  reasonLabel,
  repairPrompt,
  validate,
} from "@/lib/resilience";

/**
 * These are the tests for the days the model is wrong, which is most of the
 * days that matter. The behaviours being pinned are the ones that keep an
 * unattended run from doing either of the two unacceptable things: collapsing,
 * or carrying on as though nothing happened.
 */

const Report = z.object({
  reviewed: z.number().int(),
  summary: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

describe("getting a report out of a reply", () => {
  it("reads a fenced block", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("reads a bare object", () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });

  it("survives a model that says hello first", () => {
    // Losing an otherwise perfect run to a leading "Here's the report:" is a
    // bad trade for strictness nobody benefits from.
    expect(extractJson('Here is the report: {"a":1} — let me know')).toBe('{"a":1}');
  });

  it("returns nothing when there is nothing", () => {
    expect(extractJson("I could not complete this today.")).toBeNull();
  });
});

describe("validation errors are written to be sent back to the model", () => {
  it("accepts a valid report", () => {
    const out = validate('```json\n{"reviewed":3,"summary":"ok","confidence":0.8}\n```', Report);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.reviewed).toBe(3);
  });

  it("names the missing field rather than describing the shape", () => {
    const out = validate('{"reviewed":3,"summary":"ok"}', Report);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("confidence");
  });

  it("says when there was no JSON at all", () => {
    const out = validate("nothing to report today", Report);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/No JSON object/);
  });

  it("does not repair malformed JSON on the model's behalf", () => {
    // Repairing it in code means guessing what the model meant, and the model
    // is right there and can be asked.
    const out = validate('{"reviewed":3,}', Report);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/did not parse/);
  });
});

describe("the repair prompt", () => {
  const prompt = repairPrompt("confidence: Required", '{"reviewed":3}');

  it("quotes back what was actually sent", () => {
    // Without it the model is fixing something it cannot see, and it will
    // frequently reproduce the identical mistake.
    expect(prompt).toContain('{"reviewed":3}');
  });

  it("states the problem in the model's own terms", () => {
    expect(prompt).toContain("confidence: Required");
  });

  it("stops it calling more tools on the way back", () => {
    expect(prompt).toContain("Do not call any more tools");
  });
});

describe("retries are bounded", () => {
  it("retries below the ceiling and escalates at it", () => {
    expect(nextStep("INVALID_OUTPUT", 1)).toBe("retry");
    expect(nextStep("MODEL_ERROR", MAX_ATTEMPTS - 1)).toBe("retry");
    expect(nextStep("MODEL_ERROR", MAX_ATTEMPTS)).toBe("escalate");
    expect(nextStep("TOOL_ERROR", MAX_ATTEMPTS + 5)).toBe("escalate");
  });

  it("backs off, and caps", () => {
    expect(backoffMs(1)).toBeLessThan(backoffMs(2));
    expect(backoffMs(50)).toBeLessThanOrEqual(8_000);
  });
});

describe("confidence can stop a run and can never authorise one", () => {
  it("acts at or above the floor", () => {
    expect(confidenceVerdict(0.8, 0.8).do).toBe("act");
    expect(confidenceVerdict(0.95, 0.7).do).toBe("act");
  });

  it("escalates below it", () => {
    const v = confidenceVerdict(0.4, 0.7);
    expect(v.do).toBe("escalate");
    expect(v.why).toContain("0.40");
  });

  it("treats a missing confidence as none", () => {
    // A report that forgot the field is a report that did not think about it.
    expect(confidenceVerdict(undefined, 0.5).do).toBe("escalate");
    expect(confidenceVerdict(null, 0.5).do).toBe("escalate");
    expect(confidenceVerdict(NaN, 0.5).do).toBe("escalate");
  });
});

describe("an escalation is written for the person who has to answer it", () => {
  const brief = escalationBrief({
    reason: "OVER_CEILING",
    employee: "The Foreman",
    duty: "Quote the work that was won",
    subject: "Marsh Bros",
    question: "Quote Marsh Bros $4,200 for the re-pipe?",
    detail: "Above the ceiling of $2,000.",
    facts: ["Closest past job: 2025-11 re-pipe at $3,980"],
  });

  it("opens with the question, not the provenance", () => {
    // The reader is a business owner between jobs. An escalation that opens
    // with machinery gets read once and skimmed forever after.
    expect(brief.body.split("\n")[0]).toBe("Quote Marsh Bros $4,200 for the re-pipe?");
  });

  it("titles it with what happened and who it is about", () => {
    expect(brief.title).toBe("Above the ceiling — Marsh Bros");
  });

  it("carries the facts a human would otherwise have to go and find", () => {
    expect(brief.body).toContain("2025-11 re-pipe at $3,980");
  });

  it("falls back to the duty when there is no subject", () => {
    const b = escalationBrief({
      reason: "MODEL_ERROR",
      employee: "The Diary",
      duty: "Remind whoever is due",
      question: "Anything needed by hand today?",
      detail: "The model was unavailable.",
    });
    expect(b.title).toContain("Remind whoever is due");
  });

  it("has a plain-English label for every reason", () => {
    for (const reason of [
      "LOW_CONFIDENCE",
      "OVER_CEILING",
      "NO_AUTHORITY",
      "INVALID_OUTPUT",
      "MODEL_ERROR",
      "TOOL_ERROR",
      "ASKED",
    ] as const) {
      expect(reasonLabel(reason).length).toBeGreaterThan(0);
      expect(reasonLabel(reason)).not.toMatch(/_/);
    }
  });
});
