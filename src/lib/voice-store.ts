/**
 * The Voice Employee's database layer.
 *
 * Everything that reads or writes lives here; everything that *decides* lives
 * in `voice.ts`, `estimates.ts` and `training.ts`. Same split as the gate, and
 * it exists so the rules can be tested without a Postgres and so a schema
 * change cannot quietly alter what the operator is allowed to do.
 *
 * Two invariants this file is responsible for:
 *
 *   1. A playbook is never updated in place. `savePlaybook` writes the next
 *      version and moves `active`, because the Lab's read-out is worthless
 *      against a row that gets overwritten.
 *   2. A transcript is redacted on the way *in*. Nothing card-shaped is ever
 *      handed to `prisma`.
 */

import { prisma } from "@/lib/prisma";
import {
  defaultPlaybook,
  playbookSchema,
  redactTurns,
  type CallDirection,
  type CallOutcome,
  type CallPurpose,
  type Playbook,
  type Turn,
} from "@/lib/voice";
import { emptyPriceBook, priceBookSchema, type Estimate, type PriceBook } from "@/lib/estimates";
import { MAX_OUTBOUND_ATTEMPTS, type OutboundRequest } from "@/lib/voice";
import { propose, registerExecutor } from "@/lib/gate";

// ---------------------------------------------------------------------------
// Playbooks and price books
// ---------------------------------------------------------------------------

export interface Versioned<T> {
  version: number;
  value: T;
  /** False when nothing has been saved yet and this is the built-in default. */
  saved: boolean;
  note?: string | null;
  createdAt?: Date;
}

/**
 * The playbook in force for a client.
 *
 * Falls back to a generated default rather than throwing, because the first
 * call can arrive before anybody has opened the editor — and an operator that
 * refuses to answer the phone until a form is filled in is worse than one
 * running sensible defaults it is about to be taught out of.
 */
export async function activePlaybook(clientId: string): Promise<Versioned<Playbook>> {
  const [row, client] = await Promise.all([
    prisma.voicePlaybook.findFirst({
      where: { clientId, active: true },
      orderBy: { version: "desc" },
    }),
    prisma.clientProfile.findUnique({
      where: { id: clientId },
      select: { businessName: true, serviceArea: true, voiceTone: true, offerSummary: true },
    }),
  ]);

  if (row) {
    const parsed = playbookSchema.safeParse(row.payload);
    if (parsed.success) {
      return { version: row.version, value: parsed.data, saved: true, note: row.note, createdAt: row.createdAt };
    }
    // A stored playbook that no longer parses is a real possibility once the
    // schema grows. Rebuilding the default is the only safe answer: the
    // alternative is answering a call with half a rulebook.
  }

  return {
    version: 0,
    saved: false,
    value: defaultPlaybook({
      businessName: client?.businessName ?? "the business",
      serviceArea: client?.serviceArea ? [client.serviceArea] : [],
      tone: client?.voiceTone ?? "",
      services: client?.offerSummary ? [client.offerSummary] : [],
    }),
  };
}

