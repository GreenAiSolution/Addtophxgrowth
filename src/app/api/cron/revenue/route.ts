import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { runDunning } from "@/lib/dunning";
import { runFollowUps } from "@/lib/pipeline";
import { collectRevenue, renderRevenueDigest, DIGEST_KEY } from "@/lib/revenue";
import { sendNotification, agencyAddress } from "@/lib/notify";
import { formatCurrency } from "@/lib/utils";

/**
 * The revenue pass. Once a day (see vercel.json).
 *
 * Three jobs, in the order they matter:
 *   1. Dunning — chase the money that already failed.
 *   2. Follow-ups — chase the money that hasn't been asked for yet.
 *   3. On Mondays, the digest — tell one person what the other two did.
 *
 * DAILY, NOT HOURLY, ON PURPOSE
 *   Every ladder in here is measured in days and every rung has a minimum gap
 *   of at least twenty hours. Running this hourly would do nothing twenty-three
 *   times out of twenty-four while giving a retry twenty-four chances a day to
 *   send something twice. The gate sweep is five-minutely because a review
 *   window is five minutes; nothing here is.
 *
 * NOTHING BELOW DECIDES ANYTHING
 *   Every decision is made by a pure function that has already been tested —
 *   `planDunning`, `planFollowUp`, `computeRevenue`. This file only sequences
 *   them and reports what happened, which is why it has no branches worth
 *   testing beyond the Monday one.
 */

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function authorized(req: Request): boolean {
  const secret = env.optional("CRON_SECRET");
  // No secret configured = refuse. An open endpoint here would let anyone who
  // found the URL fire a client's payment notices.
  if (!secret) return false;

  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Has the weekly digest already gone out this week?
 *
 * Six days rather than seven: a cron that drifts by a few minutes across a
 * week must not skip a Monday because the last send was 167 hours ago.
 */
function digestDue(lastRunAt: Date | null, now: Date): boolean {
  if (now.getUTCDay() !== 1) return false;
  if (!lastRunAt) return true;
  return (now.getTime() - lastRunAt.getTime()) / 3_600_000 >= 144;
}

export async function GET(req: Request) {
  if (!authorized(req)) return json({ error: "Unauthorized" }, 401);

  const now = new Date();
  const startedAt = Date.now();

  // Each pass is caught separately. A mail server that breaks the dunning run
  // must not also cost the follow-ups, and neither should cost the digest —
  // the digest is precisely how somebody finds out the other two are broken.
  let dunning;
  try {
    dunning = await runDunning(now);
  } catch (err) {
    console.error("[cron/revenue] dunning threw:", err);
    dunning = { error: (err as Error).message };
  }

  let followUps;
  try {
    followUps = await runFollowUps(now);
  } catch (err) {
    console.error("[cron/revenue] follow-ups threw:", err);
    followUps = { error: (err as Error).message };
  }

  let digest: unknown = { sent: false, why: "Not Monday." };
  try {
    const last = await prisma.systemRun.findUnique({ where: { key: DIGEST_KEY } });
    if (digestDue(last?.lastRunAt ?? null, now)) {
      const snapshot = await collectRevenue(now);
      const body = renderRevenueDigest(snapshot, formatCurrency);

      await sendNotification({
        kind: "REVENUE_WEEKLY",
        to: agencyAddress(),
        payload: {
          businessName: "This week",
          // The number is the subject. Somebody reading a notification bar on
          // a Monday morning should not have to open anything to learn it.
          title: `${formatCurrency(snapshot.mrrCents)} MRR · ${formatCurrency(snapshot.atRiskCents)} at risk`,
          detail: body,
          path: "/admin/revenue",
        },
      });

      await prisma.systemRun.upsert({
        where: { key: DIGEST_KEY },
        update: { lastRunAt: now, detail: { mrrCents: snapshot.mrrCents } },
        create: { key: DIGEST_KEY, lastRunAt: now, detail: { mrrCents: snapshot.mrrCents } },
      });

      digest = { sent: true, mrrCents: snapshot.mrrCents, atRiskCents: snapshot.atRiskCents };
    } else if (now.getUTCDay() === 1) {
      digest = { sent: false, why: "Already sent this week." };
    }
  } catch (err) {
    console.error("[cron/revenue] digest threw:", err);
    digest = { sent: false, error: (err as Error).message };
  }

  console.info("[cron/revenue]", JSON.stringify({ dunning, followUps, digest }));

  return json({ ok: true, dunning, followUps, digest, tookMs: Date.now() - startedAt });
}
