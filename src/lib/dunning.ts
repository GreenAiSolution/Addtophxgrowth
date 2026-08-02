/**
 * DUNNING — getting back the money that was already sold.
 *
 * DIRECTION
 *   The webhook handled `invoice.paid` and nothing else about payment. So the
 *   most expensive event in a subscription business — a card expiring — was
 *   completely silent. Stripe retries a few times, gives up, flips the
 *   subscription to `unpaid`, and the only trace here was a status column
 *   quietly changing from ACTIVE to PAST_DUE on a row nobody reads. The client
 *   never knew. The desk never knew. The system kept delivering the work.
 *
 *   That is not a rare edge: card failure is the single largest cause of
 *   churn in every subscription business, and almost all of it is involuntary.
 *   Nobody decided to leave. Their bank reissued a card.
 *
 *   This is the piece that makes "money every month" mean something, because
 *   it is the only part of the platform that defends revenue that has already
 *   been won. Winning a new client is expensive; keeping one whose card
 *   bounced costs an email.
 *
 * BLUEPRINTS
 *   `planDunning` is pure — an issue and a clock in, one decision out — so the
 *   entire ladder is tested without Stripe, a mail server or a database. Same
 *   split as night-shift.ts and spend-watch.ts, for the same reason.
 *
 *   No model call anywhere in this file. What the client is told about their
 *   own money is arithmetic and a fixed template, not generated prose. An
 *   Anthropic outage must not change whether somebody is told their payment
 *   failed, or what it says.
 *
 * THE TONE DECISION, WHICH IS LOAD-BEARING
 *   Stripe retries the card by itself for about two weeks. So the first notice
 *   goes out immediately but must NOT read as an emergency — it says we could
 *   not take payment, that we will try again automatically on a named date,
 *   and that they can update the card now if they would rather be sure. An
 *   alarming first email about a problem that usually fixes itself trains
 *   people to ignore the third one, which is the one that matters.
 *
 *   Recovery is deliberately silent to the client. "Your payment went through
 *   after all" is a second email about a problem they no longer have.
 */

import { prisma } from "@/lib/prisma";
import { sendNotification, agencyAddress, type NotificationKind } from "@/lib/notify";
import { formatCurrency } from "@/lib/utils";

export type DunningStep = "FIRST" | "REMINDER" | "FINAL";

/** Hours after the first failure that each rung of the ladder becomes due. */
export const LADDER: { step: DunningStep; afterHours: number; kind: NotificationKind }[] = [
  { step: "FIRST", afterHours: 0, kind: "PAYMENT_FAILED_FIRST" },
  { step: "REMINDER", afterHours: 72, kind: "PAYMENT_FAILED_REMINDER" },
  { step: "FINAL", afterHours: 168, kind: "PAYMENT_FAILED_FINAL" },
];

/**
 * No two notices closer together than this, whatever the ladder says.
 *
 * Guards the case that actually happens: an issue opened late, or a backfill,
 * where two rungs come due on the same sweep. Three emails in an hour about a
 * declined card reads as a broken system, which is the opposite of the
 * impression you want while asking somebody for their card details.
 */
export const MIN_NOTICE_GAP_HOURS = 48;

/**
 * When the ladder has been climbed and the money still has not arrived, a
 * person gets involved. Ten days is inside Stripe's own retry window, so the
 * call is made while the subscription is still live and the relationship is
 * still recoverable by a phone call.
 */
export const ESCALATE_AFTER_HOURS = 240;

export interface DunningIssue {
  state: "OPEN" | "RECOVERED" | "LOST";
  firstFailedAt: Date;
  noticesSent: number;
  lastNoticeAt: Date | null;
  lastNoticeStep: string | null;
  escalatedAt: Date | null;
}

export type DunningVerdict =
  | { do: "notify"; step: DunningStep; kind: NotificationKind; why: string }
  | { do: "escalate"; why: string }
  | { do: "wait"; why: string }
  | { do: "close"; why: string };

function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 3_600_000;
}

/** Where on the ladder a step key sits. -1 for "nothing sent yet". */
function stepIndex(step: string | null): number {
  if (!step) return -1;
  return LADDER.findIndex((l) => l.step === step);
}

