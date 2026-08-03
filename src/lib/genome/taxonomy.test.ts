import { describe, expect, it } from "vitest";
import {
  AXES,
  AXIS_KEYS,
  coderInstruction,
  codingAgreement,
  codingCompleteness,
  sanitizeCoding,
} from "./taxonomy";
import { parseCoding } from "./genome";

/**
 * The vocabulary is the contract between a model's judgement and a statistical
 * estimate. Everything downstream assumes that two creatives coded `question`
 * really are the same kind of advertisement — so the two failures that matter
 * here are a value the estimator does not recognise getting through, and a
 * value the coder was told about that the estimator would reject.
 */

describe("sanitizeCoding", () => {
  it("keeps what the vocabulary contains", () => {
    const { coding, problems } = sanitizeCoding({ hook: "question", offer: "quote" });
    expect(coding).toEqual({ hook: "question", offer: "quote" });
    expect(problems).toEqual([]);
  });

  it("normalises case and whitespace", () => {
    const { coding } = sanitizeCoding({ hook: "  QUESTION " });
    expect(coding.hook).toBe("question");
  });

  it("drops an invented value and says so", () => {
    // A coder that invents "shock" must not create a one-row cohort that then
    // reads as a finding.
    const { coding, problems } = sanitizeCoding({ hook: "shock" });
    expect(coding.hook).toBeUndefined();
    expect(problems).toEqual([{ axis: "hook", value: "shock", reason: "unknown-value" }]);
  });

  it("drops an invented axis and says so", () => {
    const { coding, problems } = sanitizeCoding({ vibe: "energetic" });
    expect(coding).toEqual({});
    expect(problems[0].reason).toBe("unknown-axis");
  });

  it("treats empty and null as omissions, not problems", () => {
    const { coding, problems } = sanitizeCoding({ hook: "", offer: undefined });
    expect(coding).toEqual({});
    expect(problems).toEqual([]);
  });
});

describe("codingAgreement", () => {
  it("compares only axes both coders attempted", () => {
    const a = { hook: "question", offer: "quote", proof: "review" };
    const b = { hook: "question", offer: "discount" };
    const { agreed, compared, rate } = codingAgreement(a, b);
    expect(compared).toBe(2);
    expect(agreed).toBe(1);
    expect(rate).toBe(0.5);
  });

  it("is zero-safe when there is no overlap", () => {
    expect(codingAgreement({ hook: "question" }, { offer: "quote" })).toEqual({
      agreed: 0,
      compared: 0,
      rate: 0,
    });
  });

  it("is perfect on identical codings", () => {
    const c = { hook: "question", offer: "quote" };
    expect(codingAgreement(c, c).rate).toBe(1);
  });
});

describe("codingCompleteness", () => {
  it("is zero for nothing and one for everything", () => {
    expect(codingCompleteness({})).toBe(0);
    expect(codingCompleteness(Object.fromEntries(AXIS_KEYS.map((k) => [k, "x"])))).toBe(1);
  });
});

describe("coderInstruction", () => {
  const text = coderInstruction();

  it("offers the coder exactly the values the estimator will accept", () => {
    // The failure this prevents: a prompt listing a value that
    // `sanitizeCoding` rejects, which silently throws away every ad using it.
    for (const axis of AXES) {
      expect(text).toContain(`${axis.key} —`);
      for (const v of axis.values) {
        expect(text).toContain(`${v.key}:`);
      }
    }
  });

  it("tells the coder to omit rather than guess", () => {
    expect(text).toContain("Never guess");
  });

  it("names every axis it expects in the response shape", () => {
    for (const key of AXIS_KEYS) expect(text).toContain(`"${key}"`);
  });
});

describe("parseCoding", () => {
  it("reads a fenced json block", () => {
    const { coding } = parseCoding('```json\n{"hook":"question","cta":"call"}\n```');
    expect(coding).toEqual({ hook: "question", cta: "call" });
  });

  it("reads a bare object", () => {
    const { coding } = parseCoding('Here you go: {"hook":"claim"}');
    expect(coding.hook).toBe("claim");
  });

  it("codes nothing rather than partially when the reply is prose", () => {
    // The ad copy itself will contain the word "question" as often as an
    // answer would. A regex scrape here would code the advertisement by what
    // it says rather than by what it is.
    const { coding } = parseCoding("This ad uses a question hook and a call to action.");
    expect(coding).toEqual({});
  });

  it("codes nothing on malformed json", () => {
    expect(parseCoding('```json\n{"hook": "question",\n```').coding).toEqual({});
  });

  it("strips invented values out of otherwise good output", () => {
    const { coding, problems } = parseCoding('```json\n{"hook":"question","offer":"telepathy"}\n```');
    expect(coding).toEqual({ hook: "question" });
    expect(problems).toHaveLength(1);
  });

  it("ignores non-string values instead of coercing them", () => {
    const { coding } = parseCoding('```json\n{"hook":["question"],"cta":3}\n```');
    expect(coding).toEqual({});
  });
});
