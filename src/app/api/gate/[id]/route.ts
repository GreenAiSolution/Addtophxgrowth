import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireClient, AuthError, ForbiddenError } from "@/lib/tenancy";
import { rateLimit } from "@/lib/rate-limit";
import { release, withdraw } from "@/lib/gate";

/**
 * Release or pull one held action.
 *
 * TENANCY IS THE WHOLE SECURITY STORY HERE
 *   The id in the URL is user input. `requireClient` resolves the tenant from
 *   the session and the action is re-read scoped to that clientId, so a signed
 *   -in client cannot release somebody else's invoice by guessing a cuid. The
 *   ownership check happens before anything in `lib/gate` is called, because
 *   the gate itself is deliberately tenant-agnostic — it enforces the hold
 *   rules, not who is allowed to ask.
 *
 * THE ACTOR IS NOT OPTIONAL
 *   The catalogue promises "every release is recorded against your name". The
 *   name comes from the session, never from the request body — a client-
 *   supplied actor would let somebody release in a colleague's name, which is
 *   worse than not recording one at all.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  action: z.enum(["release", "withdraw"]),
  reason: z.string().max(500).optional(),
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let client;
  let actor;
  try {
    ({ client, actor } = await requireClient());
  } catch (e) {
    if (e instanceof AuthError) return json({ error: "Not authenticated" }, 401);
    if (e instanceof ForbiddenError) return json({ error: "Forbidden" }, 403);
    throw e;
  }

  const rl = rateLimit(`gate:${client.id}`, { limit: 60, windowMs: 60_000 });
  if (!rl.success) return json({ error: "Rate limit exceeded. Slow down." }, 429);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);

  // Scoped read. A 404 for somebody else's action, never a 403 — there is no
  // reason to confirm that an id exists on another tenant.
  const existing = await prisma.pendingAction.findFirst({
    where: { id: params.id, clientId: client.id },
    select: { id: true },
  });
  if (!existing) return json({ error: "No such action" }, 404);

  const name = actor.email || "a signed-in user";

  try {
    const updated =
      parsed.data.action === "release"
        ? await release(existing.id, { name, userId: actor.userId })
        : await withdraw(existing.id, { name, reason: parsed.data.reason });

    return json({
      ok: true,
      id: updated.id,
      state: updated.state,
      releasedBy: updated.releasedBy,
      releasedAt: updated.releasedAt,
    });
  } catch (e) {
    // The gate refuses transitions the state machine forbids — releasing
    // something already sent, pulling something already executed. That is a
    // conflict, not a server error, and the queue shows it as one.
    return json({ error: e instanceof Error ? e.message : "Refused" }, 409);
  }
}
