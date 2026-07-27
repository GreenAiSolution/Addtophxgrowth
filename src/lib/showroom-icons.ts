import {
  Bot,
  Radar,
  Layers,
  Clapperboard,
  TrendingUp,
  Telescope,
  Gauge,
  type LucideIcon,
} from "lucide-react";
import type { ShelfKey } from "@/lib/storefront";

/**
 * One icon per shelf, in its own file so `storefront.ts` stays free of React
 * imports — it's imported by `sitemap.ts` and the route handlers, and dragging
 * an icon library into those bundles for the sake of a picture is a bad trade.
 *
 * `Record` rather than a lookup with a fallback on purpose: adding a shelf
 * without choosing an icon is a type error, not a silently generic box.
 */
export const SHELF_ICONS: Record<ShelfKey, LucideIcon> = {
  automation: Bot,
  adops: Radar,
  foundations: Layers,
  studio: Clapperboard,
  growth: TrendingUp,
  intelligence: Telescope,
  capacity: Gauge,
};
