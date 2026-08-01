import type { MetadataRoute } from "next";
import { LEGAL_DOCUMENTS } from "@/lib/legal";
import { env } from "@/lib/env";

/**
 * Short, because the site is short.
 *
 * Three public pages and the legal set. `/` is the instrument deck; `/upgrades`
 * is the price list, and it is the one most likely to earn a search result —
 * "what does X cost" is a query, and a deck of canvases is not an answer to it.
 * The console and admin are noindex by nature and have nothing to gain from
 * being crawled. The legal set is generated from `LEGAL_DOCUMENTS` rather than
 * typed out, so a new document is discoverable the moment it ships rather than
 * whenever somebody remembers to edit a list.
 *
 * `siteUrl`, not `appUrl`: with NEXT_PUBLIC_APP_URL unset, every <loc> in this
 * file read `http://localhost:3000`, which submits a sitemap of dead URLs.
 *
 * Note it is not `publicUrl` either. That one falls back to phxgrowth.com so
 * email links always land somewhere real — correct for a link, catastrophic
 * here, because a sitemap listing another domain's URLs as ours is a claim
 * Google acts on.
 */
/** Per request, not at build time — see the note in `robots.ts`. */
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.siteUrl;
  const now = new Date();

  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    {
      url: `${base}/upgrades`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    },
    // The event reference. Public on purpose: an integration doc nobody can
    // open without an account is one that gets replaced by a support email,
    // and "how do I verify the webhook signature" is a searched query.
    {
      url: `${base}/developers`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    },
    ...LEGAL_DOCUMENTS.map((d) => ({
      url: `${base}/legal/${d.slug}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
  ];
}
