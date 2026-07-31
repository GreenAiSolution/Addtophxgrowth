/**
 * THE ESTIMATOR, wired up.
 *
 * `estimating.ts` decides what things cost. This file stores it, holds it at
 * the gate, and sends it once a human has said yes. Same split as
 * `switchboard.ts` over `telephony.ts` — nothing here makes a pricing decision
 * the pure layer has not already made.
 *
 * THE ORDER OF THE TWO CHECKS
 *   `canSend` runs before `propose`, never instead of it. They answer different
 *   questions and only one of them catches a nonsense quote:
 *
 *     canSend — is this a real number at all?
 *     the gate — has a named human agreed to send it?
 *
 *   A quote with a missing rate can be released by exactly the right person and
 *   still be wrong, which is why the arithmetic check comes first and refuses
 *   before anything reaches the queue.
 */

import { prisma } from "@/lib/prisma";
import { propose, registerExecutor } from "@/lib/gate";
import { notifyAgency } from "@/lib/notify";
import { sendSms } from "@/lib/switchboard";
import { formatNumber } from "@/lib/telephony";
import { formatCurrency } from "@/lib/utils";
import {
  DEFAULT_VALID_DAYS,
  canSend,
  estimateReference,
  expiryFor,
  priceEstimate,
  type LineRequest,
  type PricedEstimate,
  type Rate,
} from "@/lib/estimating";
import type { RateUnit } from "@prisma/client";

