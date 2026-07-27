/**
 * The storefront — every purchasable thing, in one list, with a page each.
 *
 * DIRECTION
 *   This site's job is the product view and the purchase (see `house.ts`).
 *   Until now the catalogue was split three ways: tiers lived in `catalog.ts`
 *   and rendered as pricing cards, add-ons lived in `addons.ts` and rendered
 *   as a disclosure list, and the bundle was a special case in both. A buyer
 *   could not link to "the Motion & Video Studio" — there was no such page —
 *   and could not compare a $2,800/mo add-on against a $2,997/mo tier without
 *   holding both in their head.
 *
 *   A storefront fixes that by making one thing true: everything we sell is an
 *   Offer, every Offer has a slug, a price, a manifest and a way to buy it.
 *
 * BLUEPRINTS
 *   Nothing is declared here. Every Offer is *derived* from the sources that
 *   already existed — `PLANS`, `ADDONS`, `ADDON_BUNDLE` — so adding a tier or
 *   a service automatically gives it a showroom page, a sitemap entry and a
 *   configurator deep-link, and no price can be stated here that isn't the
 *   price the invoice will use.
 *
 *   The one thing this file owns outright is the shelf arrangement: what sits
 *   next to what, and in which order a visitor meets it.
 */

import {
  PLANS,
  PRODUCT_LINES,
  planByKey,
  type PlanDef,
  type ProductLineKey,
} from "@/lib/catalog";
import {
  ADDONS,
  ADDON_BUNDLE,
  ADDON_GROUPS,
  ADDON_GROUP_ORDER,
  addonByKey,
  bundleListPrice,
  type AddonBilling,
  type AddonDef,
  type AddonGroupKey,
} from "@/lib/addons";
import { blueprintFor } from "@/lib/systems";

export type OfferKind = "PLAN" | "ADDON" | "BUNDLE";

/** Plan tiers get a shelf per product line; services keep their add-on group. */
export type ShelfKey = "automation" | "adops" | AddonGroupKey;

export interface Offer {
  /** Stable, URL-safe, unique across every kind. */
  slug: string;
  kind: OfferKind;
  name: string;
  /** One line in the buyer's language. */
  blurb: string;
  /** Cents. The recurring amount for monthly offers, the total for one-time. */
  price: number;
  billing: AddonBilling;
  /** One-time build fee charged alongside the first month. Plans only. */
  setupFee?: number;
  shelf: ShelfKey;
  /** What is actually delivered. Never empty. */
  includes: string[];
  /** Product line, for plans. */
  line?: ProductLineKey;
  /** What this is usually bought alongside. */
  pairsWith?: string;
  /** The existing deep page for this offer, where one exists. */
  deepDive?: string;
  /** Loads this offer into the configurator, pre-selected. */
  configure: string;
  /** Drives the "most chosen" marker. */
  featured?: boolean;
}

export interface Shelf {
  key: ShelfKey;
  label: string;
  /** What the shelf is, in one line. */
  note: string;
  /** How to read the prices on it. */
  kicker: string;
}

/**
 * The order a visitor meets the catalogue. Memberships first because they are
 * the spine everything else attaches to; capacity last because it only makes
 * sense once you own a plan.
 */
export const SHELVES: Shelf[] = [
  {
    key: "automation",
    label: PRODUCT_LINES.AI_AGENTS.name,
    note: PRODUCT_LINES.AI_AGENTS.blurb,
    kicker: "Monthly membership + a one-time build",
  },
  {
    key: "adops",
    label: PRODUCT_LINES.AD_OPS.name,
    note: PRODUCT_LINES.AD_OPS.blurb,
    kicker: "Monthly membership + a one-time build",
  },
  ...ADDON_GROUP_ORDER.map((key) => ({
    key: key as ShelfKey,
    label: ADDON_GROUPS[key].label,
    note: ADDON_GROUPS[key].note,
    kicker: "Add to any membership, any time",
  })),
];

function planOffer(plan: PlanDef): Offer {
  const blueprint = blueprintFor(plan.key);
  return {
    slug: plan.key,
    kind: "PLAN",
    name: plan.name,
    blurb: plan.tagline,
    price: plan.priceMonthly,
    billing: "monthly",
    setupFee: plan.setupFee,
    shelf: plan.line === "AI_AGENTS" ? "automation" : "adops",
    includes: plan.features,
    line: plan.line,
    // The tier pages already exist and go far deeper than a showroom card —
    // full module manifest, delivery timing, what's live after purchase.
    deepDive: blueprint ? `/plans/${plan.key}` : undefined,
    configure: `/cockpit?${plan.line === "AI_AGENTS" ? "agents" : "adops"}=${plan.key}`,
    featured: plan.highlight,
  };
}

