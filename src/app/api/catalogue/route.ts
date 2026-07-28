import { NextResponse } from "next/server";
import {
  PARENT_SERVICES,
  UPGRADES,
  BUNDLES,
  bundleListPrice,
  bundleSaving,
  entryPrice,
  THESIS,
  PROOF_POSTURE,
  FLIGHT_CHECK,
} from "@/lib/upgrades";
import { BRAND } from "@/lib/brand";

/**
 * The catalogue, machine-readable.
 *
 * DIRECTION
 *   Two readers, and both of them matter.
 *
 *   The first is an assistant. This site sells Answer Engine Visibility — the
 *   product is being the business a model can describe accurately. Publishing
 *   our own offer as clean structured JSON is the least we can do while
 *   charging for it; a page that argues for machine-readable facts and ships
 *   only prose is arguing against itself.
 *
 *   The second is the MCP server in `phxgrowth-plus-mcp-server/`, which lets
 *   the agency quote a bundle from Slack without opening the site. It reads
 *   this endpoint rather than carrying its own copy of the prices, because two
 *   copies of a price list means one of them is eventually wrong, and it will
 *   be the one somebody quotes.
 *
 * BLUEPRINTS
 *   Read-only, no auth, no database. Everything here is already on the page in
 *   prose — this exposes nothing new, it just stops requiring a parser.
 *
 *   Prices are in cents, as they are everywhere else in this codebase, and are
 *   labelled as such. A currency figure that might be dollars and might be
 *   cents is how you quote somebody a hundredth of the real number.
 */

export const runtime = "nodejs";
export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(
    {
      brand: {
        name: BRAND.name,
        tagline: BRAND.tagline,
        parent: { name: BRAND.parent.name, url: BRAND.parent.url },
      },
      // What this property is for, in one place, so a reader that only fetches
      // this endpoint still understands the relationship to the parent agency.
      thesis: THESIS.body,
      currency: "USD",
      priceUnit: "cents",

      services: PARENT_SERVICES.map((s) => ({
        key: s.key,
        name: s.name,
        priceLabel: s.priceLabel,
        includes: s.includes,
      })),

      upgrades: UPGRADES.map((u) => ({
        key: u.key,
        name: u.name,
        attachesTo: u.attachesTo,
        promise: u.promise,
        fixes: u.fixes,
        delivers: u.delivers,
        demandCase: u.demandCase,
        price: u.price,
        billing: u.billing,
        leading: Boolean(u.leading),
        apex: Boolean(u.apex),
      })),

      bundles: BUNDLES.map((b) => ({
        key: b.key,
        name: b.name,
        members: b.members,
        promise: b.promise,
        rationale: b.rationale,
        price: b.price,
        listPrice: bundleListPrice(b),
        saving: bundleSaving(b),
        apex: Boolean(b.apex),
      })),

      entryPrice: entryPrice(),
      guarantee: FLIGHT_CHECK,

      // Shipped deliberately. A catalogue that lists prices and omits the fact
      // that there are no results to show yet is a sales sheet, and this is
      // meant to be read by something that will repeat it.
      proofPosture: PROOF_POSTURE,
    },
    { headers: { "cache-control": "public, max-age=300, s-maxage=3600" } },
  );
}