/** The client's live rate card, in the shape the pricer wants. */
export async function rateCardFor(clientId: string): Promise<Rate[]> {
  const items = await prisma.rateCardItem.findMany({
    where: { clientId, active: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  return items.map((i) => ({
    code: i.code,
    label: i.label,
    unit: i.unit as Rate["unit"],
    unitPriceCents: i.unitPriceCents,
    minimumCents: i.minimumCents,
    taxable: i.taxable,
  }));
}

export interface DraftInput {
  clientId: string;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  jobSummary: string;
  lines: LineRequest[];
  discountCents?: number;
  leadId?: string | null;
  callId?: string | null;
  notes?: string | null;
  now?: Date;
}

/**
 * Price a job and file it as a draft.
 *
 * Deliberately stores an incomplete estimate rather than refusing to save one.
 * A client who typed twelve lines and got one code wrong needs the other eleven
 * kept and the bad one named — losing the lot to a validation error is how
 * somebody goes back to writing quotes in the van. `canSend` is what stops it
 * reaching a customer, and that check happens at send time.
 */
export async function draftEstimate(input: DraftInput) {
  const now = input.now ?? new Date();

  const [rates, client] = await Promise.all([
    rateCardFor(input.clientId),
    prisma.clientProfile.findUnique({
      where: { id: input.clientId },
      select: { taxRatePercent: true, estimateValidDays: true },
    }),
  ]);

  const priced = priceEstimate({
    lines: input.lines,
    rates,
    discountCents: input.discountCents,
    taxRatePercent: client?.taxRatePercent ?? 0,
  });

  const reference = await nextReference(input.clientId);

  const estimate = await prisma.estimate.create({
    data: {
      clientId: input.clientId,
      reference,
      leadId: input.leadId ?? null,
      callId: input.callId ?? null,
      customerName: input.customerName,
      customerPhone: input.customerPhone ?? null,
      customerEmail: input.customerEmail ?? null,
      jobSummary: input.jobSummary,
      lines: priced.lines as never,
      subtotalCents: priced.subtotalCents,
      discountCents: priced.discountCents,
      taxableBaseCents: priced.taxableBaseCents,
      taxCents: priced.taxCents,
      totalCents: priced.totalCents,
      taxRatePercent: client?.taxRatePercent ?? null,
      expiresAt: expiryFor(now, client?.estimateValidDays ?? DEFAULT_VALID_DAYS),
      notes: input.notes ?? null,
    },
  });

  return { estimate, priced };
}

/**
 * The next reference for this client.
 *
 * Counts existing rows and retries on the unique constraint. Two estimates
 * raised in the same second would otherwise collide — rare, and "rare" is not
 * a plan when the collision loses somebody's quote.
 */
async function nextReference(clientId: string, attempt = 0): Promise<string> {
  const count = await prisma.estimate.count({ where: { clientId } });
  const candidate = estimateReference(count + 1 + attempt);
  const clash = await prisma.estimate.findUnique({
    where: { clientId_reference: { clientId, reference: candidate } },
    select: { id: true },
  });
  if (!clash) return candidate;
  if (attempt > 50) return `${candidate}-${Date.now().toString(36).slice(-4)}`;
  return nextReference(clientId, attempt + 1);
}

/** Re-price a stored estimate's lines against today's card. Never persisted. */
export function repriceStored(lines: unknown, taxRatePercent: number | null): PricedEstimate {
  const stored = Array.isArray(lines) ? lines : [];
  const rates: Rate[] = stored.map((l) => {
    const line = l as {
      code: string;
      label: string;
      unit: RateUnit;
      unitPriceCents: number;
      taxable?: boolean;
    };
    return {
      code: line.code,
      label: line.label,
      unit: line.unit as Rate["unit"],
      unitPriceCents: line.unitPriceCents,
      taxable: line.taxable ?? true,
    };
  });
  const requests: LineRequest[] = stored.map((l) => {
    const line = l as { code: string; quantity: number; note?: string };
    return { code: line.code, quantity: line.quantity, note: line.note };
  });
  return priceEstimate({ lines: requests, rates, taxRatePercent: taxRatePercent ?? 0 });
}

export type QueueVerdict =
  | { queued: true; actionId: string }
  | { queued: false; why: string };

/**
 * Put a finished estimate in the queue to be sent.
 *
 * The arithmetic check first, then the gate. `quote.send` is MANUAL and moves
 * money — `gate.ts` refuses at import to let it be anything else — so nothing
 * here can put a price in front of a customer on a timer.
 */
export async function queueEstimate(estimateId: string): Promise<QueueVerdict> {
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: { client: { select: { businessName: true } } },
  });
  if (!estimate) return { queued: false, why: "no such estimate" };
  if (estimate.status !== "DRAFT") {
    return { queued: false, why: `this estimate is already ${estimate.status.toLowerCase()}` };
  }

  const priced = repriceStored(estimate.lines, estimate.taxRatePercent);
  const verdict = canSend(priced);
  if (!verdict.ok) return { queued: false, why: verdict.why };

  const action = await propose({
    clientId: estimate.clientId,
    kind: "quote.send",
    summary: `Send ${estimate.reference} to ${estimate.customerName} — ${formatCurrency(estimate.totalCents)}`,
    subject: estimate.customerName,
    payload: {
      estimateId: estimate.id,
      reference: estimate.reference,
      totalCents: estimate.totalCents,
      to: estimate.customerPhone ?? estimate.customerEmail ?? null,
    },
    dedupeKey: `quote.send:${estimate.id}`,
  });

  await prisma.estimate.update({
    where: { id: estimate.id },
    data: { status: "HELD", pendingActionId: action.id },
  });

  return { queued: true, actionId: action.id };
}

/**
 * What happens when a quote is released.
 *
 * Registered here rather than in the gate — the gate must not know what an
 * estimate is. Throwing marks the action FAILED with the reason, which is the
 * designed behaviour: an estimate nobody could send must never be recorded as
 * one that was sent.
 */
registerExecutor("quote.send", async (payload) => {
  const p = payload as { estimateId?: string };
  if (!p.estimateId) throw new Error("Released quote carries no estimate.");

  const estimate = await prisma.estimate.findUnique({
    where: { id: p.estimateId },
    include: { client: { select: { businessName: true } } },
  });
  if (!estimate) throw new Error("The estimate this quote refers to no longer exists.");

  // Re-check on the way out. The estimate may have been edited between being
  // queued and being released, and the release was agreed against the number a
  // human read at the time.
  const priced = repriceStored(estimate.lines, estimate.taxRatePercent);
  const verdict = canSend(priced);
  if (!verdict.ok) throw new Error(verdict.why);

  const total = formatCurrency(estimate.totalCents);
  const body = `${estimate.client.businessName}: your estimate ${estimate.reference} for ${estimate.jobSummary} comes to ${total}. Reply YES to accept and we'll book you in.`;

  let delivered = false;
  let detail = "no contact details on the estimate";

  if (estimate.customerPhone) {
    const sms = await sendSms(estimate.customerPhone, body);
    delivered = sms.delivered;
    detail = sms.detail;
  }

  if (!delivered && estimate.customerEmail) {
    // notifyAgency is fire-and-forget by construction and never throws, so a
    // mail failure cannot mark a sent quote as failed. The status below is
    // what records whether anything actually left the building.
    notifyAgency("REQUEST_FILED", {
      businessName: estimate.client.businessName,
      title: `Estimate ${estimate.reference} — ${total}`,
      detail: estimate.jobSummary,
      path: "/app/estimates",
      lines: [`Customer: ${estimate.customerName}`, `Email: ${estimate.customerEmail}`],
    });
    delivered = true;
    detail = "sent to the agency inbox for email delivery";
  }

  if (!delivered) throw new Error(`Nothing was sent — ${detail}.`);

  await prisma.estimate.update({
    where: { id: estimate.id },
    data: { status: "SENT", sentAt: new Date() },
  });

  return { sent: true, reference: estimate.reference, detail };
});

/**
 * Record what the customer did.
 *
 * Accepting is the moment the booker's work starts, which is why this returns
 * the estimate rather than a boolean — the caller hands it straight on.
 */
export async function recordResponse(
  estimateId: string,
  response: "ACCEPTED" | "DECLINED" | "VIEWED",
  now = new Date(),
) {
  const stamp =
    response === "ACCEPTED"
      ? { acceptedAt: now }
      : response === "DECLINED"
        ? { declinedAt: now }
        : { viewedAt: now };

  return prisma.estimate.update({
    where: { id: estimateId },
    data: { status: response, ...stamp },
  });
}

/** A one-line description of where an estimate stands, for the list. */
export function describeStatus(status: string, sentAt: Date | null, now: Date): string {
  switch (status) {
    case "DRAFT":
      return "Not sent yet";
    case "HELD":
      return "Waiting for you to release it";
    case "SENT": {
      if (!sentAt) return "Sent";
      const hours = Math.round((now.getTime() - sentAt.getTime()) / 3_600_000);
      if (hours < 1) return "Sent just now";
      if (hours < 24) return `Sent ${hours}h ago, no reply yet`;
      return `Sent ${Math.round(hours / 24)}d ago, no reply yet`;
    }
    case "VIEWED":
      return "Read, no answer yet";
    case "ACCEPTED":
      return "Accepted";
    case "DECLINED":
      return "Declined";
    case "EXPIRED":
      return "The price lapsed";
    case "WITHDRAWN":
      return "Pulled before it went";
    default:
      return status;
  }
}

/** Who to chase, for the queue on the estimates page. */
export function contactLine(estimate: {
  customerPhone: string | null;
  customerEmail: string | null;
}): string {
  if (estimate.customerPhone) return formatNumber(estimate.customerPhone);
  return estimate.customerEmail ?? "no contact details";
}
