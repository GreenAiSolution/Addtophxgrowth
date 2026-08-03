import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { nightShiftRoster, runNightShift } from "@/lib/night-shift";
import { spendWatchRoster, runSpendWatch } from "@/lib/spend-watch";
import { codingSweep, refreshGenome } from "@/lib/genome/genome";
import {
  conversationRoster,
  extractConversation,
  extractionBacklog,
  foldIntoMemory,
} from "@/lib/conversations/ingest";

/**
 * Hourly cron (see vercel.json). Drives both unattended passes:
 *   - the night shift, which scores leads and writes the morning brief
 *   - the Spend Watch, which sweeps ad accounts and raises alerts
 *
 * Both roster off their own product line, so a client on one line only, or on
 * both, is handled without special-casing. `isDue` / `isSweepDue` are what turn
 * 24 hourly ticks into one run per client per day, at the hour that client
 * chose.
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

  const [agentRoster, adOpsRoster] = await Promise.all([nightShiftRoster(), spendWatchRoster()]);

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

  // Conversations: read whatever has been ingested and not yet read, then fold
  // the conclusions into system memory. Both are capped and both roster off
  // their own criteria rather than off tier — conversations arrive for every
  // client regardless of what they pay, and a tier-gated roster is how a
  // Launch client's data ends up extracted and silently never used.
  const conversations = { extracted: 0, failed: 0, folded: 0 };
  for (const id of await extractionBacklog()) {
    try {
      await extractConversation(id);
      conversations.extracted += 1;
    } catch (err) {
      console.error(`[cron/night-shift] extraction for ${id} threw:`, err);
      conversations.failed += 1;
    }
  }
  for (const clientId of await conversationRoster()) {
    try {
      const result = await foldIntoMemory(clientId);
      conversations.folded += result.applied;
    } catch (err) {
      console.error(`[cron/night-shift] memory fold for ${clientId} threw:`, err);
    }
  }

  // Genome work runs after the per-tenant work rather than before it. It reads
  // across every account, so it is the one job here whose failure must not be
  // able to cost a single client their brief — and running it last is the
  // cheapest way to guarantee that ordering. The sweep codes what arrived
  // uncoded, then the refresh recomputes the book over everything coded.
  let sweep = null;
  try {
    sweep = await codingSweep();
  } catch (err) {
    console.error("[cron/night-shift] coding sweep threw:", err);
  }

  let genome = null;
  try {
    genome = await refreshGenome();
  } catch (err) {
    console.error("[cron/night-shift] genome refresh threw:", err);
  }

  const produced = briefs.filter((r) => r.status === "COMPLETE").length;
  const swept = sweeps.filter((r) => r.status === "COMPLETE").length;
  console.info(
    `[cron/night-shift] ${produced}/${agentRoster.length} briefs, ${swept}/${adOpsRoster.length} sweeps, coded ${
      sweep ? `${sweep.coded}/${sweep.attempted}` : "failed"
    }, genome ${
      genome ? `${genome.decisive}/${genome.findings} decisive on ${genome.accounts} accounts` : "failed"
    }, conversations ${conversations.extracted} read / ${conversations.folded} folded`,
  );

  return json({
    ok: true,
    nightShift: { checked: agentRoster.length, produced, results: briefs },
    spendWatch: { checked: adOpsRoster.length, swept, results: sweeps },
    conversations,
    codingSweep: sweep,
    genome,
  });
}
