/**
 * THE COMEBACK — the re-approach loop.
 *
 * DIRECTION
 *   The upgrade catalogue sells this in one line: "Echo asks them for a review.
 *   This one asks them back." Every trade has customers who paid once and were
 *   never contacted again, and a date already sitting in the records — a service
 *   interval, a season, a warranty window — that says when the next job is due.
 *   Nobody reads it. The Comeback does: it dates every past job, works out who
 *   is due, and re-approaches them, so the cheapest customer a business owns
 *   stops being the one it ignores.
 *
 *   The gate (lib/gate.ts) was built first, deliberately, before this loop
 *   existed — because the catalogue also promises that "nothing reaches a past
 *   customer without being visible to you first." This file never sends. It
 *   *proposes*, through the gate, and the queue holds each message for the
 *   client to read and pull before it goes. The executors at the bottom are
 *   what actually deliver, and only ever a released action reaches one.
 *
 * BLUEPRINTS
 *   Everything that decides *who is due and what they are told* is pure and
 *   tested: `intervalFor`, `classify`, `composeMessage`, `planComebacks`,
 *   `isDue`. Only `runComeback`, the executors and the roster touch the
 *   database, and none of them make a decision the pure layer has not already
 *   made — the same split night-shift.ts and gate.ts use.
 *
 *   There is no model call anywhere in this file. A message to somebody's past
 *   customer is a claim made in their business's name; it has to read the same
 *   whether or not the Anthropic API is up, so the copy is composed by a pure
 *   function the client can read in the queue before it sends. The narrative
 *   flourish can come later; the send cannot depend on it.
 */

import { prisma } from "@/lib/prisma";
import { resolveVertical } from "@/lib/verticals";
import { postWebhook } from "@/lib/webhooks";
import { registerExecutor, propose } from "@/lib/gate";
import { env } from "@/lib/env";

/** Fallback interval when neither the client nor their pack names one. */
export const DEFAULT_INTERVAL_DAYS = 365;
/** No trade is re-approached faster than monthly, whatever a bad override says. */
export const MIN_INTERVAL_DAYS = 30;
/** Start reminding this many days before the service is actually due. */
export const REMINDER_LEAD_DAYS = 30;
/** A reminder stays valid this long after the due date before we let it lapse. */
export const REMINDER_GRACE_DAYS = 45;
/**
 * Past this multiple of the interval with no return, a customer is dormant and
 * the softer "your service is due" reminder gives way to a win-back.
 */
export const REACTIVATE_AFTER_MULTIPLE = 1.5;
/** Never queue more than this in one pass — a burst of outreach reads as spam. */
export const MAX_PER_RUN = 50;
/** The hourly cron may only start a real pass once this many hours have passed. */
export const MIN_HOURS_BETWEEN_RUNS = 20;

const DAY_MS = 86_400_000;

export type ComebackKind = "reminder" | "reactivate";

/** One contactable past customer, reduced to what the decision needs. */
export interface PastCustomer {
  leadId: string;
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  /** The most recent job this customer bought. */
  lastJobAt: Date;
  valueCents: number;
}

/**
 * The effective re-approach interval for a client: their explicit override, or
 * their vertical pack's default, or a year. Floored at MIN_INTERVAL_DAYS so a
 * fat-fingered override can never turn this into a weekly nag.
 */
export function intervalFor(
  client: { comebackIntervalDays?: number | null; industry?: string | null; verticalKey?: string | null },
): number {
  const pack = resolveVertical(client);
  const chosen = client.comebackIntervalDays ?? pack?.serviceIntervalDays ?? DEFAULT_INTERVAL_DAYS;
  return Math.max(MIN_INTERVAL_DAYS, Math.round(chosen));
}

/**
 * What, if anything, to do about a customer this many days after their last job.
 *
 *   [interval-lead, interval+grace] → a reminder: their service is coming due.
 *   past interval * REACTIVATE_AFTER_MULTIPLE → a win-back: they went quiet.
 *   anything else → nothing. The gap between the two is a deliberate cool-off,
 *   so a customer who ignored one reminder is not immediately chased again.
 *
 * Reminders key off a single interval from the *latest* job, not multiples: a
 * customer who rebooks gets a fresh job date and a fresh reminder next cycle,
 * and a customer who never rebooks slides into win-back territory instead of
 * getting the same "you're due" note forever.
 */
