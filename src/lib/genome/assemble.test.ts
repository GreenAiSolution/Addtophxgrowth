import { describe, expect, it } from "vitest";
import { accountContrast, buildGenome, clientView, briefingNotes, type CreativeRow } from "./assemble";
import { isDecisive } from "./pool";
import { AXES, STAGE_OF } from "./taxonomy";

/**
 * The claim this file has to earn: pooling a hundred accounts makes every
 * account's next advertisement better. The way that claim goes wrong is
 * subtle and silent — a between-account comparison that reads as a creative
 * insight and is really a fact about who bought which kind of ad.
 *
 * The load-bearing test is `Simpson's paradox` below. It builds a book of
 * business where the naive answer is not merely noisier but *backwards*, and
 * asserts both that the estimator gets it right and that the naive version
 * gets it wrong — because a test that passes for a design that was never in
 * danger proves nothing about the design.
 */

const row = (
  accountId: string,
  creativeId: string,
  coding: CreativeRow["coding"],
  impressions: number,
  clicks: number,
  leads = 0,
): CreativeRow => ({ accountId, creativeId, coding, impressions, clicks, leads });

describe("accountContrast", () => {
  it("excludes uncoded creatives from the control arm", () => {
    // The uncoded row is enormous and terrible. If it leaked into the control
    // arm it would make the treatment look spectacular.
    const rows = [
      row("a", "c1", { hook: "question" }, 10_000, 300),
      row("a", "c2", { hook: "claim" }, 10_000, 250),
      row("a", "c3", {}, 500_000, 100),
    ];
    const built = accountContrast(rows, "hook", "question", "CLICK")!;
    expect(built.control).toEqual({ successes: 250, trials: 10_000 });
  });

  it("returns nothing when the account never varied the device", () => {
    const rows = [
      row("a", "c1", { hook: "question" }, 10_000, 300),
      row("a", "c2", { hook: "question" }, 10_000, 320),
    ];
    // No control arm — this account knows nothing about question hooks, and
    // attributing its baseline to the one device it never varied is the error.
    expect(accountContrast(rows, "hook", "question", "CLICK")).toBeNull();
  });

  it("returns nothing when an arm is too thin", () => {
    const rows = [
      row("a", "c1", { hook: "question" }, 40, 3),
      row("a", "c2", { hook: "claim" }, 10_000, 250),
    ];
    expect(accountContrast(rows, "hook", "question", "CLICK")).toBeNull();
  });

  it("measures the lead stage against clicks, not impressions", () => {
    const rows = [
      row("a", "c1", { offer: "quote" }, 100_000, 1_000, 100),
      row("a", "c2", { offer: "discount" }, 100_000, 1_000, 50),
    ];
    const built = accountContrast(rows, "offer", "quote", "LEAD")!;
    expect(built.control).toEqual({ successes: 50, trials: 1_000 });
    expect(built.study.delta).toBeGreaterThan(0);
  });
});