export async function savePlaybook(
  clientId: string,
  playbook: Playbook,
  by: { name: string; note?: string },
): Promise<{ version: number }> {
  const value = playbookSchema.parse(playbook);
  const latest = await prisma.voicePlaybook.findFirst({
    where: { clientId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (latest?.version ?? 0) + 1;

  await prisma.$transaction([
    prisma.voicePlaybook.updateMany({ where: { clientId, active: true }, data: { active: false } }),
    prisma.voicePlaybook.create({
      data: {
        clientId,
        version,
        active: true,
        payload: value as never,
        note: by.note ?? null,
        createdBy: by.name,
      },
    }),
  ]);

  return { version };
}

export async function activePriceBook(clientId: string): Promise<Versioned<PriceBook>> {
  const row = await prisma.voicePriceBook.findFirst({
    where: { clientId, active: true },
    orderBy: { version: "desc" },
  });
  if (row) {
    const parsed = priceBookSchema.safeParse(row.payload);
    if (parsed.success) {
      return { version: row.version, value: parsed.data, saved: true, note: row.note, createdAt: row.createdAt };
    }
  }
  return { version: 0, saved: false, value: emptyPriceBook() };
}

export async function savePriceBook(
  clientId: string,
  book: PriceBook,
  by: { name: string; note?: string },
): Promise<{ version: number }> {
  const value = priceBookSchema.parse(book);
  const latest = await prisma.voicePriceBook.findFirst({
    where: { clientId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (latest?.version ?? 0) + 1;

  await prisma.$transaction([
    prisma.voicePriceBook.updateMany({ where: { clientId, active: true }, data: { active: false } }),
    prisma.voicePriceBook.create({
      data: {
        clientId,
        version,
        active: true,
        payload: value as never,
        note: by.note ?? null,
        createdBy: by.name,
      },
    }),
  ]);

  return { version };
}

// ---------------------------------------------------------------------------
// Do-not-call
// ---------------------------------------------------------------------------

/**
 * Numbers are compared on their digits only.
 *
 * "(602) 555-0134" and "+16025550134" are the same person, and a suppression
 * list that misses one of those spellings is not a suppression list. The last
 * ten digits are the comparison key, so a country code on one record and not
 * the other still matches.
 */
export function phoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export async function addDoNotCall(
  clientId: string,
  phone: string,
  meta: { source?: string; reason?: string; callId?: string } = {},
): Promise<void> {
  const key = phoneKey(phone);
  if (!key) return;
  await prisma.doNotCallEntry.upsert({
    where: { clientId_phone: { clientId, phone: key } },
    create: { clientId, phone: key, ...meta },
    update: { reason: meta.reason ?? undefined },
  });
}

export async function isDoNotCall(clientId: string, phone: string): Promise<boolean> {
  const key = phoneKey(phone);
  if (!key) return false;
  const row = await prisma.doNotCallEntry.findUnique({
    where: { clientId_phone: { clientId, phone: key } },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Attempts already made against a number, and the last one.
 *
 * Counted from the call table rather than a counter column, so it cannot drift.
 * A campaign that re-runs and re-reads this gets the truth.
 */
export async function outboundHistory(
  clientId: string,
  phone: string,
): Promise<{ attempts: number; lastAttemptAt?: Date }> {
  const key = phoneKey(phone);
  if (!key) return { attempts: 0 };

  const rows = await prisma.voiceCall.findMany({
    where: { clientId, direction: "OUTBOUND" },
    orderBy: { startedAt: "desc" },
    select: { toNumber: true, startedAt: true },
    take: 500,
  });
  const mine = rows.filter((r) => r.toNumber && phoneKey(r.toNumber) === key);
  return { attempts: mine.length, lastAttemptAt: mine[0]?.startedAt };
}

/** Everything `canCallNow` needs, assembled from the database. */
export async function outboundRequestFor(
  clientId: string,
  input: {
    purpose: CallPurpose;
    phone: string;
    utcOffsetMinutes: number;
    consent: boolean;
    inboundAt?: Date;
  },
): Promise<OutboundRequest> {
  const [dnc, history] = await Promise.all([
    isDoNotCall(clientId, input.phone),
    outboundHistory(clientId, input.phone),
  ]);
  return {
    purpose: input.purpose,
    phone: input.phone,
    utcOffsetMinutes: input.utcOffsetMinutes,
    consent: input.consent,
    doNotCall: dnc,
    attempts: history.attempts,
    lastAttemptAt: history.lastAttemptAt,
    inboundAt: input.inboundAt,
  };
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

export async function startCall(input: {
  clientId: string;
  direction: CallDirection;
  purpose: CallPurpose;
  fromNumber?: string;
  toNumber?: string;
  provider?: string;
  providerCallId?: string;
  playbookVersion?: number;
  priceBookVersion?: number;
}) {
  // A provider retrying a webhook must not fork one call into two records.
  if (input.providerCallId) {
    const existing = await prisma.voiceCall.findUnique({
      where: { providerCallId: input.providerCallId },
    });
    if (existing) return existing;
  }

  return prisma.voiceCall.create({
    data: {
      clientId: input.clientId,
      direction: input.direction,
      purpose: input.purpose,
      fromNumber: input.fromNumber ?? null,
      toNumber: input.toNumber ?? null,
      provider: input.provider ?? null,
      providerCallId: input.providerCallId ?? null,
      playbookVersion: input.playbookVersion ?? null,
      priceBookVersion: input.priceBookVersion ?? null,
      turns: [] as never,
      captured: {} as never,
    },
  });
}

/** Persist the state of a call in progress. Turns are redacted here, always. */
export async function saveCallProgress(
  callId: string,
  state: { turns: Turn[]; captured: Record<string, string>; quotedTotalCents?: number },
) {
  return prisma.voiceCall.update({
    where: { id: callId },
    data: {
      turns: redactTurns(state.turns) as never,
      captured: state.captured as never,
      quotedTotalCents: state.quotedTotalCents ?? undefined,
    },
  });
}

export async function endCall(
  callId: string,
  final: {
    outcome: CallOutcome;
    turns: Turn[];
    captured: Record<string, string>;
    handoffReason?: string;
    unpricedItems?: string[];
    unansweredQuestions?: string[];
    recordingUrl?: string;
    endedAt?: Date;
  },
) {
  const call = await prisma.voiceCall.findUnique({
    where: { id: callId },
    select: { startedAt: true, clientId: true, fromNumber: true, toNumber: true },
  });
  const endedAt = final.endedAt ?? new Date();

  // An opt-out heard on a call suppresses the number without asking anybody.
  // It is the one write in this file that does not wait for a human, because
  // the human-in-the-loop version of "stop calling me" is a compliance
  // incident with a queue in front of it.
  if (final.outcome === "OPTED_OUT" && call) {
    const number = call.fromNumber || call.toNumber;
    if (number) {
      await addDoNotCall(call.clientId, number, {
        source: "call",
        reason: "Asked not to be contacted, on the call",
        callId,
      });
    }
  }

  const updated = await prisma.voiceCall.update({
    where: { id: callId },
    data: {
      outcome: final.outcome,
      turns: redactTurns(final.turns) as never,
      captured: final.captured as never,
      handoffReason: final.handoffReason ?? null,
      unpricedItems: final.unpricedItems ?? [],
      unansweredQuestions: final.unansweredQuestions ?? [],
      recordingUrl: final.recordingUrl ?? null,
      endedAt,
      durationSec: call
        ? Math.max(0, Math.round((endedAt.getTime() - call.startedAt.getTime()) / 1000))
        : null,
    },
  });

  // Out to whatever the client has connected. The transcript is not in here on
  // purpose — the event stream ends up in somebody else's database where we
  // cannot delete it, and a recording of a customer's kitchen is not something
  // to scatter. What the call *captured* goes; what was said does not.
  if (call) {
    const { emit } = await import("@/lib/event-bus");
    const customer = {
      name: final.captured.name ?? null,
      phone: call.fromNumber ?? call.toNumber ?? null,
      address: final.captured.address ?? null,
    };
    await emit({
      clientId: call.clientId,
      type: "call.completed",
      key: callId,
      at: endedAt,
      data: {
        callId,
        direction: updated.direction,
        outcome: final.outcome,
        durationSec: updated.durationSec,
        customer,
        capturedAnswers: final.captured,
        unpricedItems: final.unpricedItems ?? [],
        unansweredQuestions: final.unansweredQuestions ?? [],
      },
    });

    // A second, narrower event for the one outcome that needs a person. A
    // client routing everything into a Slack channel wants the whole stream;
    // one routing a pager wants this and nothing else.
    if (final.outcome === "HANDED_OFF" || final.outcome === "MESSAGE_TAKEN") {
      await emit({
        clientId: call.clientId,
        type: "call.handoff",
        key: callId,
        at: endedAt,
        data: {
          callId,
          reason: final.handoffReason ?? "The operator handed this to a person.",
          outcome: final.outcome,
          customer,
          capturedAnswers: final.captured,
        },
      });
    }

    if (final.outcome === "OPTED_OUT" && customer.phone) {
      await emit({
        clientId: call.clientId,
        type: "contact.opted_out",
        key: `${callId}:optout`,
        at: endedAt,
        data: {
          phone: customer.phone,
          reason: "Asked not to be contacted, on the call",
          source: "call",
        },
      });
    }
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Estimates, and the two things that need releasing
// ---------------------------------------------------------------------------

export async function recordEstimate(input: {
  clientId: string;
  callId?: string;
  estimate: Estimate;
  payload: Record<string, unknown>;
  customer: { name?: string; phone?: string; address?: string; description?: string };
}) {
  const row = await prisma.voiceEstimate.create({
    data: {
      clientId: input.clientId,
      callId: input.callId ?? null,
      customerName: input.customer.name ?? null,
      customerPhone: input.customer.phone ?? null,
      customerAddress: input.customer.address ?? null,
      jobDescription: input.customer.description ?? null,
      payload: input.payload as never,
      totalCents: input.estimate.totalCents,
      lowCents: input.estimate.lowCents,
      highCents: input.estimate.highCents,
      confidence: input.estimate.confidence,
      spoken: input.estimate.spoken,
      status: "DRAFT",
    },
  });

  // `estimate.created` is the softer of the two. It says a price was spoken —
  // useful to a CRM tracking pipeline, and explicitly refused by the QuickBooks
  // adapter, because a spoken price is not an accounting record.
  const { emit } = await import("@/lib/event-bus");
  await emit({
    clientId: input.clientId,
    type: "estimate.created",
    key: row.id,
    data: {
      estimateId: row.id,
      callId: input.callId ?? null,
      customer: {
        name: input.customer.name ?? null,
        phone: input.customer.phone ?? null,
        address: input.customer.address ?? null,
      },
      job: input.customer.description ?? null,
      totalCents: row.totalCents,
      lowCents: row.lowCents,
      highCents: row.highCents,
      confidence: row.confidence,
      lines: input.estimate.lines,
      quotedOnCall: input.estimate.spoken,
    },
  });

  return row;
}

/**
 * Put a written estimate in front of a person.
 *
 * Nothing here sends anything. `estimate.send` is a money-moving kind, so the
 * gate holds it manually and the queue is where it goes out from.
 */
export async function proposeEstimateSend(estimateId: string) {
  const est = await prisma.voiceEstimate.findUnique({ where: { id: estimateId } });
  if (!est) throw new Error("No such estimate");

  const action = await propose({
    clientId: est.clientId,
    kind: "estimate.send",
    summary: `Send a written estimate for ${formatCents(est.totalCents)}`,
    subject: est.customerName ?? est.customerPhone ?? "a caller",
    // The id travels with the payload because the executor is handed nothing
    // else. Without it the estimate row reads QUEUED forever, even after the
    // gate has sent it — a status that lies about a document the customer has.
    payload: { ...(est.payload as Record<string, unknown>), estimateId: est.id },
    dedupeKey: `estimate.send:${est.id}`,
  });

  await prisma.voiceEstimate.update({
    where: { id: est.id },
    data: { status: "QUEUED", pendingActionId: action.id },
  });

  return action;
}

/**
 * Queue an outbound call.
 *
 * Two gates in series, and they answer different questions. `canCallNow` asks
 * whether this number may legally and decently be rung at all; the gate asks
 * whether this particular call is one the owner wants made. A number failing
 * the first never reaches the second — a suppressed contact should not appear
 * in a queue as something releasable.
 */
export async function proposeOutboundCall(input: {
  clientId: string;
  purpose: CallPurpose;
  phone: string;
  reason: string;
  subject?: string;
  utcOffsetMinutes: number;
  consent: boolean;
  inboundAt?: Date;
  /** Anything the operator should know before it dials. */
  context?: Record<string, unknown>;
  now?: Date;
}) {
  const { canCallNow } = await import("@/lib/voice");
  const req = await outboundRequestFor(input.clientId, input);
  const permission = canCallNow(req, input.now);
  if (!permission.ok) {
    return { queued: false as const, why: permission.why, code: permission.code };
  }

  const kind = input.purpose === "callback" ? "call.callback" : "call.outbound";
  const action = await propose({
    clientId: input.clientId,
    kind,
    summary: input.reason,
    subject: input.subject ?? input.phone,
    payload: {
      phone: input.phone,
      purpose: input.purpose,
      attemptsAlready: req.attempts,
      attemptLimit: MAX_OUTBOUND_ATTEMPTS,
      consentOnRecord: input.consent,
      ...input.context,
    },
    // A callback carries the caller's own initiation, so the short window is
    // the point. Everything else keeps its default.
    dedupeKey: `${kind}:${phoneKey(input.phone)}:${(input.now ?? new Date()).toISOString().slice(0, 13)}`,
    now: input.now,
  });

  return { queued: true as const, action, why: permission.why };
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

// ---------------------------------------------------------------------------
// Executors — what actually happens when one of these is released
// ---------------------------------------------------------------------------

/**
 * Registered so a released action stops recording FAILED with "no executor is
 * wired". Each one performs the part this repo owns and reports honestly on
 * the part it does not.
 *
 * There is no telephony provider and no outbound mail transport behind these
 * yet. That is stated in the returned result rather than hidden, because the
 * gate writes the result onto the row and the queue shows it: an owner
 * releasing a call should read "handed to the dialler" or "no dialler
 * connected", never a silent success.
 */
let registered = false;

export function registerVoiceExecutors(): void {
  if (registered) return;
  registered = true;

  registerExecutor("estimate.send", async (payload) => {
    const { notifyAgency } = await import("@/lib/notify");
    const p = payload as Record<string, unknown>;
    const customer = (p.customer ?? {}) as Record<string, unknown>;
    await notifyAgency("ESTIMATE_RELEASED", {
      businessName: String(customer.name ?? customer.phone ?? "a caller"),
      title: String(p.total ?? "an estimate"),
      detail: String(p.job ?? ""),
      lines: [
        `Range: ${String(p.range ?? "—")}`,
        `Confidence: ${String(p.confidence ?? "—")} — ${String(p.confidenceWhy ?? "")}`,
        `Said on the call: ${String(p.quotedOnCall ?? "—")}`,
      ],
      path: "/app/gate?filter=done",
    });
    if (typeof p.estimateId === "string") {
      const est = await prisma.voiceEstimate.update({
        where: { id: p.estimateId },
        data: { status: "SENT" },
      });

      // The event that means money, and the only one QuickBooks will take. It
      // is emitted from inside the executor rather than from the button that
      // proposed it, so it cannot fire for an estimate a person never released.
      // Who released it is on the gate row, not in the payload — an executor is
      // handed the proposal, not the decision. Worth the extra read: "released
      // by" is the field a client's own records need to carry.
      const action = est.pendingActionId
        ? await prisma.pendingAction.findUnique({
            where: { id: est.pendingActionId },
            select: { releasedBy: true, autoReleased: true },
          })
        : null;

      const { emit } = await import("@/lib/event-bus");
      await emit({
        clientId: est.clientId,
        type: "estimate.sent",
        key: est.id,
        data: {
          estimateId: est.id,
          callId: est.callId,
          customer: {
            name: est.customerName,
            phone: est.customerPhone,
            address: est.customerAddress,
          },
          job: est.jobDescription,
          totalCents: est.totalCents,
          lowCents: est.lowCents,
          highCents: est.highCents,
          confidence: est.confidence,
          lines: (est.payload as Record<string, unknown>)?.lines ?? [],
          quotedOnCall: est.spoken,
          releasedBy: action?.releasedBy ?? (action?.autoReleased ? "released on the timer" : null),
        },
      });
    }

    return {
      delivered: "agency inbox",
      note: "The estimate was mailed to the desk that sends it. No customer-facing mail transport is wired to this kind yet, so nothing went to the customer directly.",
    };
  });

  const dial = async (payload: unknown) => {
    const p = payload as Record<string, unknown>;
    return {
      dialled: false,
      phone: String(p.phone ?? ""),
      note: "No telephony provider is connected, so this call was not placed. Wire a provider to /api/voice/turn and this becomes a real dial.",
    };
  };

  registerExecutor("call.callback", dial);
  registerExecutor("call.outbound", dial);
}
