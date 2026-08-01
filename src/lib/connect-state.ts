/**
 * The `state` parameter on an OAuth round trip.
 *
 * A connector hands the owner off to somebody else's website and gets them back
 * a minute later. `state` is the only thing that survives the journey, so it has
 * to carry two facts and be impossible to forge:
 *
 *   - **which tenant** this connection belongs to. Without it, the callback
 *     would have to trust whatever session the browser happens to hold when it
 *     lands, and a mis-timed login would attach one business's books to
 *     another's account.
 *   - **when it was issued**, so a stale link somebody kept in a tab cannot be
 *     replayed a week later.
 *
 * Signed, not encrypted. Nothing here is secret — the point is that nobody can
 * change it.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Long enough for a person to log into QuickBooks and pick a company. */
export const STATE_TTL_SECONDS = 900;

function key(): string {
  return process.env.AUTH_SECRET ?? "insecure-demo-secret-set-AUTH_SECRET";
}

function b64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

export function signState(payload: { clientId: string; connector: string; at?: Date }): string {
  const body = b64url(
    JSON.stringify({
      c: payload.clientId,
      k: payload.connector,
      t: Math.floor((payload.at ?? new Date()).getTime() / 1000),
    }),
  );
  const mac = createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function readState(
  state: string,
  now = new Date(),
): { ok: true; clientId: string; connector: string } | { ok: false; why: string } {
  const dot = state.lastIndexOf(".");
  if (dot < 1) return { ok: false, why: "That link is malformed." };

  const body = state.slice(0, dot);
  const mac = state.slice(dot + 1);
  const expected = createHmac("sha256", key()).update(body).digest("base64url");

  const a = Buffer.from(expected);
  const b = Buffer.from(mac);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, why: "That link did not come from us." };
  }

  let parsed: { c?: string; k?: string; t?: number };
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, why: "That link is malformed." };
  }
  if (!parsed.c || !parsed.k || !parsed.t) return { ok: false, why: "That link is malformed." };

  const age = Math.floor(now.getTime() / 1000) - parsed.t;
  if (age < -60 || age > STATE_TTL_SECONDS) {
    return { ok: false, why: "That link expired. Start the connection again — it only takes a moment." };
  }

  return { ok: true, clientId: parsed.c, connector: parsed.k };
}
