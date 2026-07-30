import { describe, expect, it } from "vitest";
import {
  DRILLS,
  RETUNE_THRESHOLD,
  applyPatch,
  drillByKey,
  gradeCall,
  proposeRetunes,
  readOut,
  type GradeInput,
  type GradedCall,
  type Patch,
} from "@/lib/training";
import { defaultPlaybook, playbookSchema, type Playbook, type Turn } from "@/lib/voice";
import { emptyPriceBook, priceBookSchema, type PriceBook } from "@/lib/estimates";

/**
 * The grader is arithmetic, not a model, and these tests are why that decision
 * was worth making. Every case below is a call that would read fluently to a
 * model asked "did this go well?" and is a serious failure in fact.
 */

const pb = (over: Partial<Playbook> = {}): Playbook =>
  playbookSchema.parse({ ...defaultPlaybook({ businessName: "Test Plumbing" }), ...over });

const book = (over: Partial<PriceBook> = {}): PriceBook =>
  priceBookSchema.parse({ ...emptyPriceBook(), ...over });

const filled = {
  caller_name: "Dana",
  callback_number: "602 555 0134",
  job_address: "12 Palm Ave",
  job_description: "Dripping tap",
};

function input(over: Partial<GradeInput> = {}): GradeInput {
  return {
    playbook: pb(),
    turns: [],
    captured: filled,
    outcome: "BOOKED",
    ...over,
  };
}

const caller = (text: string): Turn => ({ role: "caller", text });
const operator = (text: string): Turn => ({ role: "operator", text });

