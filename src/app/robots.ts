import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/**
 * Everything public is crawlable; nothing behind a login is. `/app` and
 * `/admin` hold client data and have no SEO value, and `/api` should never be
 * indexed — the intake endpoint in particular takes a token in the query string.
 *
 * `siteUrl`, not `appUrl`. With NEXT_PUBLIC_APP_URL unset this file was
 * serving `Sitemap: http://localhost:3000/sitemap.xml` to Googlebot in
 * production — a sitemap pointer no crawler on earth can follow, which is the
 * whole file wasted. `siteUrl` reads Vercel's own domain variables, so a deploy
 * identifies itself correctly with no dashboard step.
 *
 * `/present` is the follow-up deck we screen-share on sales calls. It is
 * unlisted rather than authenticated — a rep opening it thirty seconds before a
 * call cannot be stopped by a login — so this block, its `noindex` metadata and
 * its absence from the sitemap are the whole of what keeps it out of a search
 * result for the business.
 *
 * `/api/catalogue` is the one deliberate exception to the `/api/` block. This
 * site sells Answer Engine Visibility — being the business a model can
 * describe accurately — and blocking the one endpoint that states our offer in
 * clean machine-readable form would be arguing against our own product.
 * Crawlers resolve allow/disallow by longest match, so the specific allow
 * beats the general block.
 */
/**
 * Resolved per request, not at build time.
 *
 * This file is otherwise statically generated, which means the value of
 * `siteUrl` is frozen at the moment `next build` runs. If the domain variable
 * is missing from the *build* environment — a local build, a misconfigured CI
 * step — `http://localhost:3000` is baked into the artifact permanently and no
 * amount of setting it correctly at runtime will change what Googlebot reads.
 * That is exactly how the original bug survived: it was a build-time value
 * being debugged as a runtime one. Two tiny text responses per crawl is a
 * trivial price for the guarantee.
 */
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = env.siteUrl;
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/api/catalogue"],
        disallow: ["/app/", "/admin/", "/api/", "/login", "/present"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
