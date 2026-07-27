import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/**
 * Everything public is crawlable; nothing behind a login is. `/app` and
 * `/admin` hold client data and have no SEO value, and `/api` should never be
 * indexed — the intake endpoint in particular takes a token in the query string.
 */
export default function robots(): MetadataRoute.Robots {
  const base = env.appUrl.replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app/", "/admin/", "/api/", "/login"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
