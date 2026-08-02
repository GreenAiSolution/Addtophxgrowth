/**
 * DELIVERY — what happens to a proposal after a human releases it.
 *
 * DIRECTION
 *   The gate was built with no executors at all, and said so out loud: "an
 *   action nobody can perform must never look like one that was performed."
 *   That was right while there was nothing proposing actions. Now there is, and
 *   a released invoice that reaches nothing is a queue that quietly turns into
 *   a to-do list.
 *
 *   The question is where the action gets performed. Building a Twilio client,
 *   a QuickBooks client, a Google Calendar client and a quoting integration
 *   into this codebase means holding four sets of credentials for every tenant,
 *   in a table that would immediately become the highest-value target in the
 *   product — and it means being wrong about which quoting tool a plumber in
 *   Mesa actually uses.
 *
 *   So the released action is handed to the client's own automation endpoint:
 *   an n8n webhook, a Make scenario, a Zapier catch hook, or a route in
 *   whatever they already run. The decisions stay here, where they are gated,
 *   audited and tenant-scoped. The credentials stay there, where they already
 *   were. And the client can see the workflow that sends their messages,
 *   because it is theirs.
 *
 * WHY IT IS SIGNED
 *   The endpoint receives instructions to invoice and message that business's
 *   customers. An unsigned URL that does that is a URL anybody who has ever
 *   seen it can use — a browser history, a screen share, a Slack paste. The
 *   signature covers a timestamp as well as the body, so a captured request
 *   cannot be replayed tomorrow.
 *
 * WHY A FAILURE IS LOUD
 *   `deliver` throws on anything short of a 2xx, and the gate records FAILED
 *   with the reason. Silently swallowing a delivery error would produce the one
 *   state this whole feature exists to prevent: an action the console shows as
 *   done that never happened.
 *
 * BLUEPRINTS
 *   `signPayload` and `deliveryBody` are pure and tested. `deliver` performs the
 *   request. `registerDeliveryExecutors` wires the seven kinds into the gate and
 *   is idempotent, so importing it twice is harmless.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  ACTION_KINDS,
  kindByKey,
  registerExecutor,
  hasExecutor,
  type ExecutorAction,
} from "@/lib/gate";

/** Nothing waits longer than this for a client's endpoint to answer. */
const TIMEOUT_MS = 10_000;

export interface DeliveryBody {
  event: "gate.action.released";
  /** Action kind key — the receiving workflow branches on this. */
  kind: string;
  label: string;
  movesMoney: boolean;
  summary: string;
  subject: string | null;
  /** Everything the employee proposed, field by field. */
  payload: Record<string, unknown>;
  releasedBy: string;
  releasedAt: string;
  /** So a replayed body cannot be a different action. */
  actionId: string;
}

/**
 * The exact body that goes over the wire.
 *
 * Pure and separate from `deliver` so the signature can be tested against a
 * fixed document. A signing function tested only through a live fetch is a
 * signing function nobody has actually checked.
 */
export function deliveryBody(action: {
  id: string;
  kind: string;
  summary: string;
  subject: string | null;
  movesMoney: boolean;
  payload: unknown;
  releasedBy: string | null;
  releasedAt: Date | null;
}): DeliveryBody {
  const kind = kindByKey(action.kind);
  return {
    event: "gate.action.released",
    kind: action.kind,
    label: kind?.label ?? action.kind,
    movesMoney: action.movesMoney,
    summary: action.summary,
    subject: action.subject,
    payload: (action.payload ?? {}) as Record<string, unknown>,
    releasedBy: action.releasedBy ?? "unknown",
    releasedAt: (action.releasedAt ?? new Date()).toISOString(),
    actionId: action.id,
  };
}

/**
 * HMAC-SHA256 over `${timestamp}.${body}`.
 *
 * The timestamp is inside the signed material rather than beside it, which is
 * the whole point: a header the receiver merely reads can be edited by whoever
 * captured the request, and a replay check against an editable timestamp checks
 * nothing.
 */
export function signPayload(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/**
 * Verify a signature. Exported for the receiving end — a client writing their
 * own endpoint should not have to work out the scheme from this file.
 */
export function verifySignature(
  secret: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean {
  const expected = signPayload(secret, timestamp, body);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface DeliveryResult {
  delivered: true;
  endpoint: string;
  status: number;
  /** Whatever the endpoint said, truncated. Kept on the action for the record. */
  response: string;
}

/**
 * Hand one released action to the tenant's automation endpoint.
 *
 * Throws rather than returning a failure, because the caller is the gate and
 * the gate's contract is that a thrown executor means FAILED with a readable
 * reason — which is what a client should see when their endpoint is down, and
 * is very much not "executed".
 */
export async function deliver(action: ExecutorAction): Promise<DeliveryResult> {
  const config = await prisma.webhookConfig.findFirst({
    where: { clientId: action.clientId, enabled: true },
    orderBy: { createdAt: "asc" },
    select: { url: true, secret: true, label: true },
  });

  if (!config?.url) {
    throw new Error(
      "No delivery endpoint is configured for this business, so nothing was sent. Add one under the integration settings and release this again.",
    );
  }

  const body = JSON.stringify(deliveryBody(action));
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-phx-timestamp": timestamp,
    "x-phx-action-kind": action.kind,
  };
  if (config.secret) {
    headers["x-phx-signature"] = `sha256=${signPayload(config.secret, timestamp, body)}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(config.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    const text = (await res.text().catch(() => "")).slice(0, 500);
    if (!res.ok) {
      throw new Error(`${config.label} returned ${res.status}. Nothing was sent. ${text}`.trim());
    }
    return { delivered: true, endpoint: config.label, status: res.status, response: text };
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      throw new Error(`${config.label} did not answer within ${TIMEOUT_MS / 1000}s. Nothing was sent.`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Wire every action kind to the delivery path.
 *
 * All seven go the same way, which is the reason this is one function rather
 * than seven registrations scattered across the builds. A kind wired
 * differently from its neighbours is a kind whose behaviour nobody can state
 * without reading the code.
 *
 * Registration is explicit rather than an import side-effect. A module that
 * wires senders merely by being imported is a module that eventually gets
 * imported by a test, a script, or a page that only wanted a type.
 */
export function registerDeliveryExecutors(): void {
  for (const kind of ACTION_KINDS) {
    if (hasExecutor(kind.key)) continue;
    registerExecutor(kind.key, async (action) => {
      const result = await deliver(action);
      return { ...result };
    });
  }
}
