import type { MetadataRoute } from "next";
import { VERTICAL_PACKS } from "@/lib/verticals";
import { SYSTEM_BLUEPRINTS } from "@/lib/systems";
import { LEGAL_DOCUMENTS } from "@/lib/legal";
import { env } from "@/lib/env";

/**
 * Generated from the same sources the pages are, so a new trade or tier is
 * discoverable the moment it ships rather than whenever somebody remembers to
 * edit a list. Only public pages — the console and admin are noindex by nature
 * and have nothing to gain from being crawled.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.appUrl.replace(/\/$/, "");
  const now = new Date();

  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/cockpit`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/verticals`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    // The trade pages are the organic play — each one targets a different buyer.
    ...VERTICAL_PACKS.map((v) => ({
      url: `${base}/verticals/${v.key}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...SYSTEM_BLUEPRINTS.map((b) => ({
      url: `${base}/plans/${b.planKey}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...LEGAL_DOCUMENTS.map((d) => ({
      url: `${base}/legal/${d.slug}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
  ];
}
