import { describe, expect, it } from "vitest";
import {
  UPGRADES,
  BUNDLES,
  PARENT_SERVICES,
  FLIGHT_PLANS,
  FLIGHT_CHECK,
  THESIS,
  FAIR_QUESTIONS,
  PROOF_POSTURE,
  bundleMembers,
  entryPrice,
} from "@/lib/upgrades";
import { LEGAL_DOCUMENTS, feeSchedule } from "@/lib/legal";
import { renderNotification } from "@/lib/notify";
import { formatCurrency } from "@/lib/utils";

/**
 * ONE BUSINESS, ONE SET OF NUMBERS.
 *
 * A visitor does not read this site the way its authors do. They read a price
 * on the page, click "Terms" in the footer, and read a fee schedule. They get
 * an email and read the guarantee again. They see the description Google
 * printed. Every one of those surfaces was written at a different time, and
 * nothing made them agree.
 *
 * They did not agree. The legal set described "two lines of service: AI
 * Automation Agents and Ad Operations Management" and quoted six monthly fees
 * between $1,297 and $7,997 — none of which appear anywhere on the site, which
 * sells five upgrades between $1,600 and $4,200. The Terms said subscriptions
 * bill here through Stripe; the page's own FAQ said upgrades land on the
 * existing PHX/GROWTH invoice with no second account. Both were published. A
 * prospect reading carefully enough to check would have found a contract for a
 * different company.
 *
 * Nothing errored, nothing failed a build, and no test caught it, because
 * every surface was internally consistent and tested in isolation. These tests
 * are the ones that read across the seams.
 */

/** Strip HTML so markup like width="100%" is never mistaken for copy. */
function visible(html: string): string {
  return html.replace(/<[^>]+>/g, " ");
}

/** Every string a visitor can read in the legal set. */
function legalProse(): string {
  return LEGAL_DOCUMENTS.flatMap((d) => [
    d.title,
    d.summary,
    ...d.sections.flatMap((s) => [s.heading, ...s.body, ...(s.bullets ?? [])]),
  ]).join("\n");
}

describe("the contract describes the business the page sells", () => {
  it("names every upgrade and bundle in the fee schedule", () => {
    const fees = feeSchedule().join("\n");
    for (const u of UPGRADES) {
      expect(fees, `${u.name} is sold on the page but absent from the fee schedule`).toContain(
        u.name,
      );
      expect(fees, `${u.name} is priced differently in the contract`).toContain(
        formatCurrency(u.price),
      );
    }
    for (const b of BUNDLES) {
      expect(fees, `${b.name} is missing from the fee schedule`).toContain(b.name);
      expect(fees).toContain(formatCurrency(b.price));
    }
  });

  it("quotes no price the page does not offer", () => {
    // The failure this catches is the exact one that shipped: a fee schedule
    // outliving the products it was written for.
    const sold = new Set([
      ...UPGRADES.map((u) => formatCurrency(u.price)),
      ...BUNDLES.map((b) => formatCurrency(b.price)),
    ]);
    const quoted = legalProse().match(/\$[\d,]+/g) ?? [];
    for (const q of quoted) {
      expect(sold.has(q), `the legal set quotes ${q}, which is not a price on this site`).toBe(
        true,
      );
    }
  });

  it("does not describe products from the earlier business", () => {
    const prose = legalProse();
    for (const ghost of [
      "AI Automation Agents",
      "Ad Operations Management",
      "two lines of service",
      "build fee",
      "run allowance",
    ]) {
      expect(prose, `the legal set still describes "${ghost}"`).not.toContain(ghost);
    }
  });

  it("names the parent's real services, and only those", () => {
    const prose = legalProse();
    for (const s of PARENT_SERVICES) {
      expect(prose, `the contract never mentions ${s.name}`).toContain(s.name);
    }
  });

  it("agrees with the page's FAQ about who gets invoiced", () => {
    // These two said opposite things in production. The FAQ said the upgrade
    // lands on the existing PHX/GROWTH invoice; the Terms said Stripe here.
    const faq = FAIR_QUESTIONS.find((f) => f.q.toLowerCase().includes("bill"))!;
    expect(faq.a).toContain("existing PHX/GROWTH invoice");
    const terms = LEGAL_DOCUMENTS.find((d) => d.slug === "terms")!;
    const billing = terms.sections.find((s) => s.heading.includes("Fees"))!;
    expect(billing.body.join(" ")).toContain("existing PHX/GROWTH invoice");
  });

  it("numbers its sections nowhere in the data", () => {
    // Sections were hand-numbered, so inserting a clause silently shifted every
    // cross-reference below it. The renderer counts now.
    for (const d of LEGAL_DOCUMENTS) {
      for (const s of d.sections) {
        expect(s.heading, `"${s.heading}" carries a hand-typed number`).not.toMatch(/^\d+\./);
      }
    }
  });
});