describe("buildGenome — Simpson's paradox", () => {
  /**
   * Six accounts. In every single one, the question hook beats the direct
   * claim. But the question hook is concentrated in the four accounts with a
   * weak baseline, and the direct claim in the two strong ones — exactly what
   * happens in a real book, where the operators reach for a different device
   * on the harder accounts.
   *
   * Pooled blindly: question 3,300/220,000 = 1.5%, claim 5,400/140,000 = 3.9%.
   * The naive answer is that question hooks are less than half as good.
   * The true within-account answer is that they are slightly better, six
   * times out of six.
   */
  const rows: CreativeRow[] = [
    // Strong accounts, mostly running the direct claim.
    row("strong-1", "s1q", { hook: "question" }, 10_000, 550),
    row("strong-1", "s1c", { hook: "claim" }, 50_000, 2_500),
    row("strong-2", "s2q", { hook: "question" }, 10_000, 550),
    row("strong-2", "s2c", { hook: "claim" }, 50_000, 2_500),
    // Weak accounts, mostly running the question.
    row("weak-1", "w1q", { hook: "question" }, 50_000, 550),
    row("weak-1", "w1c", { hook: "claim" }, 10_000, 100),
    row("weak-2", "w2q", { hook: "question" }, 50_000, 550),
    row("weak-2", "w2c", { hook: "claim" }, 10_000, 100),
    row("weak-3", "w3q", { hook: "question" }, 50_000, 550),
    row("weak-3", "w3c", { hook: "claim" }, 10_000, 100),
    row("weak-4", "w4q", { hook: "question" }, 50_000, 550),
    row("weak-4", "w4c", { hook: "claim" }, 10_000, 100),
  ];

  it("the naive between-account comparison really is backwards", () => {
    // Guarding the guard: if this ever stops holding, the test above is no
    // longer testing what it claims to test.
    const q = rows.filter((r) => r.coding.hook === "question");
    const c = rows.filter((r) => r.coding.hook === "claim");
    const rate = (rs: CreativeRow[]) =>
      rs.reduce((n, r) => n + r.clicks, 0) / rs.reduce((n, r) => n + r.impressions, 0);
    expect(rate(q)).toBeLessThan(rate(c) / 2);
  });

  it("recovers the true direction by comparing within accounts", () => {
    const findings = buildGenome(rows);
    const f = findings.find((x) => x.axis === "hook" && x.value === "question")!;
    expect(f).toBeDefined();
    expect(f.pooled.k).toBe(6);
    expect(f.pooled.effect).toBeGreaterThan(0);
    expect(isDecisive(f.pooled)).toBe(true);
    expect(f.described.direction).toBe("up");
  });

  it("reports the mirror-image finding for the arm it was compared against", () => {
    const findings = buildGenome(rows);
    const claim = findings.find((x) => x.axis === "hook" && x.value === "claim")!;
    expect(claim.pooled.effect).toBeLessThan(0);
  });

  it("quotes the lift against the control arms' real rate", () => {
    const findings = buildGenome(rows);
    const f = findings.find((x) => x.axis === "hook" && x.value === "question")!;
    // Control arms: 5,400 clicks on 140,000 impressions.
    expect(f.baselineRate).toBeCloseTo(5_400 / 140_000, 10);
  });
});

describe("buildGenome — the honesty gates", () => {
  const twoAccounts: CreativeRow[] = [
    row("a", "a1", { hook: "question" }, 50_000, 3_000),
    row("a", "a2", { hook: "claim" }, 50_000, 1_000),
    row("b", "b1", { hook: "question" }, 50_000, 3_000),
    row("b", "b2", { hook: "claim" }, 50_000, 1_000),
  ];

  it("says nothing at all on two accounts, however large the effect", () => {
    // A 3× difference on 200,000 impressions, and the correct output is
    // silence: this is two advertisers' habit, not a fact about advertising.
    expect(buildGenome(twoAccounts)).toEqual([]);
  });

  it("speaks once enough independent accounts have varied the device", () => {
    const four = [
      ...twoAccounts,
      row("c", "c1", { hook: "question" }, 50_000, 3_000),
      row("c", "c2", { hook: "claim" }, 50_000, 1_000),
      row("d", "d1", { hook: "question" }, 50_000, 3_000),
      row("d", "d2", { hook: "claim" }, 50_000, 1_000),
    ];
    const findings = buildGenome(four);
    expect(findings.find((f) => f.axis === "hook" && f.value === "question")).toBeDefined();
  });

  it("returns nothing for an empty book rather than throwing", () => {
    expect(buildGenome([])).toEqual([]);
  });

  it("counts the zero-cell corrections it needed", () => {
    const rows = [
      row("a", "a1", { offer: "quote" }, 10_000, 1_000, 0),
      row("a", "a2", { offer: "discount" }, 10_000, 1_000, 80),
      row("b", "b1", { offer: "quote" }, 10_000, 1_000, 0),
      row("b", "b2", { offer: "discount" }, 10_000, 1_000, 80),
      row("c", "c1", { offer: "quote" }, 10_000, 1_000, 0),
      row("c", "c2", { offer: "discount" }, 10_000, 1_000, 80),
      row("d", "d1", { offer: "quote" }, 10_000, 1_000, 0),
      row("d", "d2", { offer: "discount" }, 10_000, 1_000, 80),
    ];
    const f = buildGenome(rows).find((x) => x.axis === "offer" && x.value === "quote")!;
    expect(f.correctedCount).toBe(4);
    expect(f.pooled.effect).toBeLessThan(0);
  });

  it("puts decisive findings above louder but uncertain ones", () => {
    const findings = buildGenome([
      // Decisive, modest.
      ...["a", "b", "c", "d"].flatMap((id) => [
        row(id, `${id}1`, { hook: "question" }, 200_000, 6_000),
        row(id, `${id}2`, { hook: "claim" }, 200_000, 5_000),
      ]),
      // Huge, wildly inconsistent.
      ...["e", "f", "g", "h"].flatMap((id, i) => [
        row(id, `${id}1`, { visual: "ugc" }, 2_000, i % 2 === 0 ? 400 : 20),
        row(id, `${id}2`, { visual: "artifact" }, 2_000, i % 2 === 0 ? 20 : 400),
      ]),
    ]);
    const first = findings[0];
    expect(isDecisive(first.pooled)).toBe(true);
  });
});

