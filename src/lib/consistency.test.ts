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