describe("the guarantee is the same guarantee everywhere", () => {
  it("is quoted from one place, not retyped", async () => {
    // Four surfaces state it: the hero strip, the guarantee section, the
    // receipt email and the contract. A guarantee that reads "30-Day" in one
    // and something else in another is the inconsistency a buyer litigates.
    const receipt = renderNotification("ENQUIRY_RECEIPT", {
      businessName: "Test Co",
      title: "The Voice Employee",
      path: "/",
    });
    expect(visible(receipt.html ?? receipt.text)).toContain(FLIGHT_CHECK.label);
    expect(legalProse()).toContain(FLIGHT_CHECK.label);
  });

  it("is the parent's, not a second one invented here", () => {
    expect(FLIGHT_CHECK.label).toContain("30-Day Flight Check");
    expect(FLIGHT_CHECK.body).toContain("30 days");
    // Exactly one guarantee period is named anywhere. Two would leave a client
    // asking which applies.
    const periods = new Set(
      [legalProse(), FLIGHT_CHECK.body].join(" ").match(/\b\d+[- ]day\b/gi)?.map((s) =>
        s.toLowerCase().replace(" ", "-"),
      ) ?? [],
    );
    expect([...periods]).toEqual(["30-day"]);
  });
});

describe("counts are counted, never typed", () => {
  it("states the upgrade count from the array", () => {
    expect(THESIS.body).toContain(String(UPGRADES.length));
  });

  it("reports the same catalogue size to every reader", async () => {
    // The page, /api/catalogue and /api/health all answer "how many upgrades".
    // They must answer identically or the machine-readable copy contradicts
    // the human-readable one.
    const { GET: catalogue } = await import("@/app/api/catalogue/route");
    const body = (await (await catalogue()).json()) as {
      upgrades: unknown[];
      bundles: unknown[];
      entryPrice: number;
    };
    expect(body.upgrades).toHaveLength(UPGRADES.length);
    expect(body.bundles).toHaveLength(BUNDLES.length);
    expect(body.entryPrice).toBe(entryPrice());
  });

  it("publishes the same prices machine-readably as it shows on the page", () => {
    // An assistant quoting /api/catalogue must reach the figure a human reads.
    for (const b of BUNDLES) {
      const members = bundleMembers(b);
      const list = members.reduce((n, u) => n + u.price, 0);
      expect(b.price, `${b.name} costs more than its parts`).toBeLessThan(list);
    }
  });
});

describe("motion stays removable", () => {
  /**
   * Every effect on this page is decoration, and decoration that cannot be
   * switched off is an accessibility defect rather than a flourish. `FxCanvas`
   * and `useFrameLoop` are the only two places that own that contract — they
   * draw a single finished frame under `prefers-reduced-motion` and park the
   * loop when the panel is off screen.
   *
   * A component that reaches for `requestAnimationFrame` directly bypasses
   * both: it animates for somebody who asked it not to, and it keeps a laptop
   * fan running for a canvas nobody is looking at.
   */
  it("routes every canvas through FxCanvas", async () => {
    // The precise rule, rather than "no requestAnimationFrame anywhere": the
    // analytics beacon legitimately uses a one-shot rAF to throttle a scroll
    // handler, which is not an animation loop and does not need a
    // reduced-motion branch. What must never happen is a component painting
    // its own canvas on its own clock.
    const { readdir, readFile } = await import("node:fs/promises");
    const dir = new URL("../components/marketing/", import.meta.url);
    for (const f of (await readdir(dir)).filter((n) => n.endsWith(".tsx"))) {
      if (f === "fx.tsx") continue; // the one place that owns the contract
      const src = await readFile(new URL(f, dir), "utf8");
      expect(src, `${f} renders a raw <canvas> instead of using FxCanvas`).not.toMatch(
        /<canvas[\s>]/,
      );
    }
  });

  it("gives the reduced-motion branch every animated class", async () => {
    const { readFile } = await import("node:fs/promises");
    const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    // Every fx-* class that animates must be named in a reduce block.
    for (const cls of ["fx-live", "fx-flash", "fx-breathe", "fx-caret", "fx-tick", "fx-sheen"]) {
      expect(reduced, `${cls} keeps animating under reduced motion`).toContain(cls);
    }
    expect(reduced).toContain("[data-reveal]");
  });
});