describe("clientView", () => {
  const book: CreativeRow[] = [
    ...["a", "b", "c", "d", "e"].flatMap((id) => [
      row(id, `${id}1`, { hook: "question" }, 100_000, 4_000),
      row(id, `${id}2`, { hook: "claim" }, 100_000, 2_000),
    ]),
  ];

  it("tells an account with no history of the device that it has none", () => {
    const findings = buildGenome(book);
    const view = clientView(findings, ["nobody"]);
    const f = view.find((x) => x.axis === "hook" && x.value === "question")!;
    expect(f.own).toBeNull();
    expect(f.clientSentence).toContain("not run enough of both");
  });

  it("flags an account whose own data genuinely contradicts the book", () => {
    // Account "z" runs the same device and it goes the other way, hard, with
    // enough volume that the disagreement is not noise.
    const withDissenter = [
      ...book,
      row("z", "z1", { hook: "question" }, 400_000, 4_000),
      row("z", "z2", { hook: "claim" }, 400_000, 20_000),
    ];
    const findings = buildGenome(withDissenter);
    const f = clientView(findings, ["z"]).find((x) => x.axis === "hook" && x.value === "question")!;
    expect(f.own).not.toBeNull();
    expect(f.divergent).toBe(true);
    expect(f.clientSentence).toContain("trust yours over the book");
  });

  it("does not cry divergence when the account merely agrees noisily", () => {
    const withAgreer = [
      ...book,
      row("z", "z1", { hook: "question" }, 20_000, 800),
      row("z", "z2", { hook: "claim" }, 20_000, 400),
    ];
    const findings = buildGenome(withAgreer);
    const f = clientView(findings, ["z"]).find((x) => x.axis === "hook" && x.value === "question")!;
    expect(f.divergent).toBe(false);
  });

  it("briefing notes carry only decisive findings", () => {
    const findings = buildGenome(book);
    const notes = briefingNotes(clientView(findings, ["a"]));
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) expect(n).toContain("associated with");
  });
});

describe("the vocabulary and the estimator agree", () => {
  it("every axis is measured against a stage it could actually affect", () => {
    // A hook cannot change whether a click becomes a lead; an offer cannot
    // change whether somebody clicked. An axis scored at the wrong stage
    // produces a real-looking number that means nothing.
    for (const axis of AXES) {
      expect(STAGE_OF[axis.key]).toBe(axis.stage);
      expect(["CLICK", "LEAD"]).toContain(axis.stage);
    }
  });

  it("no axis is empty and no value key repeats within an axis", () => {
    for (const axis of AXES) {
      expect(axis.values.length).toBeGreaterThan(1); // an axis with one value is not an axis
      const keys = axis.values.map((v) => v.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
