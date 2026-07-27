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
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.appUrl.replace(/\/$/, "");
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
