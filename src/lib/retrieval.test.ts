import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { chunk, rrf, mmr } from "@/lib/retrieval";
import {
  EMBEDDING_DIM,
  normalise,
  cosine,
  localProvider,
  provider,
  resetProvider,
  toVectorLiteral,
} from "@/lib/embeddings";

/**
 * Retrieval fails quietly. That is the whole reason this file is long.
 *
 * A ranking bug does not throw — it returns eight plausible records in a
 * slightly wrong order, and every one of them is real, so nothing looks wrong
 * on screen. The parts that decide the order are therefore pure, and this is
 * where they get argued with.
 */

describe("chunking", () => {
  it("leaves short text alone", () => {
    expect(chunk("A short lead note.")).toEqual([{ index: 0, text: "A short lead note." }]);
  });

  it("drops nothing on the floor", () => {
    // The property that matters most and is easiest to break with an
    // off-by-one: every character of the source has to appear somewhere.
    const text = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} about a boiler.`).join(" ");
    const chunks = chunk(text, 300, 50);
    expect(chunks.length).toBeGreaterThan(1);
    const joined = chunks.map((c) => c.text).join(" ");
    for (let i = 0; i < 60; i++) {
      expect(joined, `sentence ${i} vanished`).toContain(`Sentence number ${i}`);
    }
  });

  it("overlaps, so nothing that straddles a boundary is lost", () => {
    const text = "x".repeat(400) + " THE BOUNDARY PHRASE " + "y".repeat(400);
    const chunks = chunk(text, 420, 120);
    const whole = chunks.filter((c) => c.text.includes("THE BOUNDARY PHRASE"));
    expect(whole.length, "the phrase survives in no chunk intact").toBeGreaterThan(0);
  });

  it("always terminates, and numbers chunks in order", () => {
    // The loop advances by (size - overlap). If that were ever <= 0 this hangs
    // forever rather than failing, which is why the constructor refuses it.
    const chunks = chunk("word ".repeat(2000), 200, 199);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
    expect(() => chunk("word ".repeat(500), 200, 200)).toThrow(/smaller than the chunk size/);
  });

  it("produces no empty chunks", () => {
    for (const size of [120, 300, 901]) {
      for (const c of chunk("Lorem ipsum dolor sit amet. ".repeat(90), size, Math.floor(size / 6))) {
        expect(c.text.length, `empty chunk at size ${size}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("reciprocal rank fusion", () => {
  it("rewards a document both halves found over one that only topped a single list", () => {
    // The entire reason for fusing. `b` is second in both; `a` is first in one
    // and absent from the other. Agreement should win.
    const vector = [{ id: "a", rank: 1 }, { id: "b", rank: 2 }];
    const lexical = [{ id: "c", rank: 1 }, { id: "b", rank: 2 }];
    expect(rrf([vector, lexical])[0]!.id).toBe("b");
  });

  it("reads rank and never score", () => {
    // The argument for RRF over a weighted blend: cosine distance and
    // ts_rank_cd are not on comparable scales, so any blending constant is
    // tuned to one dataset. Rank means the same thing in both.
    const a = rrf([[{ id: "x", rank: 1 }], [{ id: "y", rank: 2 }]]);
    const b = rrf([[{ id: "x", rank: 1 }], [{ id: "y", rank: 2 }]]);
    expect(a).toEqual(b);
    expect(a[0]!.id).toBe("x");
  });

  it("damps the top of any single list", () => {
    // With k=0 the first result of one list would swamp everything. At the
    // default, two second-places beat one first-place.
    const single = rrf([[{ id: "solo", rank: 1 }]]);
    const double = rrf([[{ id: "pair", rank: 2 }], [{ id: "pair", rank: 2 }]]);
    expect(double[0]!.score).toBeGreaterThan(single[0]!.score);
  });

  it("is stable, so identical queries do not flicker", () => {
    // Two documents with identical scores must come back in the same order
    // every time. An unstable sort here reads as a bug even when the ranking
    // is right.
    const lists = [[{ id: "zeta", rank: 1 }, { id: "alpha", rank: 1 }]];
    expect(rrf(lists).map((r) => r.id)).toEqual(["alpha", "zeta"]);
    expect(rrf(lists).map((r) => r.id)).toEqual(rrf(lists).map((r) => r.id));
  });

  it("survives one half returning nothing", () => {
    // Exactly what happens when the embedding provider is the local hash and
    // the vector half is skipped, or when a query matches no keywords.
    expect(rrf([[], [{ id: "only", rank: 1 }]]).map((r) => r.id)).toEqual(["only"]);
    expect(rrf([[], []])).toEqual([]);
  });
});

describe("maximal marginal relevance", () => {
  const v = (...xs: number[]) => normalise([...xs, 0, 0]);

  const TWINS = [
    { id: "twin-a", vector: v(1, 0.01) },
    { id: "twin-b", vector: v(1, 0.02) },
    { id: "twin-c", vector: v(1, 0.03) },
    { id: "different", vector: v(0.6, 0.8) },
  ];

  it("trades relevance for spread as lambda falls", () => {
    /*
      The contract, stated as the tradeoff rather than as a fixed answer.

      The first version of this asserted that lambda 0.7 would put `different`
      in second place, and it did not — correctly. Three documents at cosine
      ~0.9999 to the query are so relevant that even a full diversity penalty
      leaves them ahead of something at 0.6. That is MMR working, not MMR
      broken, and a test demanding otherwise would have been a test demanding
      a bug.

      What is actually guaranteed is monotonic: lower lambda promotes
      difference. So that is what gets checked, at both ends.
    */
    const query = v(1, 0);
    expect(mmr(TWINS, query, 2, 1)[1], "pure relevance should keep the twins").toMatch(/^twin/);
    expect(mmr(TWINS, query, 2, 0.3)[1], "diversity-weighted should surface the outlier").toBe(
      "different",
    );
  });

  it("always leads with the most relevant, at any lambda", () => {
    // Diversity is a tiebreak among the rest, never a reason to demote the
    // best answer to second place.
    const query = v(1, 0);
    for (const lambda of [1, 0.7, 0.5, 0.3, 0]) {
      expect(mmr(TWINS, query, 3, lambda)[0], `lambda ${lambda}`).toMatch(/^twin/);
    }
  });

  it("collapses to pure relevance at lambda 1", () => {
    const query = v(1, 0);
    const candidates = [
      { id: "near", vector: v(1, 0.01) },
      { id: "nearer", vector: v(1, 0.001) },
      { id: "far", vector: v(0, 1) },
    ];
    expect(mmr(candidates, query, 2, 1)).toEqual(["nearer", "near"]);
  });

  it("never returns more than it was given, or duplicates", () => {
    const query = v(1, 0);
    const candidates = [
      { id: "a", vector: v(1, 0) },
      { id: "b", vector: v(0, 1) },
    ];
    const picked = mmr(candidates, query, 10);
    expect(picked).toHaveLength(2);
    expect(new Set(picked).size).toBe(2);
    expect(mmr(candidates, query, 0)).toEqual([]);
    expect(mmr([], query, 5)).toEqual([]);
  });
});

describe("vector arithmetic", () => {
  it("normalises to unit length, so cosine is the dot product", () => {
    const v = normalise([3, 4, 0]);
    expect(Math.hypot(...v)).toBeCloseTo(1, 10);
  });

  it("does not divide by zero on an empty vector", () => {
    // A zero vector has no direction. Returning NaNs here would poison every
    // distance computed against it afterwards, silently.
    const z = normalise([0, 0, 0]);
    expect(z.every((x) => Number.isFinite(x))).toBe(true);
    expect(cosine(z, [1, 2, 3])).toBe(0);
  });

  it("scores identical text at 1 and opposites at -1", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1, 10);
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1, 10);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it("refuses to compare different dimensions rather than guessing", () => {
    // The shape of a mixed-model index. Silently comparing a 1024 to a 512
    // returns a number, and the number is meaningless.
    expect(() => cosine([1, 0], [1, 0, 0])).toThrow(/different sizes/);
  });

  it("renders a literal pgvector can parse", () => {
    expect(toVectorLiteral([0.5, -0.25])).toBe("[0.5,-0.25]");
  });
});

describe("the embedding provider", () => {
  const saved = process.env.VOYAGE_API_KEY;
  beforeEach(() => {
    delete process.env.VOYAGE_API_KEY;
    resetProvider();
  });
  afterEach(() => {
    if (saved) process.env.VOYAGE_API_KEY = saved;
    else delete process.env.VOYAGE_API_KEY;
    resetProvider();
  });

  it("falls back to the local provider with no key, and admits it is not semantic", () => {
    /*
      The load-bearing field on this object is `semantic: false`.

      With no key the system still installs and still searches — lexically.
      What it must never do is present hashed trigrams as though they were
      meaning. `search` reads this flag and drops the vector half entirely
      rather than fusing noise into the ranking, because a confidently wrong
      semantic search is worse than an honest keyword one.
    */
    const p = provider();
    expect(p.semantic).toBe(false);
    expect(p.model).toBe("local-trigram-v1");
  });

  it("uses Voyage when a key is present, because Anthropic has no embeddings API", () => {
    // Stated in a test as well as a comment. `anthropic.embeddings.create`
    // does not exist — the SDK ships `messages` and `completions` and nothing
    // else — and code written against it typechecks as `any` and dies on the
    // first real call.
    process.env.VOYAGE_API_KEY = "test-key";
    resetProvider();
    const p = provider();
    expect(p.semantic).toBe(true);
    expect(p.model).toContain("voyage");
  });

  it("emits vectors of exactly the pinned dimension", async () => {
    // The column is vector(1024). A provider quietly changing its output size
    // writes rows that either fail the insert or land in a mixed-dimension
    // index where every distance is nonsense.
    const [v] = await localProvider().embed(["a boiler replacement in Tempe"]);
    expect(v).toHaveLength(EMBEDDING_DIM);
  });

  it("is deterministic across calls, or every stored vector is garbage after a restart", () => {
    // A hash seeded per-process would make yesterday's embeddings
    // incomparable with today's, and nothing would report it.
    return Promise.all([
      localProvider().embed(["identical text"]),
      localProvider().embed(["identical text"]),
    ]).then(([a, b]) => {
      expect(a[0]).toEqual(b[0]);
    });
  });

  it("puts identical text closer than unrelated text", async () => {
    const p = localProvider();
    const [same1, same2, other] = await p.embed([
      "furnace not igniting, no heat upstairs",
      "furnace not igniting, no heat upstairs",
      "quarterly corporation tax filing deadline",
    ]);
    expect(cosine(same1!, same2!)).toBeCloseTo(1, 10);
    expect(cosine(same1!, other!)).toBeLessThan(cosine(same1!, same2!));
  });

  it("returns one vector per input, in order", async () => {
    const texts = ["alpha", "beta", "gamma"];
    const out = await localProvider().embed(texts);
    expect(out).toHaveLength(3);
    // Pairing matters: a mismatched order attaches every embedding to the
    // wrong text, and nothing downstream can detect it.
    const [a] = await localProvider().embed(["alpha"]);
    expect(out[0]).toEqual(a);
  });
});