export function classify(daysSince: number, intervalDays: number): ComebackKind | null {
  if (daysSince >= intervalDays - REMINDER_LEAD_DAYS && daysSince <= intervalDays + REMINDER_GRACE_DAYS) {
    return "reminder";
  }
  if (daysSince >= intervalDays * REACTIVATE_AFTER_MULTIPLE) return "reactivate";
  return null;
}

/**
 * Which cycle this proposal belongs to, so the gate's idempotency key is stable
 * across a run repeating daily. A reminder buckets around its due date; a
 * win-back buckets per interval overdue, so a long-dormant customer is
 * re-approached about once an interval rather than every single morning.
 */
export function cycleFor(kind: ComebackKind, daysSince: number, intervalDays: number): number {
  if (kind === "reminder") {
    return Math.floor((daysSince + REMINDER_LEAD_DAYS) / intervalDays);
  }
  return Math.floor(daysSince / intervalDays);
}

export function dedupeKeyFor(kind: ComebackKind, leadId: string, cycle: number): string {
  return `comeback:${kind}:${leadId}:${cycle}`;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

function customerLabel(c: PastCustomer): string {
  return [c.name, c.company].filter(Boolean).join(" — ") || "A past customer";
}

/** A human interval word, so the copy reads naturally without a lookup table. */
export function intervalLabel(intervalDays: number): string {
  if (intervalDays <= 100) return "seasonal";
  if (intervalDays <= 200) return "six-monthly";
  if (intervalDays <= 400) return "annual";
  return "periodic";
}

function roughMonths(days: number): string {
  const months = Math.max(1, Math.round(days / 30));
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.round((days / 365) * 10) / 10;
  return `${years} year${years === 1 ? "" : "s"}`;
}

export interface ComebackMessage {
  subject: string;
  body: string;
}

/**
 * The message a past customer receives — from the client's business, in the
 * client's name, never ours. Pure and deterministic so it can be read in the
 * gate queue before it sends and so an Anthropic outage never changes a word of
 * what goes out in somebody else's name.
 */
export function composeMessage(input: {
  kind: ComebackKind;
  businessName: string;
  customerName?: string | null;
  intervalDays: number;
  daysSince: number;
}): ComebackMessage {
  const { kind, businessName, intervalDays, daysSince } = input;
  const first = (input.customerName ?? "").trim().split(/\s+/)[0] || "there";
  const cadence = intervalLabel(intervalDays);

  if (kind === "reminder") {
    return {
      subject: `Time for your ${cadence} check from ${businessName}`,
      body:
        `Hi ${first},\n\n` +
        `It's been about ${roughMonths(daysSince)} since we last took care of you, which puts you due for your ${cadence} service. ` +
        `We'd rather catch anything small now than have it turn into something bigger later.\n\n` +
        `Reply to this message or give us a call and we'll find a time that suits you.\n\n` +
        `Thanks,\n${businessName}`,
    };
  }

  return {
    subject: `We'd love to have you back at ${businessName}`,
    body:
      `Hi ${first},\n\n` +
      `It's been ${roughMonths(daysSince)} since we worked together, and we'd genuinely like to have you back. ` +
      `If anything's been on your list, this is a good moment to sort it — and we'll look after you the way we did last time.\n\n` +
      `Just reply here or call us whenever you're ready.\n\n` +
      `Thanks,\n${businessName}`,
  };
}

export interface ComebackProposal {
  kind: ComebackKind;
  /** The gate action kind key — "comeback.reminder" | "comeback.reactivate". */
  actionKind: string;
  leadId: string;
  dedupeKey: string;
  /** One line for the queue. */
  summary: string;
  /** Who it affects, for the queue's subject line. */
  subject: string;
  daysSince: number;
  payload: {
    leadId: string;
    kind: ComebackKind;
    customerName: string | null;
    company: string | null;
    email: string | null;
    phone: string | null;
    lastJobAt: string;
    daysSince: number;
    intervalDays: number;
    valueCents: number;
    message: ComebackMessage;
  };
}

export interface PlanInput {
  businessName: string;
  customers: PastCustomer[];
  intervalDays: number;
  now: Date;
  cap?: number;
}

/**
 * Pure: turn a list of past customers into the actions worth proposing. No
 * database, no model, no side effects — this is the part that must be trivially
 * testable, because it decides who a client's customers hear from.
 *
 * Oldest job first, so if the cap bites it bites the freshest customers (the
 * ones most likely to be caught next pass) rather than the ones most overdue.
 */
export function planComebacks({
  businessName,
  customers,
  intervalDays,
  now,
  cap = MAX_PER_RUN,
}: PlanInput): ComebackProposal[] {
  const proposals: ComebackProposal[] = [];

  const ordered = [...customers].sort((a, b) => a.lastJobAt.getTime() - b.lastJobAt.getTime());

  for (const c of ordered) {
    // A customer with no way to reach them can't be re-approached; skip rather
    // than queue an action that could only ever fail.
    if (!c.email && !c.phone) continue;

    const daysSince = daysBetween(c.lastJobAt, now);
    if (daysSince < 0) continue; // a job dated in the future is bad data, not a comeback

    const kind = classify(daysSince, intervalDays);
    if (!kind) continue;

    const cycle = cycleFor(kind, daysSince, intervalDays);
    const message = composeMessage({
      kind,
      businessName,
      customerName: c.name,
      intervalDays,
      daysSince,
    });

    const label = customerLabel(c);
    const summary =
      kind === "reminder"
        ? `Remind ${label} — ${roughMonths(daysSince)} since their last job, ${intervalLabel(intervalDays)} service due`
        : `Win back ${label} — no work in ${roughMonths(daysSince)}`;

    proposals.push({
      kind,
      actionKind: `comeback.${kind}`,
      leadId: c.leadId,
      dedupeKey: dedupeKeyFor(kind, c.leadId, cycle),
      summary,
      subject: label,
      daysSince,
      payload: {
        leadId: c.leadId,
        kind,
        customerName: c.name ?? null,
        company: c.company ?? null,
        email: c.email ?? null,
        phone: c.phone ?? null,
        lastJobAt: c.lastJobAt.toISOString(),
        daysSince,
        intervalDays,
        valueCents: c.valueCents,
        message,
      },
    });

    if (proposals.length >= cap) break;
  }

  return proposals;
}

/**
 * Whether a client is due a Comeback pass. The cron fires hourly; this is what
 * turns that into roughly one run a day, and — like the Spend Watch — it gates
 * on a stored timestamp rather than on whether the last run happened to queue
 * anything, so a quiet pass that proposes nothing still counts as having run.
 */
export function isDue({ now, lastRunAt }: { now: Date; lastRunAt?: Date | null }): boolean {
  if (!lastRunAt) return true;
  return now.getTime() - lastRunAt.getTime() >= MIN_HOURS_BETWEEN_RUNS * 3_600_000;
}

// ---------------------------------------------------------------------------
// The impure runner. Nothing below decides anything the pure layer has not.
// ---------------------------------------------------------------------------

export interface ComebackResult {
  clientId: string;
  status: "COMPLETE" | "SKIPPED" | "FAILED";
  reason?: string;
  /** Contactable past customers considered this pass. */
  considered?: number;
  /** Actions proposed to the gate (idempotent — re-runs do not double-count). */
  queued?: number;
}

/**
 * Group a client's won deals down to one row per customer — the latest job — so
 * a customer who bought three times is one comeback timed off their most recent
 * visit, not three overlapping ones.
 */
export function latestJobPerCustomer(
  rows: { leadId: string | null; createdAt: Date; valueCents: number; lead: { name: string | null; company: string | null; email: string | null; phone: string | null } | null }[],
): PastCustomer[] {
  const byLead = new Map<string, PastCustomer>();
  for (const r of rows) {
    if (!r.leadId || !r.lead) continue;
    const existing = byLead.get(r.leadId);
    if (!existing || r.createdAt.getTime() > existing.lastJobAt.getTime()) {
      byLead.set(r.leadId, {
        leadId: r.leadId,
        name: r.lead.name,
        company: r.lead.company,
        email: r.lead.email,
        phone: r.lead.phone,
        lastJobAt: r.createdAt,
        valueCents: r.valueCents,
      });
    }
  }
  return [...byLead.values()];
}

/**
 * Run one client's Comeback pass. Enabled-gated, due-gated, and idempotent by
 * construction — the gate's unique (clientId, dedupeKey) means a re-run on the
 * same day re-proposes nothing, so this is safe for the hourly cron and its
 * retries to call repeatedly.
 */
export async function runComeback(clientId: string, now = new Date()): Promise<ComebackResult> {
  const client = await prisma.clientProfile.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      businessName: true,
      industry: true,
      verticalKey: true,
      comebackEnabled: true,
      comebackIntervalDays: true,
      comebackLastRunAt: true,
    },
  });
  if (!client) return { clientId, status: "SKIPPED", reason: "No such client" };
  if (!client.comebackEnabled) return { clientId, status: "SKIPPED", reason: "Disabled" };
  if (!isDue({ now, lastRunAt: client.comebackLastRunAt })) {
    return { clientId, status: "SKIPPED", reason: "Not due" };
  }

  try {
    const intervalDays = intervalFor(client);

    const wonDeals = await prisma.dealOutcome.findMany({
      where: { clientId, outcome: "WON", leadId: { not: null } },
      select: {
        leadId: true,
        createdAt: true,
        valueCents: true,
        lead: { select: { name: true, company: true, email: true, phone: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 2000,
    });

    const customers = latestJobPerCustomer(wonDeals);
    const proposals = planComebacks({
      businessName: client.businessName,
      customers,
      intervalDays,
      now,
    });

    for (const p of proposals) {
      await propose({
        clientId,
        kind: p.actionKind,
        summary: p.summary,
        subject: p.subject,
        payload: { ...p.payload, clientId },
        dedupeKey: p.dedupeKey,
        now,
      });
    }

    // Stamp the run whether or not it queued anything — a quiet pass still ran,
    // and without this the cron would re-run it every hour looking for work.
    await prisma.clientProfile.update({
      where: { id: clientId },
      data: { comebackLastRunAt: now },
    });

    return {
      clientId,
      status: "COMPLETE",
      considered: customers.length,
      queued: proposals.length,
    };
  } catch (err) {
    console.error(`[comeback] run failed for ${clientId}:`, err);
    return { clientId, status: "FAILED", reason: (err as Error).message };
  }
}

/** Clients who have bought The Comeback, for the cron to walk. */
export async function comebackRoster(): Promise<string[]> {
  const clients = await prisma.clientProfile.findMany({
    where: { comebackEnabled: true },
    select: { id: true },
  });
  return clients.map((c) => c.id);
}

// ---------------------------------------------------------------------------
// The executors — the only code here that actually reaches a customer, and only
// ever for an action the gate has released.
// ---------------------------------------------------------------------------

interface DeliverPayload {
  clientId: string;
  kind: ComebackKind;
  leadId: string;
  customerName: string | null;
  email: string | null;
  phone: string | null;
  message: ComebackMessage;
}

/**
 * Deliver a released Comeback message. It goes out through the client's own CRM
 * webhook — their channel, their sender — because a re-approach to their
 * customer must arrive from their business, never from ours. Falls back to the
 * agency automation hook, and if neither is wired it throws, so the gate records
 * a plain FAILED rather than a silent success: an action nobody could perform
 * must never look like one that was.
 */
export async function deliverComeback(payload: unknown): Promise<Record<string, unknown>> {
  const p = payload as DeliverPayload;
  const to = p.email ?? p.phone ?? null;
  if (!to) throw new Error("This customer has no email or phone on file; nothing could be sent.");

  const body = {
    source: "comeback",
    kind: p.kind,
    clientId: p.clientId,
    to: { name: p.customerName, email: p.email, phone: p.phone },
    subject: p.message.subject,
    message: p.message.body,
    at: new Date().toISOString(),
  };

  const crm = await prisma.webhookConfig.findFirst({
    where: { clientId: p.clientId, enabled: true },
    orderBy: { createdAt: "asc" },
    select: { url: true, label: true },
  });

  if (crm) {
    const ok = await postWebhook(crm.url, body, { label: "comeback-crm" });
    if (ok) return { channel: "crm-webhook", via: crm.label, to };
    throw new Error(`The CRM webhook (${crm.label}) did not accept the message; nothing was sent.`);
  }

  const ok = await postWebhook(env.zapierOnboardHook, body, { label: "comeback-hook" });
  if (ok) return { channel: "automation-hook", to };

  throw new Error(
    "No delivery channel is wired for The Comeback. Connect a CRM webhook so re-approaches can reach your customers.",
  );
}

/**
 * Register the Comeback executors with the gate. Called from the sweep cron so
 * the executors exist in the process that runs released actions — deliberately
 * NOT run at import, so importing this module for its pure helpers (or in a
 * test) does not quietly wire live delivery into the gate's global registry.
 */
export function registerComebackExecutors(): void {
  registerExecutor("comeback.reminder", deliverComeback);
  registerExecutor("comeback.reactivate", deliverComeback);
}
