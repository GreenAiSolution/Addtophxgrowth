/**
 * THE EVENT BUS AND THE OUTBOX.
 *
 * The database half of the integration layer. `events.ts` decides what an event
 * *is*, `connectors.ts` decides what each destination *wants*, and this file is
 * the only place that writes rows and opens sockets.
 *
 * THE SHAPE OF IT
 *   `emit()` is called from wherever the real thing happened — a call ended, an
 *   estimate was released. It builds the event, works out which connections
 *   want it, and writes one outbox row per connection. It does **not** deliver.
 *   That is deliberate: `emit` runs inside a live phone call's request path,
 *   and a client's Zapier hook having a slow morning must not become dead air
 *   on somebody's line.
 *
 *   `deliverDue()` runs on the gate cron, every five minutes, and does the
 *   sending with the backoff from `events.ts`. `deliverOne()` exists so the
 *   connections screen can send a test event and give an answer immediately —
 *   setup is the one moment where waiting five minutes to find out you typed
 *   the URL wrong is unacceptable.
 *
 * WHY AN OUTBOX AT ALL
 *   Because the alternative is `postWebhook`: fire, forget, and lose the event
 *   if the receiver was mid-deploy. A client who reconciles their books against
 *   this stream needs "we tried six times over a day and here is what came
 *   back", not a log line.
 */

import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import {
  buildEvent,
  isRetryable,
  MAX_ATTEMPTS,
  nextAttemptAt,
  signPayload,
  type BusinessEvent,
  type EventType,
} from "@/lib/events";
import { bodyFor, connectorById, wantsEvent } from "@/lib/connectors";
import { pushToQuickBooks, type QuickBooksConfig } from "@/lib/quickbooks";

/** How long we will wait on somebody else's endpoint before giving up on a try. */
const TIMEOUT_MS = 8000;

// ---------------------------------------------------------------------------
// Emitting
// ---------------------------------------------------------------------------

export interface EmitInput {
  clientId: string;
  type: EventType;
  /** Idempotency handle — a call id, an estimate id. Same occurrence, same id. */
  key: string;
  data: Record<string, unknown>;
  at?: Date;
}

/**
 * Record that something happened, for anybody listening.
 *
 * Never throws. An integration failing must not fail the thing it was
 * describing: an estimate that was released is released whether or not
 * QuickBooks heard about it, and rolling back the release because a webhook
 * table was unreachable would be the tail wagging the dog.
 */
export async function emit(input: EmitInput): Promise<{ eventId: string | null; queued: number }> {
  try {
    const [client, connections] = await Promise.all([
      prisma.clientProfile.findUnique({
        where: { id: input.clientId },
        select: { businessName: true },
      }),
      prisma.connection.findMany({
        where: { clientId: input.clientId, enabled: true },
        select: { id: true, connector: true, events: true },
      }),
    ]);

    const event = buildEvent({
      type: input.type,
      clientId: input.clientId,
      key: input.key,
      data: input.data,
      businessName: client?.businessName ?? undefined,
      at: input.at,
    });

    const targets = connections.filter((c) => {
      const connector = connectorById(c.connector);
      return connector ? wantsEvent(connector, c.events, input.type) : false;
    });

    if (targets.length === 0) return { eventId: event.id, queued: 0 };

    const written = await prisma.eventDelivery.createMany({
      data: targets.map((c) => ({
        clientId: input.clientId,
        connectionId: c.id,
        eventId: event.id,
        eventType: event.type,
        payload: event as never,
        // Attempt zero is due immediately; the cron picks it up on its next
        // pass rather than this request paying for it.
        nextAttemptAt: input.at ?? new Date(),
      })),
      // The unique index on (connectionId, eventId) is doing the real work.
      // A retried provider webhook re-emits the same event and lands here.
      skipDuplicates: true,
    });

    return { eventId: event.id, queued: written.count };
  } catch (e) {
    console.warn("[events] could not queue:", e instanceof Error ? e.message : String(e));
    return { eventId: null, queued: 0 };
  }
}

