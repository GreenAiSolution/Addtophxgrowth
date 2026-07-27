import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { nightShiftRoster, runNightShift } from "@/lib/night-shift";

/**
 * Hourly cron (see vercel.json). Walks every client whose tier includes a night
 * shift and runs the ones that are due — `isDue` is what turns 24 hourly ticks
 * into one brief per client per day, at the hour that client chose.
 *
 * Runs sequentially on purpose: this is a background job with no user waiting,
 * and a burst of parallel model calls is a good way to get rate limited.
 */

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function authorized(req: Request): boolean {
  const secret = env.optional("CRON_SECRET");
  // No secret configured = refuse, rather than leaving an open endpoint that
  // spends the Anthropic budget for anyone who finds the URL.
  if (!secret) return false;

  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorized(req)) return json({ error: "Unauthorized" }, 401);

  const roster = await nightShiftRoster();
  const results = [];
  for (const clientId of roster) {
    try {
      results.push(await runNightShift(clientId));
    } catch (err) {
      // One tenant's failure must never stop the rest of the roster.
      console.error(`[cron/night-shift] ${clientId} threw:`, err);
      results.push({ clientId, status: "FAILED" as const, reason: (err as Error).message });
    }
  }

  const ran = results.filter((r) => r.status === "COMPLETE").length;
  console.info(`[cron/night-shift] ${ran}/${roster.length} briefs produced`);

  return json({
    ok: true,
    checked: roster.length,
    produced: ran,
    results,
  });
}
