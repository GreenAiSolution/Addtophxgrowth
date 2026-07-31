import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { sweep, SWEEP_INTERVAL_MINUTES } from "@/lib/gate";
import { checkDb } from "@/lib/db-health";
// Side-effect import: registers the "quote.send" executor before sweep()
// runs. Every build that proposes a gate action registers its executor the
// same way — see the comment at the top of lib/executors/estimate-send.ts.
import "@/lib/executors/estimate-send";

/**
 * The gate sweep. Every five minutes (see vercel.json).
 *
 * Closes review windows, runs what has been released, and lapses what nobody
 * got to. Separate from the hourly night-shift cron on purpose: the shortest
 * review window on the board is five minutes, and a queue that says "sends in
 * five minutes" while being swept hourly is showing a countdown attached to
 * nothing. `gate.test.ts` reads this schedule out of vercel.json and fails if
 * it stops matching `SWEEP_INTERVAL_MINUTES`.
 *
 * Idempotent by construction. Every transition inside `sweep` is guarded by the
 * state it moves from, so a retry — and Vercel does retry — cannot double-send.
 *
 * No model call anywhere in this path. The gate has to behave identically on a
 * day the Anthropic API is down, because "the model was unavailable" is not a
 * reason a client's invoice should go out unreviewed, or fail to.
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
  // No secret configured = refuse. An open sweep endpoint would let anyone who
  // found the URL release a client's held actions early.
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
    const result = await sweep(startedAt);
    return json({
      ok: true,
      everyMinutes: SWEEP_INTERVAL_MINUTES,
      ...result,
      tookMs: Date.now() - startedAt.getTime(),
    });
  } catch (e) {
    // Surfaced rather than swallowed: a sweep that stops running is a queue
    // that silently stops sending, which looks exactly like a quiet week.
    //
    // The schema being absent is called out by name because it is the failure
    // that actually happened — this repo had never had `db push` run against
    // production — and "relation does not exist" in a cron log at five-minute
    // intervals is a worse diagnostic than a sentence saying what to do.
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