function addonOffer(addon: AddonDef): Offer {
  return {
    slug: addon.key,
    kind: "ADDON",
    name: addon.name,
    blurb: addon.blurb,
    price: addon.price,
    billing: addon.billing,
    shelf: addon.group,
    includes: addon.includes,
    pairsWith: addon.pairsWith,
    configure: `/cockpit?addons=${addon.key}`,
    featured: addon.mostPaired,
  };
}

function bundleOffer(): Offer {
  const parts = ADDON_BUNDLE.includes
    .map((key) => addonByKey(key))
    .filter((a): a is AddonDef => Boolean(a));

  return {
    slug: ADDON_BUNDLE.key,
    kind: "BUNDLE",
    name: ADDON_BUNDLE.name,
    blurb: ADDON_BUNDLE.blurb,
    price: ADDON_BUNDLE.price,
    billing: "one_time",
    shelf: "foundations",
    // Roll up the parts' manifests rather than writing a third description of
    // the same work — a bundle that describes itself differently from its
    // components is how the two drift apart.
    includes: parts.flatMap((p) => p.includes),
    pairsWith: "Any membership",
    configure: `/cockpit?addons=${ADDON_BUNDLE.includes.join(",")}`,
  };
}

export const OFFERS: Offer[] = [
  ...PLANS.map(planOffer),
  bundleOffer(),
  ...ADDONS.map(addonOffer),
];

export function offerBySlug(slug: string): Offer | undefined {
  return OFFERS.find((o) => o.slug === slug);
}

export function offersOnShelf(shelf: ShelfKey): Offer[] {
  return OFFERS.filter((o) => o.shelf === shelf);
}

export function shelfByKey(key: ShelfKey): Shelf | undefined {
  return SHELVES.find((s) => s.key === key);
}

/** Where an offer's own page lives. */
export function offerHref(offer: Offer): string {
  return `/showroom/${offer.slug}`;
}

/**
 * What to show at the bottom of an offer's page.
 *
 * Shelf-mates first, because they're the genuine alternatives — someone
 * reading about Scale is deciding between Scale and Command, not between
 * Scale and a review widget. Then the featured item from each other shelf, so
 * the page also does the job of showing what else the counter carries.
 */
export function relatedOffers(offer: Offer, limit = 4): Offer[] {
  const sameShelf = offersOnShelf(offer.shelf).filter((o) => o.slug !== offer.slug);
  const elsewhere = SHELVES.filter((s) => s.key !== offer.shelf)
    .map((s) => offersOnShelf(s.key).find((o) => o.featured))
    .filter((o): o is Offer => Boolean(o));

  const seen = new Set<string>([offer.slug]);
  const out: Offer[] = [];
  for (const candidate of [...sameShelf, ...elsewhere]) {
    if (seen.has(candidate.slug)) continue;
    seen.add(candidate.slug);
    out.push(candidate);
    if (out.length === limit) break;
  }
  return out;
}

/**
 * What a bundle saves against buying its parts separately. Zero for anything
 * that isn't a bundle, so callers don't have to branch.
 */
export function offerSaving(offer: Offer): number {
  if (offer.kind !== "BUNDLE") return 0;
  return Math.max(0, bundleListPrice() - offer.price);
}

/** The first month's damage, including any one-time work. */
export function firstInvoice(offer: Offer): number {
  return offer.price + (offer.setupFee ?? 0);
}

/** Cheapest and dearest recurring prices on the counter, for metadata. */
export function priceRange(): { low: number; high: number } {
  const monthly = OFFERS.filter((o) => o.billing === "monthly").map((o) => o.price);
  return { low: Math.min(...monthly), high: Math.max(...monthly) };
}

/**
 * The tier an add-on shelf's work is most at home on, resolved to a real plan.
 * Used to link a service back to a membership rather than leaving it floating.
 */
export function anchorPlanFor(offer: Offer): PlanDef | undefined {
  if (offer.kind === "PLAN") return planByKey(offer.slug);
  if (offer.shelf === "capacity") return planByKey("scale");
  if (offer.shelf === "studio") return planByKey("operate");
  if (offer.shelf === "intelligence") return planByKey("monitor");
  return planByKey("scale");
}