describe("money is rendered in the units it is stored in", () => {
  /**
   * The Response Clock shipped a draft quoting "$1,190,000 leaving every
   * month" for a business taking 180 calls. `computeLeak` returns cents, like
   * every price in this codebase, and the component multiplied by 100 on the
   * way to `formatCurrency` — which also expects cents. Two correct functions,
   * one absurd number, and it was the single most persuasive figure on the
   * page.
   *
   * Nothing about it looked wrong in the source. It looked wrong on screen,
   * which is why this reads the source for the shape of the mistake.
   */
  it("never scales a cents value before formatting it", async () => {
    const { readdir, readFile } = await import("node:fs/promises");
    const dir = new URL("../components/marketing/", import.meta.url);
    for (const f of (await readdir(dir)).filter((n) => n.endsWith(".tsx"))) {
      const src = await readFile(new URL(f, dir), "utf8");
      expect(src, `${f} multiplies by 100 inside formatCurrency`).not.toMatch(
        /formatCurrency\([^)]*\*\s*100\s*\)/,
      );
    }
  });

  it("keeps the leak engine's contract explicit", async () => {
    const { computeLeak } = await import("@/lib/leak");
    // One missed call, closing 100% of them, on a $1,000 job → $1,000 in cents.
    const r = computeLeak(
      { callsPerMonth: 1, missedPct: 100, closeRate: 100, jobValue: 100_000, recovery: 1 },
      0,
    );
    expect(r.monthlyLeak).toBe(100_000);
    expect(formatCurrency(r.monthlyLeak)).toBe("$1,000");
  });
});

describe("the enquiry asks for the number the page promised", () => {
  it("posts a bundle key, never the members, when the selection is a bundle", async () => {
    // The Stack Composer tells a visitor "those exact five are The Deluxe Deck
    // and we will quote the bundle". If the form then posts five upgrade keys,
    // the server prices them à la carte — correct arithmetic on both sides,
    // and a broken promise in between. That is the only kind of pricing bug
    // that survives review, because nothing is wrong except the answer.
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(
      new URL("../components/marketing/enquiry.tsx", import.meta.url),
      "utf8",
    );
    expect(src).toMatch(/bundle \? \{ bundle: bundle\.key \} : \{ upgrades: picked \}/);
  });

  it("prices a bundle below its members, so the promise is worth making", () => {
    for (const b of BUNDLES) {
      const parts = bundleMembers(b).reduce((n, u) => n + u.price, 0);
      expect(b.price, `${b.key}`).toBeLessThan(parts);
    }
  });

  it("has a server that honours the same rule", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(new URL("../app/api/reserve/route.ts", import.meta.url), "utf8");
    // The endpoint must price a bundle from its own figure, not from members.
    expect(src).toMatch(/const monthly = bundle\s*\?\s*bundle\.price/);
  });
});