// ---------------------------------------------------------------------------
// Delivering
// ---------------------------------------------------------------------------

export interface DeliveryAttempt {
  ok: boolean;
  status: number;
  detail: string;
  /** Adapter connections whose stored credentials rotated during the attempt. */
  credentials?: Record<string, unknown>;
}

/**
 * One attempt at one destination. No database writes — the caller records.
 *
 * Exported so the connections screen can run it against a synthetic event and
 * show the owner the actual response code.
 */
export async function attemptDelivery(
  connection: {
    connector: string;
    url: string | null;
    secret: string | null;
    credentials: unknown;
  },
  event: BusinessEvent,
): Promise<DeliveryAttempt> {
  const connector = connectorById(connection.connector);
  if (!connector) {
    return { ok: false, status: 400, detail: `Unknown connector "${connection.connector}".` };
  }

  if (connector.style === "adapter") {
    if (connector.id !== "quickbooks") {
      return { ok: false, status: 400, detail: "No adapter is wired for that connector." };
    }
    const clientId = env.optional("QUICKBOOKS_CLIENT_ID");
    const clientSecret = env.optional("QUICKBOOKS_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      // Retryable on purpose: this is a missing deploy variable, not a bad
      // event. Once somebody sets it, the queued events go through.
      return {
        ok: false,
        status: 503,
        detail:
          "QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET are not set on this deployment, so nothing could be sent to QuickBooks.",
      };
    }
    const cfg = connection.credentials as QuickBooksConfig | null;
    if (!cfg?.realmId || !cfg?.refreshToken) {
      return { ok: false, status: 400, detail: "This QuickBooks connection has no company on it." };
    }
    const result = await pushToQuickBooks(cfg, { type: event.type, data: event.data }, { clientId, clientSecret });
    return {
      ok: result.ok,
      status: result.status,
      detail: result.detail,
      ...(result.config ? { credentials: result.config as unknown as Record<string, unknown> } : {}),
    };
  }

  if (!connection.url) return { ok: false, status: 400, detail: "This connection has no URL on it." };

  const body = bodyFor(connector, event);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(connection.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "phxgrowth-events/1",
        "x-phx-event-id": event.id,
        "x-phx-event-type": event.type,
        ...(connection.secret ? { "x-phx-signature": signPayload(connection.secret, body) } : {}),
      },
      body,
      signal: controller.signal,
    });
    const text = await res.text().catch(() => "");
    return {
      ok: res.ok,
      status: res.status,
      detail: res.ok
        ? `${res.status} from ${hostOf(connection.url)}`
        : `${res.status} from ${hostOf(connection.url)}: ${text.slice(0, 200) || "no body"}`,
    };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      // 0 means "we never got an answer" — retryable, and distinguishable in
      // the log from a receiver that answered with a refusal.
      status: 0,
      detail: aborted
        ? `No answer from ${hostOf(connection.url)} within ${TIMEOUT_MS / 1000} seconds.`
        : `Could not reach ${hostOf(connection.url)}: ${e instanceof Error ? e.message : String(e)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "the endpoint";
  }
}

/** Deliver one queued row and record what happened. */
export async function deliverOne(deliveryId: string, now = new Date()): Promise<DeliveryAttempt> {
  const row = await prisma.eventDelivery.findUnique({
    where: { id: deliveryId },
    include: { connection: true },
  });
  if (!row) return { ok: false, status: 404, detail: "No such delivery." };

  const attempt = await attemptDelivery(row.connection, row.payload as unknown as BusinessEvent);
  await record(row.id, row.connectionId, row.attempts, attempt, now);
  return attempt;
}

async function record(
  deliveryId: string,
  connectionId: string,
  attemptsBefore: number,
  attempt: DeliveryAttempt,
  now: Date,
): Promise<void> {
  const attempts = attemptsBefore + 1;

  if (attempt.ok) {
    await prisma.$transaction([
      prisma.eventDelivery.update({
        where: { id: deliveryId },
        data: {
          status: "DELIVERED",
          attempts,
          deliveredAt: now,
          lastStatus: attempt.status,
          lastError: null,
          nextAttemptAt: null,
        },
      }),
      prisma.connection.update({
        where: { id: connectionId },
        data: {
          lastOkAt: now,
          lastError: null,
          consecutiveFailures: 0,
          ...(attempt.credentials ? { credentials: attempt.credentials as never } : {}),
        },
      }),
    ]);
    return;
  }

  const retryable = isRetryable(attempt.status) || attempt.status === 0;
  const next = retryable ? nextAttemptAt(attempts, now) : null;

  await prisma.$transaction([
    prisma.eventDelivery.update({
      where: { id: deliveryId },
      data: {
        // DROPPED means the receiver understood and refused — there is no point
        // trying that one again, and it should read differently on a screen
        // from one we gave up on after six goes.
        status: next ? "PENDING" : retryable ? "FAILED" : "DROPPED",
        attempts,
        nextAttemptAt: next,
        lastStatus: attempt.status,
        lastError: attempt.detail.slice(0, 1000),
      },
    }),
    prisma.connection.update({
      where: { id: connectionId },
      data: {
        lastFailAt: now,
        lastError: attempt.detail.slice(0, 1000),
        consecutiveFailures: { increment: 1 },
        ...(attempt.credentials ? { credentials: attempt.credentials as never } : {}),
      },
    }),
  ]);
}

export interface SweepResult {
  attempted: number;
  delivered: number;
  retrying: number;
  gaveUp: number;
}

/**
 * Send everything that is due. Called from the gate cron.
 *
 * Sequential rather than parallel, and capped. A client with a thousand queued
 * events and a receiver that times out at eight seconds would otherwise hold a
 * serverless function open until it is killed halfway through — which loses
 * nothing (the rows are still PENDING) but does mean the same first fifty rows
 * get retried forever while the rest never move.
 */
export async function deliverDue(now = new Date(), limit = 40): Promise<SweepResult> {
  const due = await prisma.eventDelivery.findMany({
    where: {
      status: "PENDING",
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      attempts: { lt: MAX_ATTEMPTS },
      connection: { enabled: true },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { connection: true },
  });

  const result: SweepResult = { attempted: 0, delivered: 0, retrying: 0, gaveUp: 0 };

  for (const row of due) {
    const attempt = await attemptDelivery(row.connection, row.payload as unknown as BusinessEvent);
    await record(row.id, row.connectionId, row.attempts, attempt, now);
    result.attempted += 1;
    if (attempt.ok) result.delivered += 1;
    else if ((isRetryable(attempt.status) || attempt.status === 0) && nextAttemptAt(row.attempts + 1, now))
      result.retrying += 1;
    else result.gaveUp += 1;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Health, for the connections screen
// ---------------------------------------------------------------------------

export interface ConnectionHealth {
  pending: number;
  delivered: number;
  failed: number;
  dropped: number;
}

export async function connectionHealth(connectionId: string): Promise<ConnectionHealth> {
  const rows = await prisma.eventDelivery.groupBy({
    by: ["status"],
    where: { connectionId },
    _count: { _all: true },
  });
  const at = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;
  return {
    pending: at("PENDING"),
    delivered: at("DELIVERED"),
    failed: at("FAILED"),
    dropped: at("DROPPED"),
  };
}

/**
 * A synthetic event for the Send test button.
 *
 * Marked plainly as a test in the body. A receiver that files this alongside
 * real work should be able to tell, and a bookkeeper who finds "Test Caller"
 * in their system should be able to see why it is there.
 */
export function testEvent(clientId: string, businessName?: string): BusinessEvent {
  return buildEvent({
    type: "call.completed",
    clientId,
    key: `test:${Math.floor(Date.now() / 1000)}`,
    businessName,
    data: {
      test: true,
      note: "A test event sent from the connections screen. Nothing real happened.",
      callId: "test",
      direction: "INBOUND",
      outcome: "BOOKED",
      durationSec: 132,
      customer: { name: "Test Caller", phone: "+16025550134" },
      capturedAnswers: { job: "Two-storey house, exterior wash" },
    },
  });
}
