import { describe, expect, it } from "vitest";
import {
  ENTITY_ATTRIBUTES,
  readEntity,
  entityJsonLd,
  entitySentence,
  confidenceOf,
  type EntityAnswers,
} from "./entity";
import {
  CITATION_SOURCES,
  readCorroboration,
  webLayout,
  type CorroborationAnswers,
} from "./corroboration";
import { CLOCK_DEFAULTS, readClock } from "./response";
import { QUERIES, readFan, fanLayout } from "./queries";
import { CHANNEL_DEFAULTS, readMarginal, leadsAt } from "./marginal";

/**
 * These instruments exist to make complicated things legible. That only works
 * if what they show is true, so the bar here is higher than "does not crash":
 * each one has to be provably incapable of asserting something it was not
 * given.
 *
 * The rule the whole site runs on — no invented statistics, ever — is easy to
 * keep in prose and easy to lose in a chart, because a curve looks like
 * evidence whether or not it is. So the tests below check the arithmetic and
 * then check the honesty: that a default instrument claims nothing, that every
 * curve passes through the visitor's own reported point, and that no reading
 * is manufactured out of an empty form.
 */

const noAnswers: EntityAnswers = {};
const full = (corroborated: boolean): EntityAnswers =>
  Object.fromEntries(ENTITY_ATTRIBUTES.map((a) => [a.key, { stated: true, corroborated }]));