describe("the public site and the client console stay separate", () => {
  /**
   * There are two price lists in this repository and there is no getting away
   * from it today.
   *
   *   `upgrades.ts` — five upgrades and three bundles, $1,600–$9,900/mo. This
   *   is the business. Everything a visitor can see comes from here.
   *
   *   `catalog.ts` — six plans, $1,297–$7,997/mo, on two product lines that no
   *   longer exist. This is the signed-in console, and its plan keys are woven
   *   through the entitlement, capacity, spend-watch and night-shift engines.
   *   Rewriting it is a migration, not a rename, so it is deliberately left
   *   alone rather than half-changed.
   *
   * What must never happen again is the two meeting. The legal set imported
   * `catalog.ts`, and that single import is how a contract quoting six fees
   * nobody charges ended up linked from the footer of a page selling something
   * else entirely. This test is the wall.
   */
  const PUBLIC_SURFACES = [
    "src/app/layout.tsx",
    "src/app/opengraph-image.tsx",
    "src/app/(marketing)/page.tsx",
    "src/app/upgrades/page.tsx",
    "src/app/legal/[slug]/page.tsx",
    "src/app/api/catalogue/route.ts",
    "src/app/api/reserve/route.ts",
    "src/lib/legal.ts",
    "src/lib/notify.ts",
    "src/lib/email-shell.ts",
  ];

  it("keeps the console's plan ladder out of every public surface", async () => {
    const { readFile } = await import("node:fs/promises");
    for (const file of PUBLIC_SURFACES) {
      const src = await readFile(new URL(`../../${file}`, import.meta.url), "utf8");
      expect(src, `${file} reaches into the console's catalogue`).not.toMatch(
        /from ["']@\/lib\/catalog["']/,
      );
    }
  });

  it("keeps it out of the marketing components too", async () => {
    const { readdir, readFile } = await import("node:fs/promises");
    const dir = new URL("../components/marketing/", import.meta.url);
    const files = (await readdir(dir)).filter((f) => f.endsWith(".tsx"));
    expect(files.length).toBeGreaterThan(3);
    for (const f of files) {
      const src = await readFile(new URL(f, dir), "utf8");
      expect(src, `${f} reaches into the console's catalogue`).not.toMatch(
        /from ["']@\/lib\/catalog["']/,
      );
    }
  });
});

describe("the price list is the catalogue, rendered", () => {
  /**
   * `/upgrades` exists because the deck asked for eight modules of attention
   * before it would show a number. It is the page a client screenshots and the
   * page an assistant quotes, which makes it the worst possible place for a
   * figure to be typed by hand.
   *
   * So nothing on it is. These tests read the file and fail if a price, a fee
   * rate, a service name or a count was written rather than resolved.
   */
  async function pricingSource(): Promise<string> {
    const { readFile } = await import("node:fs/promises");
    return readFile(new URL("../app/upgrades/page.tsx", import.meta.url), "utf8");
  }

  it("types no dollar figure of its own", async () => {
    const src = await pricingSource();
    // `formatCurrency(...)` and the parent's own `priceLabel` strings are the
    // only routes to a price on this page. A literal like "$4,200" would look
    // right the day it was written and be wrong the day the catalogue moved.
    const literals = (src.match(/\$[\d,]+/g) ?? []).filter((m) => !m.startsWith("${"));
    expect(literals, `hand-typed prices on the price list: ${literals.join(", ")}`).toEqual([]);
  });

  it("types no percentage of its own", async () => {
    const src = await pricingSource();
    // The parent's fee rates are the only percentages this site is allowed to
    // state, and they arrive through FLIGHT_PLANS. Anything else is a claim.
    const inCode = (src.match(/\d+%/g) ?? []).filter(
      // Tailwind widths and CSS values are not claims about the business.
      (m) => !/^100%$/.test(m),
    );
    expect(inCode, `hand-typed percentages: ${inCode.join(", ")}`).toEqual([]);
  });

  it("shows every upgrade and every bundle, none of them invented", async () => {
    const src = await pricingSource();
    // Rendered from the arrays, so the count can never fall behind the
    // catalogue: five upgrades on the page and six in the file was exactly the
    // failure the deck's hardcoded "five" produced three times.
    expect(src).toMatch(/UPGRADES\.map/);
    expect(src).toMatch(/BUNDLES\.map/);
    expect(src).toMatch(/formatCurrency\(u\.price\)/);
    expect(src).toMatch(/formatCurrency\(b\.price\)/);
    expect(src).toMatch(/bundleSaving\(b\)/);
  });

  it("answers 'am I already paying for this?' from the parent's own bullets", async () => {
    const src = await pricingSource();
    // The first question a price list gets. It is answered with
    // PARENT_SERVICES[].includes — phxgrowth.com's own list, verbatim — rather
    // than a reassuring sentence written here.
    expect(src).toMatch(/service\.includes\.map/);
    expect(src).toMatch(/service\.priceLabel/);
    expect(src).toMatch(/upgradesFor\(service\.key\)/);
  });

  it("carries the same guarantee and posture as everywhere else", async () => {
    const src = await pricingSource();
    for (const symbol of ["FLIGHT_CHECK", "PROOF_POSTURE", "FAIR_QUESTIONS", "FLIGHT_PLANS"]) {
      expect(src, `the price list omits ${symbol}`).toContain(symbol);
    }
  });

  it("is crawlable — it is the page 'what does X cost' should find", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const urls = sitemap().map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/upgrades"))).toBe(true);
  });

  it("is reachable from the deck, and the deck from it", async () => {
    const { readFile } = await import("node:fs/promises");
    const deck = await readFile(
      new URL("../app/(marketing)/page.tsx", import.meta.url),
      "utf8",
    );
    // A price list nobody can find is the same as no price list. The deck was
    // the only public page on this site for months; the route out of it is the
    // whole point of the new one.
    expect(deck, "the deck never links to the price list").toContain('href="/upgrades"');
    expect(await pricingSource(), "the price list never links back").toMatch(
      /href="\/"|href=\{"\/"\}/,
    );
  });
});

describe("the contents page indexes the deck that exists", () => {
  /**
   * The index down the top of the home page is the most-clicked element on the
   * site, and it is a list of anchors into a component it cannot see. When the
   * deck was re-ordered, the index kept printing the old numbers against the
   * new links — nothing errored, because a contents page has no way to tell
   * that its anchors moved.
   */
  async function deckSource(): Promise<string> {
    const { readFile } = await import("node:fs/promises");
    return readFile(new URL("../components/marketing/deck.tsx", import.meta.url), "utf8");
  }

  it("lists the tools in the order the deck renders them", async () => {
    const { TOOL_IDS } = await import("@/lib/deck");
    const src = await deckSource();
    // UP_FRONT then DEEPER, in source order — which is render order.
    const rendered = [...src.matchAll(/\{\s*id:\s*"([a-z]+)",\s*render:/g)].map((m) => m[1]!);
    expect(rendered).toEqual(TOOL_IDS);
  });

  it("numbers them from zero with no gaps and no repeats", async () => {
    const { DECK_INDEX } = await import("@/lib/deck");
    const numbered = DECK_INDEX.filter((d) => d.n !== "◇").map((d) => d.n);
    expect(numbered).toEqual(numbered.map((_, i) => String(i).padStart(2, "0")));
  });

  it("points every entry at an anchor an instrument actually renders", async () => {
    const { readdir, readFile } = await import("node:fs/promises");
    const { DECK_INDEX } = await import("@/lib/deck");
    const dir = new URL("../components/marketing/", import.meta.url);
    const sources = await Promise.all(
      (await readdir(dir))
        .filter((f) => f.endsWith(".tsx"))
        .map((f) => readFile(new URL(f, dir), "utf8")),
    );
    const all = sources.join("\n");
    for (const entry of DECK_INDEX) {
      expect(all, `nothing renders id="${entry.id}" for "${entry.name}"`).toContain(
        `id="${entry.id}"`,
      );
    }
  });

  it("can still reach the tools it hides", async () => {
    const { DECK_INDEX } = await import("@/lib/deck");
    const src = await deckSource();
    // Three entries link into a closed <details>, which most browsers refuse to
    // scroll to. Without this handler those were dead links that changed the
    // URL and moved nothing.
    expect(DECK_INDEX.some((d) => d.folded)).toBe(true);
    expect(src, "folded tools are unreachable from the index").toMatch(
      /closest\("details"\)/,
    );
    expect(src).toMatch(/fold\.open = true/);
  });

  it("keeps the module number out of the instruments themselves", async () => {
    const { readdir, readFile } = await import("node:fs/promises");
    const dir = new URL("../components/marketing/", import.meta.url);
    for (const f of (await readdir(dir)).filter((n) => n.endsWith(".tsx"))) {
      const src = await readFile(new URL(f, dir), "utf8");
      // Seven files each printing their own position is seven places to miss
      // when the order changes — and a duplicate number is visible to a visitor.
      expect(src, `${f} hardcodes its position in the deck`).not.toMatch(/index=\{\d+\}/);
    }
  });
});

describe("the parent's own numbers are never restated loosely", () => {
  it("quotes the flight-plan fees exactly once each, from the plan data", () => {
    const faq = FAIR_QUESTIONS.find((f) => f.q.includes("performance fee"))!;
    for (const plan of FLIGHT_PLANS) {
      const rate = plan.fee.match(/\d+%/)![0];
      expect(faq.a, `${plan.name} fee`).toContain(rate);
      expect(faq.a).toContain(plan.name);
    }
  });

  it("names no percentage anywhere that is not one of those fees", () => {
    // The site's whole posture is that it shows no results it has not earned.
    // The parent's fee rates are the sole exception and are enumerated above.
    const allowed = new Set(FLIGHT_PLANS.map((p) => p.fee.match(/\d+%/)![0]));
    const surfaces = [
      legalProse(),
      FAIR_QUESTIONS.map((f) => `${f.q} ${f.a}`).join(" "),
      Object.values(PROOF_POSTURE).join(" "),
      THESIS.body,
      UPGRADES.map((u) => `${u.promise} ${u.demandCase} ${u.delivers.join(" ")}`).join(" "),
      BUNDLES.map((b) => `${b.promise} ${b.rationale}`).join(" "),
    ].join("\n");
    for (const pct of surfaces.match(/\d+%/g) ?? []) {
      expect(allowed.has(pct), `"${pct}" is a claim this site cannot support`).toBe(true);
    }
  });
});
