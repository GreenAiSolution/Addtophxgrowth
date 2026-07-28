import type { MetadataRoute } from "next";
import { LEGAL_DOCUMENTS } from "@/lib/legal";
import { env } from "@/lib/env";

/**
 * Short, because the site is short.
 *
 * There is one public page and the legal set. The console and admin are noindex
 * by nature and have nothing to gain from being crawled. Generated from
 * `LEGAL_DOCUMENTS` rather than typed out, so a new document is discoverable the
 * moment it ships rather than whenever somebody remembers to edit a list.
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
    ...LEGAL_DOCUMENTS.map((d) => ({
      url: `${base}/legal/${d.slug}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
  ];
}