describe("grading one call", () => {
  it("gives a clean call full marks", () => {
    const g = gradeCall(input());
    expect(g.score).toBe(100);
    expect(g.clean).toBe(true);
    expect(g.findings).toEqual([]);
  });

  it("is critical when a call carried on past an opt-out", () => {
    const g = gradeCall(
      input({
        turns: [
          caller("stop calling me"),
          operator("understood, I'll take you off"),
          operator("before you go — can I ask what you were looking for?"),
        ],
        outcome: "OPTED_OUT",
      }),
    );
    expect(g.clean).toBe(false);
    expect(g.findings.some((f) => f.code === "OPT_OUT_IGNORED")).toBe(true);
  });

  it("allows exactly one reply after an opt-out, because that is the acknowledgement", () => {
    const g = gradeCall(
      input({
        turns: [caller("take me off your list"), operator("understood, you won't hear from us again")],
        outcome: "OPTED_OUT",
      }),
    );
    expect(g.findings.some((f) => f.code === "OPT_OUT_IGNORED")).toBe(false);
    expect(g.clean).toBe(true);
  });

  it("is critical when an opt-out was heard and not recorded", () => {
    // The failure mode is not rudeness. It is that they can be called again.
    const g = gradeCall(input({ turns: [caller("do not call me again")], outcome: "QUALIFIED" }));
    expect(g.findings.some((f) => f.code === "OPT_OUT_UNRECORDED")).toBe(true);
  });

  it("is critical when somebody asked for a person and never got one", () => {
    const g = gradeCall(
      input({ turns: [caller("I want to speak to a real person")], outcome: "BOOKED" }),
    );
    expect(g.findings.some((f) => f.code === "HUMAN_REQUEST_IGNORED")).toBe(true);
  });

  it("accepts a handover as the answer to that request", () => {
    const g = gradeCall(
      input({ turns: [caller("are you a robot?")], outcome: "HANDED_OFF" }),
    );
    expect(g.findings.some((f) => f.code === "HUMAN_REQUEST_IGNORED")).toBe(false);
  });

  it("is critical when card digits reached the transcript", () => {
    // Redaction runs before the write. If this fires, it did not run.
    const g = gradeCall(input({ turns: [caller("my card is 4111 1111 1111 1111")] }));
    expect(g.findings.some((f) => f.code === "CARD_IN_TRANSCRIPT")).toBe(true);
    expect(g.clean).toBe(false);
  });

  it("catches a banned phrase in the operator's own words only", () => {
    const p = pb({ neverSay: ["guaranteed"] });
    const said = gradeCall(input({ playbook: p, turns: [operator("it's guaranteed")] }));
    const heard = gradeCall(input({ playbook: p, turns: [caller("is it guaranteed?")] }));
    expect(said.findings.some((f) => f.code === "SAID_FORBIDDEN")).toBe(true);
    expect(heard.findings.some((f) => f.code === "SAID_FORBIDDEN")).toBe(false);
  });

  it("catches a quote above the cap", () => {
    const g = gradeCall(input({ quotedTotalCents: 250000, spokenCapCents: 100000, outcome: "QUOTED" }));
    expect(g.findings.some((f) => f.code === "QUOTED_OVER_CAP")).toBe(true);
  });

  it("ignores the cap when there isn't one", () => {
    const g = gradeCall(input({ quotedTotalCents: 250000, spokenCapCents: 0, outcome: "QUOTED" }));
    expect(g.findings.some((f) => f.code === "QUOTED_OVER_CAP")).toBe(false);
  });

  it("catches a price on a playbook that does not quote", () => {
    const g = gradeCall(input({ playbook: pb({ quoting: "none" }), outcome: "QUOTED" }));
    expect(g.findings.some((f) => f.code === "QUOTED_WHEN_FORBIDDEN")).toBe(true);
  });

  it("treats committing on an incomplete record as worse than an incomplete record", () => {
    const missing = { caller_name: "Dana" };
    const booked = gradeCall(input({ captured: missing, outcome: "BOOKED" }));
    const merely = gradeCall(input({ captured: missing, outcome: "QUALIFIED" }));
    expect(booked.findings[0]!.severity).toBe("MAJOR");
    expect(merely.findings[0]!.severity).toBe("MINOR");
    expect(booked.score).toBeLessThan(merely.score);
  });

  it("does not scold an abandoned call for being incomplete", () => {
    // They hung up. That is not the operator's failure to capture.
    const g = gradeCall(input({ captured: {}, outcome: "ABANDONED" }));
    expect(g.findings.some((f) => f.code === "INCOMPLETE_CAPTURE")).toBe(false);
  });

  it("notices a call that ran to its limit", () => {
    const p = pb({ maxTurns: 4 });
    const turns = Array.from({ length: 8 }, (_, i) => (i % 2 ? operator("mm") : caller("hi")));
    expect(gradeCall(input({ playbook: p, turns })).findings.some((f) => f.code === "HIT_TURN_LIMIT")).toBe(true);
  });

  it("notices an operator that never spoke", () => {
    const g = gradeCall(input({ turns: [caller("hello?"), caller("hello??")] }));
    expect(g.findings.some((f) => f.code === "NEVER_SPOKE")).toBe(true);
  });

  it("never scores below zero, however bad it was", () => {
    const g = gradeCall(
      input({
        playbook: pb({ neverSay: ["guaranteed"] }),
        turns: [
          caller("stop calling me, are you a robot, card 4111 1111 1111 1111"),
          operator("guaranteed"),
          operator("anyway"),
          operator("as I was saying"),
        ],
        captured: {},
        outcome: "QUOTED",
        quotedTotalCents: 900000,
        spokenCapCents: 1000,
      }),
    );
    expect(g.score).toBe(0);
  });

  it("always explains its own score", () => {
    const g = gradeCall(input({ captured: {}, outcome: "QUALIFIED" }));
    const deducted = g.findings.reduce((s, f) => s + f.deducted, 0);
    expect(g.score).toBe(100 - deducted);
    expect(g.headline.length).toBeGreaterThan(0);
  });

  it("leads its headline with the critical finding, not the first one", () => {
    const g = gradeCall(
      input({
        captured: { caller_name: "Dana" },
        turns: [caller("my card is 4111 1111 1111 1111")],
        outcome: "BOOKED",
      }),
    );
    expect(g.headline).toMatch(/Card or ID digits/);
  });
});

