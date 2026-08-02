import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { runShift } from "@/lib/desk";
import { checkDb } from "@/lib/db-health";

/**
 * The shift. Every hour (see vercel.json).
 *
 * Hourly rather than more often because the shortest duty interval on the
 * roster is two hours, and `isOnShift` — not this schedule — decides what is
 * actually due. A cron firing more often than any duty needs is a cron that
 * spends its whole life deciding to do nothing, and the wasted invocations are
 * the least of it: it makes the real cadence invisible, because the schedule
 * that appears in the deployment config stops being the one that runs.
 *
 * Distinct from the gate sweep, which runs every five minutes and must, because
 * it is the thing honouring a countdown a client is watching. This one produces
 * proposals; that one delivers them. Keeping them apart means a slow model call
 * can never delay somebody's held invoice, and a five-minute sweep never has to
 * wait behind an employee thinking.
 *
 * Idempotent by construction: `runDuty` claims a `runKey` per duty per
 * interval, so a Vercel retry re-enters and skips rather than working the shift
 * twice.
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
  // No secret configured = refuse. An open endpoint here would let anybody who
  // found the URL spend a client's tokens and fill their queue.
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

  const startedAt = new Date();
  try {
    const result = await runShift(startedAt);
    return json({ ok: true, ...result, tookMs: Date.now() - startedAt.getTime() });
  } catch (e) {
    const db = await checkDb();
    return json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        database: db.state,
        ...(db.fix ? { fix: db.fix } : {}),
      },
      503,
    );
  }
}