/**
 * Pure: decide what this failing invoice needs right now.
 *
 * Ordering matters. A closed issue is checked first, because a recovered
 * payment must never produce a chase however overdue the ladder thinks it is —
 * that is the mistake that costs an account outright.
 */
export function planDunning(issue: DunningIssue, now: Date): DunningVerdict {
  if (issue.state !== "OPEN") {
    return { do: "close", why: `Issue is ${issue.state.toLowerCase()}; nothing to send.` };
  }

  const age = hoursBetween(issue.firstFailedAt, now);
  const sentIndex = stepIndex(issue.lastNoticeStep);

  // The whole ladder has been sent and the money still is not here.
  if (sentIndex >= LADDER.length - 1 && age >= ESCALATE_AFTER_HOURS) {
    if (issue.escalatedAt) {
      return { do: "wait", why: "Already escalated; a person owns this now." };
    }
    return {
      do: "escalate",
      why: `Unpaid for ${Math.floor(age / 24)} days after the full notice ladder.`,
    };
  }

  // The next rung is the first one that is both due and not yet sent.
  const next = LADDER.find((l, i) => i > sentIndex && age >= l.afterHours);
  if (!next) {
    const pending = LADDER[sentIndex + 1];
    return {
      do: "wait",
      why: pending
        ? `Next notice (${pending.step}) is due ${pending.afterHours}h after the failure.`
        : "Ladder complete; waiting for the escalation window.",
    };
  }

  if (issue.lastNoticeAt) {
    const since = hoursBetween(issue.lastNoticeAt, now);
    if (since < MIN_NOTICE_GAP_HOURS) {
      return {
        do: "wait",
        why: `Last notice was ${Math.floor(since)}h ago; minimum gap is ${MIN_NOTICE_GAP_HOURS}h.`,
      };
    }
  }

  return {
    do: "notify",
    step: next.step,
    kind: next.kind,
    why: `${next.step} notice, ${Math.floor(age)}h after the first failure.`,
  };
}

// ---------------------------------------------------------------------------
// The database half. Nothing below decides anything the pure layer has not.
// ---------------------------------------------------------------------------

export interface FailedInvoice {
  clientId: string;
  lineKey: "AI_AGENTS" | "AD_OPS";
  stripeInvoiceId: string;
  stripeSubscriptionId?: string | null;
  amountCents: number;
  currency?: string;
  attemptCount?: number;
  nextAttemptAt?: Date | null;
  hostedInvoiceUrl?: string | null;
  failedAt?: Date;
}

/**
 * Record a failed invoice, or update the one already open for it.
 *
 * Keyed on the Stripe invoice id, so Stripe's own retries — which fire this
 * same webhook again — advance the attempt counter instead of opening a second
 * issue and starting a second ladder against the same money.
 */
export async function openPaymentIssue(input: FailedInvoice) {
  const at = input.failedAt ?? new Date();

  return prisma.paymentIssue.upsert({
    where: { stripeInvoiceId: input.stripeInvoiceId },
    update: {
      // Deliberately does not reset `state`. A recovered issue that somehow
      // sees another failure event for the same invoice stays recovered; a new
      // failure produces a new invoice id and therefore a new row.
      attemptCount: input.attemptCount ?? undefined,
      lastFailedAt: at,
      nextAttemptAt: input.nextAttemptAt ?? null,
      amountCents: input.amountCents,
      hostedInvoiceUrl: input.hostedInvoiceUrl ?? undefined,
    },
    create: {
      clientId: input.clientId,
      lineKey: input.lineKey,
      stripeInvoiceId: input.stripeInvoiceId,
      stripeSubscriptionId: input.stripeSubscriptionId ?? null,
      amountCents: input.amountCents,
      currency: input.currency ?? "usd",
      attemptCount: input.attemptCount ?? 1,
      firstFailedAt: at,
      lastFailedAt: at,
      nextAttemptAt: input.nextAttemptAt ?? null,
      hostedInvoiceUrl: input.hostedInvoiceUrl ?? null,
    },
  });
}

/**
 * Close an issue: the money arrived, or the subscription went away.
 *
 * Idempotent and guarded on OPEN, so a duplicate `invoice.paid` cannot
 * overwrite a recovery timestamp, and a cancellation cannot mark an already
 * recovered invoice as lost.
 */
