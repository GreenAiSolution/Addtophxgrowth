import { NextResponse } from "next/server";
import { deliveryChannels, canDeliver, env } from "@/lib/env";
import { UPGRADES } from "@/lib/upgrades";
import { checkDb } from "@/lib/db-health";

/**
 * Is the site actually working?
 *
 * Built after discovering that the enquiry endpoint had been silently dropping
 * leads in production for days, because "no mail transport configured" looks
 * exactly like "configured correctly" from the outside. The only way that
 * stays fixed is if the answer is one request away.
 *
 * Deliberately reports *which env var name* supplied each value, because the
 * original failure was a naming mismatch — `resend` where the code wanted
 * `RESEND_API_KEY` — and a health check that only says "email: ok" would have
 * hidden it just as well as no health check at all.
 *
 * Returns 503 when nothing can reach a human. An enquiry form that nobody
 * receives is a down service, whatever the homepage looks like.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const channels = deliveryChannels();
  const healthy = canDeliver();
  const db = await checkDb();

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      // The single question this endpoint exists to answer.
      enquiriesReachAHuman: healthy,
      channels: channels.map((c) => ({
        name: c.name,
        live: c.live,
        ...(c.live ? { configuredAs: c.via } : { fix: c.hint }),
      })),
      catalogue: { upgrades: UPGRADES.length },
      /**
       * Whether the gate can actually hold anything.
       *
       * A live probe against its own table, not a guess from env vars — a
       * DATABASE_URL pointing at a database nobody ever pushed to looks fine
       * from the outside and holds no invoices at all.
       *
       * Deliberately does not change the HTTP status. The public pages and the
       * enquiry form touch no database, so a missing schema is not a reason to
       * report the site down; `enquiriesReachAHuman` still owns the 503.
       */
      gate: {
        ready: db.gateReady,
        database: db.state,
        ...(db.fix ? { fix: db.fix } : {}),
      },
      // What the site believes its own address is — the value that goes into
      // the sitemap, the canonical tag and every share preview.
      siteUrl: env.siteUrl,
      knowsItsOwnAddress: !env.siteUrl.includes("localhost"),
      // Which source answered, so a wrong-looking domain is traceable to the
      // thing that set it rather than a guess.
      siteUrlFrom: process.env.NEXT_PUBLIC_APP_URL
        ? "NEXT_PUBLIC_APP_URL"
        : process.env.VERCEL_PROJECT_PRODUCTION_URL
          ? "VERCEL_PROJECT_PRODUCTION_URL"
          : process.env.VERCEL_URL
            ? "VERCEL_URL"
            : "fallback (localhost)",
      checkedAt: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
