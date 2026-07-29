import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { nightShiftRoster, runNightShift } from "@/lib/night-shift";
import { spendWatchRoster, runSpendWatch } from "@/lib/spend-watch";
import { comebackRoster, runComeback } from "@/lib/comeback";

/**
 * Hourly cron (see vercel.json). Drives the unattended passes:
 *   - the night shift, which scores leads and writes the morning brief
 *   - the Spend Watch, which sweeps ad accounts and raises alerts
 *   - the Comeback, which queues messages to past customers who are due
 *
 * Each rosters off its own build/line, so a client on one only, or on all, is
 * handled without special-casing. `isDue` / `isSweepDue` / `isComebackDue` are
 * what turn 24 hourly ticks into one run per client per day. The Comeback only
 * proposes — nothing it queues sends until the gate sweep releases it — so it
 * is safe to sit alongside the passes that write directly.
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

  const [agentRoster, adOpsRoster, comebackClients] = await Promise.all([
    nightShiftRoster(),
    spendWatchRoster(),
    comebackRoster(),
  ]);

  const briefs = [];
  for (const clientId of agentRoster) {
    try {
      briefs.push(await runNightShift(clientId));
    } catch (err) {
      // One tenant's failure must never stop the rest of the roster.
      console.error(`[cron/night-shift] night shift for ${clientId} threw:`, err);
      briefs.push({ clientId, status: "FAILED" as const, reason: (err as Error).message });
    }
  }

  const sweeps = [];
  for (const clientId of adOpsRoster) {
    try {
      sweeps.push(await runSpendWatch(clientId));
    } catch (err) {
      console.error(`[cron/night-shift] spend watch for ${clientId} threw:`, err);
      sweeps.push({ clientId, status: "FAILED" as const, reason: (err as Error).message });
    }
  }

  const comebacks = [];
  for (const clientId of comebackClients) {
    try {
      comebacks.push(await runComeback(clientId));
    } catch (err) {
      console.error(`[cron/night-shift] comeback for ${clientId} threw:`, err);
      comebacks.push({ clientId, status: "FAILED" as const, reason: (err as Error).message });
    }
  }

  const produced = briefs.filter((r) => r.status === "COMPLETE").length;
  const swept = sweeps.filter((r) => r.status === "COMPLETE").length;
  const queued = comebacks.reduce((n, r) => n + (r.status === "COMPLETE" ? (r.proposed ?? 0) : 0), 0);
  console.info(
    `[cron/night-shift] ${produced}/${agentRoster.length} briefs, ${swept}/${adOpsRoster.length} sweeps, ` +
      `${queued} comeback actions across ${comebackClients.length} clients`,
  );

  return json({
    ok: true,
    nightShift: { checked: agentRoster.length, produced, results: briefs },
    spendWatch: { checked: adOpsRoster.length, swept, results: sweeps },
    comeback: { checked: comebackClients.length, queued, results: comebacks },
  });
}
