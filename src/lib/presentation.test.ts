import { describe, expect, it } from "vitest";
import {
  SLIDES,
  ACTS,
  RUNNING_TIME,
  EXAMPLE_ACCOUNT,
  slideById,
  actLabel,
} from "@/lib/presentation";
import { TRACKS, OBJECTIONS, INTERNAL_ECONOMICS } from "@/lib/run-sheet";
import {
  UPGRADES,
  BUNDLES,
  FLIGHT_PLANS,
  PARENT_SERVICES,
  OPERATORS,
  MANIFEST,
  AUTOMATION_LOOPS,
} from "@/lib/upgrades";
import { formatCurrency } from "@/lib/utils";

/**
 * A DECK IS THE WORST PLACE FOR A TYPED NUMBER.
 *
 * The price list is read by somebody deciding. The deck is read out loud, to
 * that same person, by somebody who did not write it — and then screenshotted.
 * When the catalogue moves, every surface that resolved its figures moves with
 * it and every surface that typed them stays wrong until a client notices on a
 * call. That is the failure this file exists to make impossible.
 *
 * The other half is the wall between the deck and the run sheet. The run sheet
 * carries our own economics; the stage is the window being shared. They must
 * not be one import away from each other.
 */

async function read(path: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("the deck quotes the catalogue, never itself", () => {
  it("types no dollar figure of its own", async () => {
    const src = await read("src/lib/presentation.ts");
    // `formatCurrency(...)` and the parent's own quoted labels are the only
    // routes to money on a slide. A literal reads correctly the day it is
    // written and is wrong the day the catalogue moves.
    const literals = (src.match(/\$[\d,]+/g) ?? []).filter((m) => !m.startsWith("${"));
    expect(literals, `hand-typed prices in the deck: ${literals.join(", ")}`).toEqual([]);
  });

  it("types no percentage of its own", async () => {
    const src = await read("src/lib/presentation.ts");
    // The parent's three fee rates are the only percentages either property is
    // allowed to state, and they arrive through FLIGHT_PLANS. Anything else on
    // a slide is a claim being made out loud to a buyer.
    const typed = (src.match(/\d+%/g) ?? []).filter((m) => !/^100%$/.test(m));
    expect(typed, `hand-typed percentages in the deck: ${typed.join(", ")}`).toEqual([]);
  });

  it("prices every upgrade and bundle exactly as the price list does", () => {
    const money = JSON.stringify(SLIDES);
    for (const u of UPGRADES) {
      expect(money, `${u.name} is missing from the deck`).toContain(u.name);
      expect(money, `${u.name} is priced differently on the slide`).toContain(
        formatCurrency(u.price),
      );
    }
    for (const b of BUNDLES) {
      expect(money, `${b.name} is missing from the deck`).toContain(b.name);
      expect(money, `${b.name} is priced differently on the slide`).toContain(
        formatCurrency(b.price),
      );
    }
  });

  it("walks the parent's whole house, not a flattering subset", () => {
    // The deck's argument is that it describes everything already covered
    // before it sells the remainder. Quietly dropping the manifest or the
    // roster would make act four look larger than it is — which is the exact
    // dishonesty the catalogue's additive rules exist to prevent.
    const prose = JSON.stringify(SLIDES);
    for (const s of PARENT_SERVICES) expect(prose, `${s.name} missing`).toContain(s.name);
    for (const p of FLIGHT_PLANS) expect(prose, `${p.name} missing`).toContain(p.name);
    for (const o of OPERATORS) expect(prose, `${o.name} missing`).toContain(o.name);
    for (const m of MANIFEST) expect(prose, `manifest ${m.n} missing`).toContain(m.title);
    for (const l of AUTOMATION_LOOPS) expect(prose, `${l.name} missing`).toContain(l.name);
  });

  it("shows the ceiling of every service it walked", () => {
    // The hinge slide. If a service's ceiling ever drops off it, the deck
    // starts selling into a gap it never demonstrated.
    const ceiling = slideById("ceiling")!;
    expect(ceiling.body.kind).toBe("split");
    if (ceiling.body.kind !== "split") throw new Error("unreachable");
    // Against the points themselves rather than the serialised slide: the
    // ceilings quote the parent verbatim, quotation marks and all, and a JSON
    // round-trip escapes them into a string that never matches.
    const bodies = ceiling.body.points.map((p) => p.body);
    for (const s of PARENT_SERVICES) {
      expect(bodies, `${s.name}'s ceiling is not on the hinge slide`).toContain(s.ceiling);
    }
  });

  it("adds up the one slide that shows a total", () => {
    /**
     * The worked example is a column of money with a bold figure under it, and
     * a buyer checks that figure. It shipped its first draft with an entry
     * price sitting in the same table as the three components — a fourth row
     * the total deliberately excluded — so the column read as a sum that was
     * short by exactly that row. Every number was individually correct.
     *
     * The leak slide is deliberately not held to this: its total is the cost
     * of the fix, set against the rows rather than summed from them.
     */
    const worked = slideById("worked")!;
    if (worked.body.kind !== "math") throw new Error("the worked example is not a math slide");
    const cents = (s: string) => Number(s.replace(/[^\d]/g, ""));
    const sum = worked.body.rows.reduce((n, r) => n + cents(r.value), 0);
    expect(worked.body.total).toBeDefined();
    expect(cents(worked.body.total!.value), "the total is not the sum of its rows").toBe(sum);
  });

  it("makes no outcome claim of its own", () => {
    const prose = JSON.stringify(SLIDES);
    for (const pattern of [/\d+x\b/i, /guarantee[ds]? results/i, /\bROI of\b/i]) {
      expect(prose, `the deck makes a claim matching ${pattern}`).not.toMatch(pattern);
    }
  });

  it("keeps the illustrative account honest about being illustrative", () => {
    // Five numbers on a slide, none of them the prospect's. The one thing that
    // must never happen is them reading as a benchmark, so the slide has to say
    // so in its own caption rather than in a comment nobody sees.
    const leak = slideById("leak")!;
    expect(leak.body.kind).toBe("math");
    if (leak.body.kind !== "math") throw new Error("unreachable");
    expect(leak.body.caption.toLowerCase()).toContain("illustrative");
    expect(EXAMPLE_ACCOUNT.recovery).toBeLessThan(1);
  });
});

describe("the routine is a routine", () => {
  it("scripts every slide, and slides every script", () => {
    // A deck that grows an unscripted slide stops being the same call twice.
    expect(Object.keys(TRACKS).sort()).toEqual(SLIDES.map((s) => s.id).sort());
  });

  it("gives every slide one thing that has to land", () => {
    for (const s of SLIDES) {
      const t = TRACKS[s.id]!;
      expect(t.say.length, `${s.id} has no talk track`).toBeGreaterThan(0);
      expect(t.lands.length, `${s.id} has no landing point`).toBeGreaterThan(0);
    }
  });

  it("uses every act, in order, with no gaps", () => {
    const seen = SLIDES.map((s) => s.act);
    const order = [...new Set(seen)];
    expect(order).toEqual(ACTS.map((a) => a.key));
    // Contiguous: an act that reappears after another one has started means the
    // rail lies about where the call is.
    for (const act of order) {
      const idx = seen.flatMap((a, i) => (a === act ? [i] : []));
      expect(idx[idx.length - 1]! - idx[0]!, `${act} is interleaved`).toBe(idx.length - 1);
    }
    for (const a of ACTS) expect(actLabel(a.key)).toBe(a.label);
  });

  it("sells nothing before the fourth act", () => {
    // The whole structure rests on this. Eleven slides describing somebody
    // else's product is what buys act four its credibility, and a price
    // wandering into act two spends that for nothing.
    const early = SLIDES.filter((s) => s.act === "recap" || s.act === "house");
    const prices = new Set(UPGRADES.map((u) => formatCurrency(u.price)));
    for (const s of early) {
      for (const p of JSON.stringify(s).match(/\$[\d,]+/g) ?? []) {
        expect(prices.has(p), `${s.id} quotes an upgrade price in act "${s.act}"`).toBe(false);
      }
    }
  });

  it("budgets its own time rather than asserting it", () => {
    expect(RUNNING_TIME).toBe(SLIDES.reduce((n, s) => n + s.minutes, 0));
    expect(INTERNAL_ECONOMICS.timing.minutes).toBe(RUNNING_TIME);
    expect(INTERNAL_ECONOMICS.timing.slides).toBe(SLIDES.length);
  });

  it("answers the objection that actually kills these calls", () => {
    // No case studies. It is the one every prospect reaches, and a rep without
    // a written answer improvises a claim — which is the single thing neither
    // property is allowed to do.
    const answers = OBJECTIONS.map((o) => `${o.objection} ${o.answer}`).join(" ").toLowerCase();
    expect(answers).toContain("case stud");
    expect(answers).toContain("founding rate");
  });

  it("names no percentage the parent does not charge", () => {
    // The allowed set is exactly "rates the parent publishes as its own fees":
    // the three flight-plan rates, plus the ad-spend fee on Premium AI Ads.
    // Both arrive through the catalogue, so a rate that changes over there
    // changes here rather than being restated on a slide read out loud.
    const allowed = new Set([
      ...FLIGHT_PLANS.map((p) => p.fee.match(/\d+%/)![0]),
      ...PARENT_SERVICES.flatMap((s) => s.feeLabel?.match(/\d+%/) ?? []),
    ]);
    const prose = [
      JSON.stringify(SLIDES),
      JSON.stringify(TRACKS),
      JSON.stringify(OBJECTIONS),
      JSON.stringify(INTERNAL_ECONOMICS),
    ].join("\n");
    for (const pct of prose.match(/\d+%/g) ?? []) {
      expect(allowed.has(pct), `"${pct}" is a claim neither property can support`).toBe(true);
    }
  });
});

describe("the wall between the deck and the run sheet", () => {
  /**
   * The stage is the window being shared. The run sheet holds what an account
   * is worth to us. The presenter is one keystroke from the wrong panel all
   * call, so the two are separated by an import ban rather than by discipline.
   */
  const STAGE_FILES = [
    "src/components/presentation/stage.tsx",
    "src/components/presentation/slide-view.tsx",
    "src/app/present/page.tsx",
  ];

  it("keeps the run sheet out of everything the stage renders", async () => {
    for (const file of STAGE_FILES) {
      const src = await read(file);
      expect(src, `${file} can reach our own economics`).not.toMatch(
        /from ["']@\/lib\/run-sheet["']/,
      );
    }
  });

  it("keeps the console's legacy plan ladder out of it too", async () => {
    // Same wall the public surfaces carry: six plans on two product lines that
    // no longer exist have no business being quoted on a live call.
    for (const file of [...STAGE_FILES, "src/lib/presentation.ts", "src/lib/run-sheet.ts"]) {
      const src = await read(file);
      expect(src, `${file} reaches into the console's catalogue`).not.toMatch(
        /from ["']@\/lib\/catalog["']/,
      );
    }
  });

  it("labels the run sheet as unshareable on the page itself", async () => {
    const src = await read("src/app/present/run-sheet/page.tsx");
    expect(src).toContain("do not screen-share");
  });
});

describe("the deck stays out of the public index", () => {
  it("is disallowed in robots.txt", async () => {
    const { default: robots } = await import("@/app/robots");
    const rule = robots().rules;
    const disallow = (Array.isArray(rule) ? rule : [rule]).flatMap((r) =>
      Array.isArray(r.disallow) ? r.disallow : r.disallow ? [r.disallow] : [],
    );
    expect(disallow).toContain("/present");
  });

  it("is absent from the sitemap", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    expect(sitemap().some((e) => e.url.includes("/present"))).toBe(false);
  });

  it("is noindex on both surfaces", async () => {
    for (const file of ["src/app/present/page.tsx", "src/app/present/run-sheet/page.tsx"]) {
      const src = await read(file);
      expect(src, `${file} is indexable`).toMatch(/robots:\s*\{\s*index:\s*false/);
    }
  });
});
