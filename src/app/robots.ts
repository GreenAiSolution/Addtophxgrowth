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
 * `/api/catalogue` and `/api/mcp` are the deliberate exceptions to the `/api/`
 * block. This site sells Answer Engine Visibility — being the business a model
 * can describe accurately — and blocking the two endpoints that state our
 * offer in clean machine-readable form would be arguing against our own
 * product. Crawlers resolve allow/disallow by longest match, so the specific
 * allows beat the general block.
 *
 * Neither carries anything a client owns. Both serve the same facts as the
 * page, and `/api/mcp` in particular holds no tenant data and touches no
 * database — see the note at the top of its route. Anything tenant-scoped
 * belongs behind auth on a different path and stays inside the block.
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
        allow: ["/", "/api/catalogue", "/api/mcp"],
        disallow: ["/app/", "/admin/", "/api/", "/login"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
