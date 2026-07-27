import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { postWebhook } from "@/lib/webhooks";
import { UPGRADES } from "@/lib/upgrades";

/**
 * First-party analytics. No script, no vendor, no cookie.
 *
 * The site had zero instrumentation: one page, one conversion path, and no way
 * to know whether anybody arrived, how far they read, or which upgrade they
 * reached for. Selling attribution while running blind is not a position worth
 * defending.
 *
 * Deliberately not a third-party tag. A tag would mean a consent banner, a
 * blocked request for a third of visitors, and someone else's cookie on a page
 * whose entire argument is that it is straight with you. This is a beacon to
 * our own origin carrying four fields, none of which identify a person.
 *
 * Storage is intentionally the cheapest thing that works: a structured log
 * line, mirrored to the Zapier hook when one is configured, so it lands in a
 * sheet without a database. If volume ever justifies it, point this at a real
 * store — the client contract will not need to change.
 */

export const runtime = "nodejs";

const UPGRADE_KEYS = UPGRADES.map((u) => u.key);

const Body = z.object({
  /** What happened. Closed set — an open string would become a junk drawer. */
  event: z.enum(["view", "depth", "gap_finder", "upgrade_added", "enquiry_started"]),
  /** Scroll depth bucket, or the upgrade key, depending on the event. */
  detail: z.string().max(64).optional(),
  /** Where they came from, as the browser reports it. */
  referrer: z.string().max(300).optional(),
  /** Viewport width bucket, so layout decisions have evidence behind them. */
  width: z.number().int().min(0).max(10000).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  // A malformed beacon is not worth an error page or a log line — analytics
  // must never be able to affect the person browsing.
  if (!parsed.success) return new NextResponse(null, { status: 204 });

  const { event, detail, referrer, width } = parsed.data;

  // Only accept a detail we recognise, so a crafted beacon can't write
  // arbitrary strings into the log or the sheet.
  const safeDetail =
    event === "upgrade_added"
      ? UPGRADE_KEYS.includes(detail ?? "")
        ? detail
        : undefined
      : detail?.slice(0, 64);

  const row = {
    event,
    detail: safeDetail,
    referrer: referrer?.slice(0, 300),
    width,
    at: new Date().toISOString(),
  };

  console.info(`[pulse] ${JSON.stringify(row)}`);
  void postWebhook(env.zapierLeadHook ?? env.zapierOnboardHook, { kind: "PULSE", ...row }, {
    label: "pulse",
  });

  return new NextResponse(null, { status: 204 });
}