describe("what a month of calls proposes", () => {
  function graded(over: Partial<GradedCall> = {}): GradedCall {
    return {
      id: `c${Math.random().toString(36).slice(2, 8)}`,
      outcome: "QUALIFIED",
      grade: { score: 100, clean: true, headline: "", findings: [] },
      captured: filled,
      ...over,
    };
  }

  it("says nothing until the same thing happens enough times", () => {
    const calls = Array.from({ length: RETUNE_THRESHOLD - 1 }, () =>
      graded({ unansweredQuestions: ["Do you do emergency callouts?"] }),
    );
    expect(proposeRetunes(pb(), book(), calls)).toEqual([]);
  });

  it("proposes teaching an answer that keeps causing a handover", () => {
    const calls = Array.from({ length: RETUNE_THRESHOLD }, () =>
      graded({ unansweredQuestions: ["Do you do emergency callouts?"] }),
    );
    const out = proposeRetunes(pb(), book(), calls);
    const answer = out.find((r) => r.patch.op === "add_answer");
    expect(answer).toBeDefined();
    expect(answer!.evidence).toHaveLength(RETUNE_THRESHOLD);
    expect(answer!.why).toContain(String(RETUNE_THRESHOLD));
  });

  it("does not propose an answer it already has", () => {
    const p = pb({ answers: [{ q: "Do you do emergency callouts?", a: "Yes, same day." }] });
    const calls = Array.from({ length: 5 }, () =>
      graded({ unansweredQuestions: ["do you do emergency callouts?"] }),
    );
    expect(proposeRetunes(p, book(), calls).some((r) => r.patch.op === "add_answer")).toBe(false);
  });

  it("proposes both a rate and a service for work it cannot price", () => {
    const calls = Array.from({ length: 4 }, () => graded({ unpricedItems: ["Hot tub install"] }));
    const out = proposeRetunes(pb(), book(), calls);
    expect(out.some((r) => r.patch.op === "add_price_item")).toBe(true);
    expect(out.some((r) => r.patch.op === "add_service")).toBe(true);
  });

  it("proposes relaxing a required question nobody answers", () => {
    const calls = Array.from({ length: 4 }, () =>
      graded({ captured: { caller_name: "Dana", callback_number: "x", job_description: "y" } }),
    );
    const out = proposeRetunes(pb(), book(), calls);
    const relax = out.find((r) => r.patch.op === "relax_qualifier");
    expect(relax).toBeDefined();
    if (relax?.patch.op === "relax_qualifier") expect(relax.patch.slot).toBe("job_address");
  });

  it("counts the most common thing first", () => {
    const calls = [
      ...Array.from({ length: 5 }, () => graded({ unansweredQuestions: ["A?"] })),
      ...Array.from({ length: 3 }, () => graded({ unansweredQuestions: ["B?"] })),
    ];
    const answers = proposeRetunes(pb(), book(), calls).filter((r) => r.patch.op === "add_answer");
    expect(answers[0]!.title).toContain("A?");
  });

  it("gives every proposal a stable key, so it is offered once", () => {
    const calls = Array.from({ length: 4 }, () => graded({ unansweredQuestions: ["Do you do gas?"] }));
    const first = proposeRetunes(pb(), book(), calls);
    const second = proposeRetunes(pb(), book(), calls);
    expect(first.map((r) => r.key)).toEqual(second.map((r) => r.key));
  });
});

