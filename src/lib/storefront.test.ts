import { describe, it, expect } from "vitest";
import {
  OFFERS,
  SHELVES,
  offerBySlug,
  offersOnShelf,
  shelfByKey,
  offerHref,
  relatedOffers,
  offerSaving,
  firstInvoice,
  priceRange,
  anchorPlanFor,
} from "@/lib/storefront";
import { PLANS, planByKey } from "@/lib/catalog";
import { ADDONS, ADDON_BUNDLE, bundleListPrice } from "@/lib/addons";
import { priceCockpit } from "@/lib/cockpit";

describe("the storefront", () => {
  it("carries everything we sell", () => {
    // The point of the registry: if it can be bought, it has a page. A tier or
    // service that never reaches OFFERS is invisible to the showroom, the
    // sitemap and every related-offer rail at once.
    expect(OFFERS.length).toBe(PLANS.length + ADDONS.length + 1);
  });

  it("gives every offer a unique slug", () => {
    // Slugs are URLs. A collision would make two products share one page.
    const slugs = OFFERS.map((o) => o.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("uses url-safe slugs", () => {
    for (const o of OFFERS) {
      expect(o.slug, o.name).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("resolves each slug back to its offer", () => {
    for (const o of OFFERS) {
      expect(offerBySlug(o.slug)?.name, o.slug).toBe(o.name);
    }
    expect(offerBySlug("not-a-thing")).toBeUndefined();
  });

  it("prices and describes every offer", () => {
    for (const o of OFFERS) {
      expect(o.price, o.slug).toBeGreaterThan(0);
      expect(o.includes.length, o.slug).toBeGreaterThan(0);
      expect(o.blurb.length, o.slug).toBeGreaterThan(10);
    }
  });

  it("puts every offer on a shelf that exists", () => {
    const known = new Set(SHELVES.map((s) => s.key));
    for (const o of OFFERS) {
      expect(known.has(o.shelf), `${o.slug} → ${o.shelf}`).toBe(true);
    }
  });

  it("leaves no shelf empty", () => {
    for (const s of SHELVES) {
      expect(offersOnShelf(s.key).length, s.key).toBeGreaterThan(0);
      expect(shelfByKey(s.key)?.label, s.key).toBe(s.label);
    }
  });
});

describe("prices mirror the sources they came from", () => {
  it("never invents a plan price", () => {
    // A showroom page quoting a price the invoice won't use is the single most
    // expensive bug this codebase could ship, so it is derived, not typed.
    for (const plan of PLANS) {
      const offer = offerBySlug(plan.key);
      expect(offer, plan.key).toBeDefined();
      expect(offer!.price).toBe(plan.priceMonthly);
      expect(offer!.setupFee).toBe(plan.setupFee);
      expect(offer!.includes).toEqual(plan.features);
    }
  });

  it("never invents an add-on price", () => {
    for (const addon of ADDONS) {
      const offer = offerBySlug(addon.key);
      expect(offer, addon.key).toBeDefined();
      expect(offer!.price).toBe(addon.price);
      expect(offer!.billing).toBe(addon.billing);
    }
  });

  it("agrees with the configurator on what a plan costs on day one", () => {
    // Two surfaces, one number. `firstInvoice` and `priceCockpit` are separate
    // code paths a buyer will compare side by side.
    for (const plan of PLANS) {
      const offer = offerBySlug(plan.key)!;
      const quote = priceCockpit(
        plan.line === "AI_AGENTS" ? { agentsPlan: plan.key } : { adOpsPlan: plan.key },
      );
      expect(firstInvoice(offer), plan.key).toBe(quote.firstInvoiceTotal);
    }
  });

  it("reports the bundle's real saving and nothing else's", () => {
    const bundle = offerBySlug(ADDON_BUNDLE.key)!;
    expect(offerSaving(bundle)).toBe(bundleListPrice() - ADDON_BUNDLE.price);
    expect(offerSaving(bundle)).toBeGreaterThan(0);
    expect(offerSaving(offerBySlug("scale")!)).toBe(0);
  });

  it("spans a price range built from real recurring prices", () => {
    const { low, high } = priceRange();
    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(low);
    expect(high).toBe(Math.max(...PLANS.map((p) => p.priceMonthly)));
  });
});

describe("links out of an offer", () => {
  it("points every offer at its own page", () => {
    for (const o of OFFERS) {
      expect(offerHref(o)).toBe(`/showroom/${o.slug}`);
    }
  });

  it("builds a configurator link the configurator actually understands", () => {
    // The "Add to cockpit" button is worthless if the query it produces
    // doesn't round-trip. Parse each link the way the page does and check the
    // selection prices to something non-empty containing this offer.
    for (const o of OFFERS) {
      const [path, query] = o.configure.split("?");
      expect(path, o.slug).toBe("/cockpit");
      const params = new URLSearchParams(query);
      const quote = priceCockpit({
        agentsPlan: params.get("agents"),
        adOpsPlan: params.get("adops"),
        addons: (params.get("addons") ?? "").split(",").filter(Boolean),
      });
      expect(quote.isEmpty, o.slug).toBe(false);
    }
  });

  it("sends plans to their existing deep page and services nowhere fake", () => {
    for (const o of OFFERS) {
      if (o.kind === "PLAN") {
        expect(o.deepDive, o.slug).toBe(`/plans/${o.slug}`);
      } else {
        expect(o.deepDive, o.slug).toBeUndefined();
      }
    }
  });
});

describe("related offers", () => {
  it("never suggests the offer you are already reading", () => {
    for (const o of OFFERS) {
      expect(relatedOffers(o).map((r) => r.slug), o.slug).not.toContain(o.slug);
    }
  });

  it("returns no duplicates", () => {
    for (const o of OFFERS) {
      const slugs = relatedOffers(o).map((r) => r.slug);
      expect(new Set(slugs).size, o.slug).toBe(slugs.length);
    }
  });

  it("always has something to show, and respects the limit", () => {
    for (const o of OFFERS) {
      const related = relatedOffers(o, 4);
      expect(related.length, o.slug).toBeGreaterThan(0);
      expect(related.length, o.slug).toBeLessThanOrEqual(4);
    }
  });

  it("leads with genuine alternatives from the same shelf", () => {
    const scale = offerBySlug("scale")!;
    expect(relatedOffers(scale)[0].shelf).toBe(scale.shelf);
  });
});

describe("anchoring a service to a tier", () => {
  it("resolves to a plan we actually sell, for every offer", () => {
    for (const o of OFFERS) {
      const plan = anchorPlanFor(o);
      expect(plan, o.slug).toBeDefined();
      expect(planByKey(plan!.key), o.slug).toBeDefined();
    }
  });

  it("anchors a plan to itself", () => {
    expect(anchorPlanFor(offerBySlug("command")!)?.key).toBe("command");
  });
});
