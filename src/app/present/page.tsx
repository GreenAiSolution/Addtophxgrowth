import type { Metadata } from "next";
import { Stage } from "@/components/presentation/stage";
import { BRAND } from "@/lib/brand";

/**
 * The follow-up deck.
 *
 * Not a marketing page. This is the internal sales surface we screen-share on
 * the Zoom that follows a cold call — the routine, in order, every time.
 *
 * NOINDEX, AND OUT OF THE SITEMAP
 *   It is unlisted rather than authenticated, deliberately: a rep needs to open
 *   it on a borrowed laptop thirty seconds before a call, and a login screen at
 *   that moment costs more than the risk of an unlinked URL being found. What
 *   it must never do is turn up in a search result for the business, so it is
 *   `noindex, nofollow`, absent from the sitemap, and disallowed in robots.txt.
 *
 *   Nothing on the stage is confidential — every figure is already on the
 *   public price list. The confidential half is the run sheet's economics, and
 *   that lives in a module the stage cannot import.
 */
export const metadata: Metadata = {
  title: `Follow-up deck — ${BRAND.name}`,
  robots: { index: false, follow: false, nocache: true },
};

export default function PresentPage() {
  return <Stage />;
}