describe("applying an approved change", () => {
  const state = () => ({ playbook: pb(), priceBook: book() });

  it("never mutates what it was given", () => {
    const before = state();
    const snapshot = JSON.stringify(before);
    applyPatch(before, { op: "add_service", value: "Gas safety check" });
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("adds a service, once", () => {
    let s = applyPatch(state(), { op: "add_service", value: "Gas safety check" });
    s = applyPatch(s, { op: "add_service", value: "Gas safety check" });
    expect(s.playbook.services.filter((x) => x === "Gas safety check")).toHaveLength(1);
  });

  it("teaches an answer, and replaces it rather than duplicating", () => {
    let s = applyPatch(state(), { op: "add_answer", q: "Do you do gas?", a: "Yes." });
    s = applyPatch(s, { op: "add_answer", q: "do you do gas?", a: "Yes, and we're certified." });
    expect(s.playbook.answers).toHaveLength(1);
    expect(s.playbook.answers[0]!.a).toMatch(/certified/);
  });

  it("ignores an answer with nothing in it", () => {
    const s = applyPatch(state(), { op: "add_answer", q: "Do you do gas?", a: "  " });
    expect(s.playbook.answers).toHaveLength(0);
  });

  it("relaxes a qualifier without deleting it", () => {
    const s = applyPatch(state(), { op: "relax_qualifier", slot: "job_address" });
    const q = s.playbook.qualifiers.find((x) => x.slot === "job_address")!;
    expect(q.required).toBe(false);
    expect(q.ask).toBeTruthy();
  });

  it("adds and then updates a rate", () => {
    const item = { key: "hot_tub", label: "Hot tub install", unit: "each" as const, rateCents: 50000, minQty: 0, aliases: [] };
    let s = applyPatch(state(), { op: "add_price_item", item });
    s = applyPatch(s, { op: "add_price_item", item: { ...item, rateCents: 60000 } });
    expect(s.priceBook.items).toHaveLength(1);
    expect(s.priceBook.items[0]!.rateCents).toBe(60000);
  });

  it("moves the spoken cap", () => {
    const s = applyPatch(state(), { op: "set_spoken_cap", cents: 250000 });
    expect(s.priceBook.maxSpokenTotalCents).toBe(250000);
  });

  it("refuses to produce a playbook the rest of the system would not load", () => {
    // The validation lives in one place and this is not allowed to route round
    // it, whatever a patch asks for.
    const bad = { op: "add_qualifier", qualifier: { slot: "Not A Slot", ask: "?", required: true, expects: "text" } } as unknown as Patch;
    expect(() => applyPatch(state(), bad)).toThrow();
  });
});

describe("the monthly read-out", () => {
  const call = (score: number): GradedCall => ({
    id: `c${score}`,
    outcome: "BOOKED",
    grade: { score, clean: true, headline: "", findings: [] },
    captured: filled,
  });

  it("says so plainly when there is nothing to report", () => {
    const r = readOut({ calls: [], applied: [] });
    expect(r.average).toBeNull();
    expect(r.lines[0]).toMatch(/No calls/);
  });

  it("refuses to call a small sample a trend", () => {
    // Same posture as Recall declining a verdict under three closed matches:
    // counts always shown, conclusions withheld.
    const r = readOut({ calls: [call(90), call(80)], applied: [], previousAverage: 60 });
    expect(r.movement).toMatch(/too few to read as a trend/);
  });

  it("reads movement once there is enough of it", () => {
    const r = readOut({
      calls: Array.from({ length: 12 }, () => call(90)),
      applied: [],
      previousAverage: 70,
    });
    expect(r.movement).toMatch(/up 20 points/);
  });

  it("says when nothing was approved, rather than saying nothing", () => {
    const r = readOut({ calls: [call(100)], applied: [] });
    expect(r.lines.some((l) => /running exactly as it was/.test(l))).toBe(true);
  });

  it("names the changes that went live", () => {
    const r = readOut({
      calls: [call(100)],
      applied: [{ title: "Teach it about gas certs", at: new Date("2026-07-01") }],
    });
    expect(r.lines.some((l) => l.includes("Teach it about gas certs"))).toBe(true);
  });
});

describe("the drills", () => {
  it("covers the failures that would switch the whole thing off", () => {
    const keys = DRILLS.map((d) => d.key);
    for (const required of ["asks-for-human", "opt-out", "card-read", "price-shopper"]) {
      expect(keys, required).toContain(required);
    }
  });

  it("states what each one proves and what a pass looks like", () => {
    for (const d of DRILLS) {
      expect(d.says.length, d.key).toBeGreaterThan(0);
      expect(d.proves.length, d.key).toBeGreaterThan(20);
      expect(d.expectation.length, d.key).toBeGreaterThan(20);
    }
  });

  it("resolves by key", () => {
    expect(drillByKey("opt-out")?.name).toBeTruthy();
    expect(drillByKey("nope")).toBeUndefined();
  });
});