export async function closePaymentIssue(
  stripeInvoiceId: string,
  outcome: "RECOVERED" | "LOST",
  at = new Date(),
) {
  const result = await prisma.paymentIssue.updateMany({
    where: { stripeInvoiceId, state: "OPEN" },
    data:
      outcome === "RECOVERED"
        ? { state: "RECOVERED", recoveredAt: at }
        : { state: "LOST", lostAt: at },
  });
  return result.count;
}

/** Close every open issue on a subscription. Used when it cancels outright. */
export async function closeIssuesForSubscription(
  stripeSubscriptionId: string,
  outcome: "RECOVERED" | "LOST",
  at = new Date(),
) {
  const result = await prisma.paymentIssue.updateMany({
    where: { stripeSubscriptionId, state: "OPEN" },
    data:
      outcome === "RECOVERED"
        ? { state: "RECOVERED", recoveredAt: at }
        : { state: "LOST", lostAt: at },
  });
  return result.count;
}

export interface DunningRunResult {
  checked: number;
  notified: number;
  escalated: number;
  waiting: number;
}

/**
 * The unattended pass. Driven by the daily revenue cron.
 *
 * One tenant's failure never stops the rest of the run, for the same reason
 * the night-shift cron catches per client: the whole point of this loop is
 * that it happens without anybody watching it.
 */
export async function runDunning(now = new Date()): Promise<DunningRunResult> {
  const out: DunningRunResult = { checked: 0, notified: 0, escalated: 0, waiting: 0 };

  const issues = await prisma.paymentIssue.findMany({
    where: { state: "OPEN" },
    include: { client: { include: { user: true } } },
    orderBy: { firstFailedAt: "asc" },
    take: 500,
  });

  for (const issue of issues) {
    out.checked++;
    const verdict = planDunning(issue as DunningIssue, now);

    try {
      if (verdict.do === "notify") {
        const to = issue.client.user.email;
        if (!to) {
          out.waiting++;
          continue;
        }
        const amount = formatCurrency(issue.amountCents);
        const retry = issue.nextAttemptAt
          ? issue.nextAttemptAt.toISOString().slice(0, 10)
          : null;

        await sendNotification({
          kind: verdict.kind,
          to,
          payload: {
            businessName: issue.client.businessName,
            title: `${amount} could not be taken`,
            detail: issue.hostedInvoiceUrl ?? undefined,
            path: "/app/billing",
            lines: [
              `Amount: ${amount}`,
              `First declined: ${issue.firstFailedAt.toISOString().slice(0, 10)}`,
              retry ? `We try the card again automatically on ${retry}.` : "",
              issue.hostedInvoiceUrl ? `Pay or update the card: ${issue.hostedInvoiceUrl}` : "",
            ].filter(Boolean),
          },
        });

        await prisma.paymentIssue.update({
          where: { id: issue.id },
          data: {
            noticesSent: { increment: 1 },
            lastNoticeAt: now,
            lastNoticeStep: verdict.step,
          },
        });
        out.notified++;
        continue;
      }

      if (verdict.do === "escalate") {
        await sendNotification({
          kind: "PAYMENT_ESCALATED",
          to: agencyAddress(),
          payload: {
            businessName: issue.client.businessName,
            title: `${formatCurrency(issue.amountCents)} unrecovered — needs a call`,
            detail: verdict.why,
            path: `/admin/clients/${issue.clientId}`,
            lines: [
              `Line: ${issue.lineKey}`,
              `Notices sent: ${issue.noticesSent}`,
              `First declined: ${issue.firstFailedAt.toISOString().slice(0, 10)}`,
              issue.client.user.email ? `Client: ${issue.client.user.email}` : "",
            ].filter(Boolean),
          },
        });
        await prisma.paymentIssue.update({
          where: { id: issue.id },
          data: { escalatedAt: now },
        });
        out.escalated++;
        continue;
      }

      out.waiting++;
    } catch (err) {
      // A send that throws must not take the rest of the roster with it.
      console.error(`[dunning] issue ${issue.id} threw:`, err);
      out.waiting++;
    }
  }

  return out;
}