describe("the Answer Engine Inspector", () => {
  it("grades a fact by whether anybody but you says it", () => {
    expect(confidenceOf(undefined)).toBe("absent");
    expect(confidenceOf({ stated: false, corroborated: true })).toBe("absent");
    expect(confidenceOf({ stated: true, corroborated: false })).toBe("inferred");
    expect(confidenceOf({ stated: true, corroborated: true })).toBe("resolved");
  });

  it("reads an empty form as unresolvable, not as zero", () => {
    const r = readEntity(noAnswers);
    expect(r.resolvable).toBe(false);
    expect(r.absent).toBe(ENTITY_ATTRIBUTES.length);
    // Every required attribute should be named as blocking — a resolver does
    // not rank you low, it declines to consider you.
    expect(r.blocking.length).toBe(ENTITY_ATTRIBUTES.filter((a) => a.required).length);
  });

  it("resolves only when every required attribute is at least stated", () => {
    const required = ENTITY_ATTRIBUTES.filter((a) => a.required);
    const answers: EntityAnswers = Object.fromEntries(
      required.map((a) => [a.key, { stated: true, corroborated: false }]),
    );
    expect(readEntity(answers).resolvable).toBe(true);

    // Remove any single required attribute and it stops resolving.
    for (const a of required) {
      const short = { ...answers };
      delete short[a.key];
      expect(readEntity(short).resolvable, `${a.key} should be load-bearing`).toBe(false);
    }
  });

  it("counts stated-but-uncorroborated separately from resolved", () => {
    expect(readEntity(full(false)).inferred).toBe(ENTITY_ATTRIBUTES.length);
    expect(readEntity(full(false)).resolved).toBe(0);
    expect(readEntity(full(true)).resolved).toBe(ENTITY_ATTRIBUTES.length);
  });

  it("emits JSON-LD containing only what was actually claimed", () => {
    const empty = JSON.parse(entityJsonLd(noAnswers, "")) as Record<string, unknown>;
    expect(Object.keys(empty)).toEqual(["@context", "@type"]);
    expect(empty["@type"]).toBe("Thing"); // not a LocalBusiness until categorised

    const complete = JSON.parse(entityJsonLd(full(true), "Acme Plumbing")) as Record<
      string,
      unknown
    >;
    expect(complete["@type"]).toBe("LocalBusiness");
    expect(complete.name).toBe("Acme Plumbing");
    expect(complete.aggregateRating).toBeDefined();
  });

  it("emits valid JSON at every intermediate state", () => {
    // The document is shown live as the visitor toggles. A state that produces
    // broken JSON would be an instrument teaching the wrong thing.
    for (const a of ENTITY_ATTRIBUTES) {
      const one: EntityAnswers = { [a.key]: { stated: true, corroborated: false } };
      expect(() => JSON.parse(entityJsonLd(one, "X"))).not.toThrow();
    }
  });

  it("says what an assistant cannot say, not what it will do", () => {
    const s = entitySentence(readEntity(noAnswers), "Acme");
    expect(s.can).toContain("cannot name");
    // No prediction, no percentage, no outcome.
    expect(`${s.can} ${s.cannot}`).not.toMatch(/\d+%|rank|traffic|more calls/i);
  });

  it("never claims completeness it was not given", () => {
    const partial: EntityAnswers = Object.fromEntries(
      ENTITY_ATTRIBUTES.filter((a) => a.required).map((a) => [
        a.key,
        { stated: true, corroborated: false },
      ]),
    );
    const s = entitySentence(readEntity(partial), "Acme");
    expect(s.cannot).toBeTruthy();
    // Asserts the *intent* — that it names what is still unknown — rather than
    // one phrasing. The copy was rewritten in plain English and this test
    // failed on the wording alone, which is a test measuring the wrong thing.
    expect(s.cannot!).toMatch(/can(no|')t/i);
  });
});

describe("the Corroboration Web", () => {
  const none: CorroborationAnswers = {};
  const all = (consistent: boolean): CorroborationAnswers =>
    Object.fromEntries(CITATION_SOURCES.map((s) => [s.key, { present: true, consistent }]));

  it("counts independent domains, not listings", () => {
    const r = readCorroboration(all(true));
    expect(r.reach).toBe(CITATION_SOURCES.length);
    expect(r.consistent).toBe(CITATION_SOURCES.length);
    expect(r.conflicts).toBe(0);
  });

  it("never nets a conflicting record off against a good one", () => {
    // Twelve listings that disagree are not corroboration. If conflicts were
    // subtracted from reach this would read as a healthy web.
    const r = readCorroboration(all(false));
    expect(r.reach).toBe(CITATION_SOURCES.length);
    expect(r.consistent).toBe(0);
    expect(r.conflicts).toBe(CITATION_SOURCES.length);
    expect(r.corroborated).toBe(false);
  });

  it("treats a conflicting anchor as worse than a missing one", () => {
    const anchors = CITATION_SOURCES.filter((s) => s.anchor);
    const conflicted: CorroborationAnswers = {
      ...all(true),
      [anchors[0]!.key]: { present: true, consistent: false },
    };
    const r = readCorroboration(conflicted);
    expect(r.missingAnchors).toHaveLength(0);
    expect(r.conflictingAnchors).toHaveLength(1);
    // Present everywhere, and still not corroborated.
    expect(r.reach).toBe(CITATION_SOURCES.length);
    expect(r.corroborated).toBe(false);
  });

  it("reads an empty web as uncorroborated with every anchor named", () => {
    const r = readCorroboration(none);
    expect(r.reach).toBe(0);
    expect(r.corroborated).toBe(false);
    expect(r.missingAnchors).toHaveLength(CITATION_SOURCES.filter((s) => s.anchor).length);
  });

  it("lays the web out deterministically, anchors nearest the centre", () => {
    const a = webLayout(all(true), 100);
    const b = webLayout(all(true), 100);
    expect(a).toEqual(b); // no randomness — a screenshot stays true

    const dist = (n: { x: number; y: number }) => Math.hypot(n.x, n.y);
    const anchors = a.filter((n) => n.anchor);
    const rest = a.filter((n) => !n.anchor);
    expect(Math.max(...anchors.map(dist))).toBeLessThan(Math.min(...rest.map(dist)));
    expect(a).toHaveLength(CITATION_SOURCES.length);
  });
});

describe("the Response Clock", () => {
  it("orders the interval and subtracts, nothing more", () => {
    const r = readClock(CLOCK_DEFAULTS);
    expect(r.answerWindow).toBe(CLOCK_DEFAULTS.rings * CLOCK_DEFAULTS.secondsPerRing);
    // Events are always in time order, whatever the inputs.
    const times = r.events.map((e) => e.at);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("knows when you have been beaten to the job, and by how much", () => {
    const r = readClock({ ...CLOCK_DEFAULTS, callbackMinutes: 20, competitorMinutes: 4 });
    expect(r.overtaken).toBe(true);
    expect(r.beatenBy).toBe((20 - 4) * 60);
  });

  it("does not claim you lost when you called back first", () => {
    const r = readClock({ ...CLOCK_DEFAULTS, callbackMinutes: 2, competitorMinutes: 30 });
    expect(r.overtaken).toBe(false);
    expect(r.beatenBy).toBe(0);
  });

  it("survives every extreme a slider can reach", () => {
    for (const inputs of [
      { rings: 0, secondsPerRing: 0, callbackMinutes: 0, competitorMinutes: 0, voicemailRate: 0 },
      { rings: 99, secondsPerRing: 99, callbackMinutes: 999, competitorMinutes: 999, voicemailRate: 99 },
      { rings: -5, secondsPerRing: -1, callbackMinutes: -10, competitorMinutes: -1, voicemailRate: -3 },
    ]) {
      const r = readClock(inputs);
      expect(Number.isFinite(r.span)).toBe(true);
      expect(r.span).toBeGreaterThan(0);
      expect(r.silentOfTen).toBeGreaterThanOrEqual(0);
      expect(r.silentOfTen).toBeLessThanOrEqual(10);
    }
  });

  it("keeps every event inside the span it asks the chart to draw", () => {
    // The span used to pad by a whole extra answer window, which on a
    // twenty-minute callback squashed the rings and the voicemail into the
    // leftmost 2% of the track — one smudge where the story is.
    for (const callbackMinutes of [0, 1, 20, 120]) {
      const r = readClock({ ...CLOCK_DEFAULTS, callbackMinutes });
      const last = Math.max(...r.events.map((e) => e.at));
      expect(last).toBeLessThanOrEqual(r.span);
      // …and not so much padding that the events bunch up at the start.
      expect(last / r.span).toBeGreaterThan(0.7);
    }
  });

  it("reports how many callers leave no trace, from the rate given", () => {
    expect(readClock({ ...CLOCK_DEFAULTS, voicemailRate: 2 }).silentOfTen).toBe(8);
    expect(readClock({ ...CLOCK_DEFAULTS, voicemailRate: 10 }).silentOfTen).toBe(0);
  });
});

describe("the Query Fan", () => {
  it("locks everything when nothing is declared", () => {
    const r = readFan(noAnswers);
    expect(r.winnable).toBe(0);
    expect(r.locked).toBe(r.total);
    expect(r.total).toBe(QUERIES.length);
  });

  it("opens everything when every attribute is declared", () => {
    const r = readFan(full(false));
    expect(r.winnable).toBe(QUERIES.length);
    expect(r.locked).toBe(0);
    expect(r.keystone).toBeNull();
  });

  it("is set membership, not a score", () => {
    // A question is winnable exactly when every attribute it filters on is
    // present. No partial credit — an assistant applying "open now" does not
    // rank you lower for having no hours, it removes you from the list.
    const answers: EntityAnswers = {
      category: { stated: true, corroborated: false },
      area: { stated: true, corroborated: false },
    };
    const r = readFan(answers);
    const discovery = r.readings.find((x) => x.query.text === "who does this in my town")!;
    expect(discovery.winnable).toBe(true);
    const openNow = r.readings.find((x) => x.query.text === "who's open right now near me")!;
    expect(openNow.winnable).toBe(false);
    // Resolved from the catalogue rather than typed, so renaming an attribute
    // for readability cannot break a test about resolution logic.
    const hoursLabel = ENTITY_ATTRIBUTES.find((a) => a.key === "hours")!.label;
    expect(openNow.missing).toContain(hoursLabel);
  });

  it("ignores corroboration — this instrument only asks whether it is readable", () => {
    // Corroboration is instrument 02's subject. Conflating them here would
    // double-count one problem and make both readouts wrong.
    expect(readFan(full(false)).winnable).toBe(readFan(full(true)).winnable);
  });

  it("names the one missing attribute that unlocks the most questions", () => {
    // Everything except hours. The keystone must be hours, and it must only
    // count questions that hours alone would flip.
    const answers: EntityAnswers = Object.fromEntries(
      ENTITY_ATTRIBUTES.filter((a) => a.key !== "hours").map((a) => [
        a.key,
        { stated: true, corroborated: false },
      ]),
    );
    const r = readFan(answers);
    expect(r.keystone?.key).toBe("hours");
    expect(r.keystone!.unlocks).toBe(r.locked);
  });

  it("never names a keystone that would not actually unlock anything", () => {
    // With two attributes missing from every locked question, no single fix
    // opens one, so claiming a keystone would be advice that does not work.
    const answers: EntityAnswers = {
      category: { stated: true, corroborated: false },
    };
    const r = readFan(answers);
    if (r.keystone) {
      expect(r.keystone.unlocks).toBeGreaterThan(0);
    }
  });

  it("lays the fan out deterministically and inside the arc", () => {
    const a = fanLayout(readFan(full(true)));
    expect(a).toEqual(fanLayout(readFan(full(true))));
    expect(a).toHaveLength(QUERIES.length);
    for (const n of a) {
      expect(n.angle).toBeGreaterThanOrEqual(-Math.PI * 1.25 - 1e-9);
      expect(n.angle).toBeLessThanOrEqual(Math.PI * 0.25 + 1e-9);
      expect(n.reach).toBeGreaterThan(0);
      expect(n.reach).toBeLessThanOrEqual(1);
    }
  });

  it("claims no volume for any question", () => {
    // These are phrasings we wrote, not queries we measured. A number beside
    // one would be the invented statistic this site refuses to print.
    for (const q of QUERIES) {
      expect(q.text).not.toMatch(/\d/);
      expect(Object.keys(q)).toEqual(expect.not.arrayContaining(["volume", "searches", "count"]));
    }
  });

  it("only filters on attributes the Inspector actually offers", () => {
    // A question needing an attribute nobody can declare would be permanently
    // locked with no way to fix it — an instrument that only ever says no.
    const known = new Set(ENTITY_ATTRIBUTES.map((a) => a.key));
    for (const q of QUERIES) {
      for (const need of q.needs) {
        expect(known.has(need), `"${q.text}" needs unknown attribute "${need}"`).toBe(true);
      }
    }
  });
});

describe("the Marginal Dollar", () => {
  it("claims nothing at all until the visitor asserts curvature", () => {
    // THE honesty test for this instrument. At exponent 1 the model is linear,
    // reallocation cannot help, and the tool must say so rather than
    // manufacturing an opportunity.
    const r = readMarginal(CHANNEL_DEFAULTS, 1);
    expect(r.neutral).toBe(true);
    expect(r.headroom).toBeLessThan(1);
  });

  it("passes every curve exactly through the visitor's reported point", () => {
    // If the fitted curve missed their own numbers, everything downstream
    // would be our invention rather than their data.
    for (const a of [0.4, 0.6, 0.8, 1]) {
      const r = readMarginal(CHANNEL_DEFAULTS, a);
      for (const c of r.channels) {
        const k = c.leads / Math.pow(c.spend, a);
        expect(leadsAt(c.spend, k, a)).toBeCloseTo(c.leads, 6);
      }
    }
  });

  it("distinguishes average cost per lead from marginal", () => {
    const r = readMarginal(CHANNEL_DEFAULTS, 0.6);
    for (const c of r.channels) {
      // Under diminishing returns the next lead always costs more than the
      // average. This is the entire point of the instrument.
      expect(c.marginalCpl).toBeGreaterThan(c.averageCpl);
    }
  });

  it("keeps the budget the same when it reallocates", () => {
    const r = readMarginal(CHANNEL_DEFAULTS, 0.6);
    const moved = r.channels.reduce((n, c) => n + c.suggested, 0);
    expect(moved).toBeCloseTo(r.totalSpend, -1);
    // What is taken from one channel is given to another.
    expect(r.channels.reduce((n, c) => n + c.delta, 0)).toBeCloseTo(0, -1);
  });

  it("never proposes moving money to a channel with no evidence", () => {
    const withIdle = [...CHANNEL_DEFAULTS, { key: "x", name: "Untested", spend: 0, leads: 0 }];
    const r = readMarginal(withIdle, 0.5);
    const idle = r.channels.find((c) => c.key === "x")!;
    expect(idle.idle).toBe(true);
    expect(idle.suggested).toBe(0);
    expect(idle.delta).toBe(0);
  });

  it("returns finite, non-negative readings from an empty form", () => {
    const r = readMarginal([{ key: "a", name: "A", spend: 0, leads: 0 }], 0.5);
    expect(r.blendedCpl).toBe(0);
    expect(r.headroom).toBe(0);
    expect(Number.isFinite(r.rebalancedLeads)).toBe(true);
  });

  it("finds headroom only where the channels genuinely differ", () => {
    // Two identical channels are already balanced; there is nothing to find,
    // and an instrument that invented some would be lying with a chart.
    const twins = [
      { key: "a", name: "A", spend: 5000, leads: 100 },
      { key: "b", name: "B", spend: 5000, leads: 100 },
    ];
    expect(readMarginal(twins, 0.6).headroom).toBeLessThan(1);

    const lopsided = [
      { key: "a", name: "A", spend: 9000, leads: 100 },
      { key: "b", name: "B", spend: 1000, leads: 80 },
    ];
    expect(readMarginal(lopsided, 0.6).headroom).toBeGreaterThan(0);
  });
});
