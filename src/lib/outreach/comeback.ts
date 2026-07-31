/**
 * THE COMEBACK — the outbound loop that treats a client's own history as a
 * channel.
 *
 * DIRECTION
 *   The upgrade catalogue sells this in writing:
 *
 *     "Echo asks them for a review. This one asks them back."
 *     — Every past job dated, so the next one falls due without anybody
 *       remembering; reminders timed to the season or interval; dormant names
 *       re-approached on a schedule; a monthly read-out of who was due, who
 *       replied, and who came back; and every message inspectable before it
 *       sends, and the whole run visible after.
 *
 *   The cheapest name a business owns is somebody who has already paid it once,
 *   and for any trade with a service interval the trigger for the next job is a
 *   date that already exists in the records and nobody reads. This loop reads it.
 *
 * WHY IT SITS BEHIND THE GATE
 *   The catalogue's oversight line for this build is absolute: "nothing reaches
 *   a past customer without being visible to you first." So this loop does not
 *   send. It *proposes* — every due customer becomes a held action in the gate,
 *   drafted and inspectable, and nothing leaves until a review window closes or
 *   a human releases it. The gate already declares the two action kinds this
 *   loop uses (`comeback.reminder`, `comeback.reactivate`); this file is the
 *   thing that was promised "before either loop exists", now built.
 *
 * BLUEPRINTS
 *   Everything that decides *who is due and what it costs* is pure and tested:
 *   `intervalFor`, `nextDueAt`, `assessRecord`, `selectDue`, `dedupeKeyFor`,
 *   `isComebackDue`, `summarise`, and the deterministic `fallbackMessage`. Only
 *   `runComeback`, the executor, and the roster touch the database or the model.
 *
 *   THE LIST IS THE PRODUCT, THE PROSE IS A BONUS — the same ordering as the
 *   night shift. `assessRecord` decides who to contact with arithmetic, not a
 *   model. The model only writes the wording, and if it is unavailable the loop
 *   falls back to a plain template and still queues the action. A model outage
 *   costs a nicer sentence; it never costs the client a customer who was due.
 */

import { prisma } from "@/lib/prisma";
import { anthropic, ANTHROPIC_MODEL } from "@/lib/anthropic";
import { checkAgentRun, recordRun, getActiveSubscription } from "@/lib/entitlements";
import { memoryDigest } from "@/lib/memory";
import { resolveVertical } from "@/lib/verticals";
import { propose, registerExecutor } from "@/lib/gate";
import { postWebhook } from "@/lib/webhooks";

/** The follow-up specialist is the crew member that "chases the ones who went
 *  quiet" (see catalog.ts). Its runs are metered like any other. */
const SEQUENCER_SLUG = "follow-up-sequencer";

export type ComebackKind = "comeback.reminder" | "comeback.reactivate";

/** Never propose more than this in one pass — a burst of held actions is as
 *  noisy as a burst of sent ones, and the queue is meant to be read. */
export const MAX_PER_RUN = 25;

/**
 * Tuning, all in days. These are the numbers `assessRecord` reads, kept in one
 * place so the behaviour can be reasoned about without hunting through branches.
 */
export const COMEBACK = {
  /** Start reminding this many days *before* the next job falls due — a
   *  reminder that lands the week after the service was needed is a reminder
   *  about a job the customer already gave to somebody else. */
  reminderLeadDays: 21,
  /** Past 1.5× the interval with no contact, a customer is not "due soon" — they
   *  are lapsing, and the message that fits is a re-approach, not a reminder. */
  dormantMultiplier: 1.5,
  /** Never contact the same record twice inside this window, whatever the dates
   *  say. This is the anti-nuisance floor. */
  cooldownDays: 90,
} as const;

/**
 * Default service interval per trade, in days, when a record doesn't carry its
 * own. A real number for each pack rather than one global guess — a dental
 * recall is not a roof replacement — with a conservative fallback for trades
 * that don't have a natural cadence.
 *
 * These are starting assumptions the client overrides per record; the point is
 * that a business which doesn't know its own cadence still gets a sensible one
 * instead of nothing.
 */
export const DEFAULT_INTERVAL_DAYS: Record<string, number> = {
  hvac: 182, // spring and autumn tune-ups — twice a year
  dental: 182, // the six-month recall
  "med-spa": 90, // most treatment cycles run quarterly
  medspa: 90,
  roofing: 365, // an annual inspection, more often after a storm
  remodeling: 1095, // three years — a real re-approach cadence, not a nag
  legal: 730, // most matters don't repeat; a light two-year check-in
};

/** The fallback when a trade isn't in the table above or isn't set at all. */
export const FALLBACK_INTERVAL_DAYS = 365;

const DAY_MS = 86_400_000;

export function defaultIntervalDays(verticalKey: string | null | undefined): number {
  if (!verticalKey) return FALLBACK_INTERVAL_DAYS;
  return DEFAULT_INTERVAL_DAYS[verticalKey] ?? FALLBACK_INTERVAL_DAYS;
}

/** A minimal shape of a service record — everything the pure layer reads. */
export interface RecordLike {
  completedAt: Date;
  intervalDays?: number | null;
  lastContactedAt?: Date | null;
  doNotContact?: boolean;
  returnedAt?: Date | null;
}

/** The interval this record actually runs on: its own, or the trade default. */
export function intervalFor(record: RecordLike, verticalKey: string | null | undefined): number {
  const own = record.intervalDays;
  if (typeof own === "number" && own > 0) return own;
  return defaultIntervalDays(verticalKey);
}

/** When the next job falls due — the date the whole loop turns on. */
export function nextDueAt(record: RecordLike, verticalKey: string | null | undefined): Date {
  return new Date(record.completedAt.getTime() + intervalFor(record, verticalKey) * DAY_MS);
}

export type Verdict =
  | { do: "skip"; why: string }
  | { do: "remind"; kind: "comeback.reminder"; dueAt: Date; daysUntilDue: number }
  | { do: "reactivate"; kind: "comeback.reactivate"; dueAt: Date; overdueDays: number };

/**
 * What to do about one customer, right now. Pure — this is the load-bearing
 * decision and it must be reproducible without a database or a model.
 *
 * The order of the guards matters. `doNotContact` and `returnedAt` are checked
 * first and unconditionally: an overdue customer who asked not to be contacted
 * is still not contacted, and one who already came back is not chased for a job
 * they've booked. Cooldown is next, so a record contacted last month is quiet
 * whatever its due date says. Only then do the dates decide reminder vs
 * re-approach.
 */
export function assessRecord(
  record: RecordLike,
  verticalKey: string | null | undefined,
  now: Date,
): Verdict {
  if (record.doNotContact) return { do: "skip", why: "marked do-not-contact" };
  if (record.returnedAt) return { do: "skip", why: "already came back" };

  if (record.lastContactedAt) {
    const daysSince = (now.getTime() - record.lastContactedAt.getTime()) / DAY_MS;
    if (daysSince < COMEBACK.cooldownDays) {
      return { do: "skip", why: `contacted ${Math.round(daysSince)}d ago, inside cooldown` };
    }
  }

  const dueAt = nextDueAt(record, verticalKey);
  const interval = intervalFor(record, verticalKey);
  const dormantAt = new Date(record.completedAt.getTime() + interval * COMEBACK.dormantMultiplier * DAY_MS);
  const daysUntilDue = Math.round((dueAt.getTime() - now.getTime()) / DAY_MS);

  // Well past the interval — a lapsing customer, not one due soon.
  if (now.getTime() >= dormantAt.getTime()) {
    return {
      do: "reactivate",
      kind: "comeback.reactivate",
      dueAt,
      overdueDays: Math.round((now.getTime() - dueAt.getTime()) / DAY_MS),
    };
  }

  // Inside the reminder window: from `reminderLeadDays` before the due date up
  // to the dormant threshold. The upper bound is dormantAt (checked above), so
  // there is deliberately no gap between "remind" and "reactivate".
  if (now.getTime() >= dueAt.getTime() - COMEBACK.reminderLeadDays * DAY_MS) {
    return { do: "remind", kind: "comeback.reminder", dueAt, daysUntilDue };
  }

  return { do: "skip", why: `not due for ${daysUntilDue}d` };
}

/**
 * The interval cycle a record is in, measured from `completedAt`. Used to build
 * a dedupe key that is stable within one cycle but changes when the next comes
 * round — so a re-running loop never double-queues a customer this cycle, and a
 * customer who lapses across cycles gets re-approached at most once per cycle
 * rather than every single day.
 */
export function cycleOf(record: RecordLike, verticalKey: string | null | undefined, now: Date): number {
  const interval = intervalFor(record, verticalKey);
  const elapsed = now.getTime() - record.completedAt.getTime();
  return Math.max(0, Math.floor(elapsed / (interval * DAY_MS)));
}

/**
 * Idempotency key for a proposal. Unique per (record, kind, cycle) so the gate's
 * unique constraint absorbs a re-run — the same due customer waking the loop
 * twice produces the same key both times and the second `propose` is a no-op.
 */
export function dedupeKeyFor(
  recordId: string,
  kind: ComebackKind,
  cycle: number,
): string {
  return `comeback:${kind}:${recordId}:c${cycle}`;
}

export interface Due<T extends RecordLike & { id: string }> {
  record: T;
  verdict: Extract<Verdict, { do: "remind" | "reactivate" }>;
}

/**
 * The customers to act on this pass, most urgent first, capped. Reactivations
 * lead (a lapsing customer is a closing window), ordered by how overdue they
 * are; reminders follow, soonest-due first.
 */
export function selectDue<T extends RecordLike & { id: string }>(
  records: T[],
  verticalKey: string | null | undefined,
  now: Date,
  cap = MAX_PER_RUN,
): Due<T>[] {
  const due: Due<T>[] = [];
  for (const record of records) {
    const verdict = assessRecord(record, verticalKey, now);
    if (verdict.do === "remind" || verdict.do === "reactivate") {
      due.push({ record, verdict });
    }
  }

  due.sort((a, b) => {
    const rank = (d: Due<T>) => (d.verdict.do === "reactivate" ? 0 : 1);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.verdict.do === "reactivate" && b.verdict.do === "reactivate") {
      return b.verdict.overdueDays - a.verdict.overdueDays;
    }
    return a.verdict.dueAt.getTime() - b.verdict.dueAt.getTime();
  });

  return due.slice(0, cap);
}

// ---------------------------------------------------------------------------
// The daily-run gate
// ---------------------------------------------------------------------------

/** UTC midnight bucket — the unit the run cadence is measured in. */
export function dayBucket(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Whether a client is due a Comeback pass. The cron fires hourly; this is what
 * turns that into one pass a day. Deliberately simpler than the night shift's
 * `isDue` — there is no per-customer hour to hit, only "not already today".
 */
export function isComebackDue(now: Date, lastRunAt: Date | null | undefined): boolean {
  if (!lastRunAt) return true;
  return dayBucket(lastRunAt).getTime() < dayBucket(now).getTime();
}

// ---------------------------------------------------------------------------
// The message — model-written, template-backed
// ---------------------------------------------------------------------------

export interface DraftContext {
  businessName: string;
  voiceTone?: string | null;
  customerName: string;
  service?: string | null;
  kind: ComebackKind;
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || "there";
}

/**
 * The message used when the model is unavailable — a plain, honest template per
 * kind. Deliberately short and channel-agnostic (it may go out as an SMS), and
 * deliberately not salesy: the whole edge of this channel is that it is coming
 * from somebody they've already trusted with a job.
 */
export function fallbackMessage(ctx: DraftContext): string {
  const name = firstName(ctx.customerName);
  const workRef = ctx.service ? `the ${ctx.service.toLowerCase()}` : "the work we did";
  if (ctx.kind === "comeback.reactivate") {
    return (
      `Hi ${name}, it's ${ctx.businessName}. It's been a while since ${workRef} — ` +
      `we'd love to have you back. If there's anything you've been meaning to get ` +
      `looked at, reply here and we'll sort a time that suits you.`
    );
  }
  return (
    `Hi ${name}, it's ${ctx.businessName}. ${ctx.service ? `Your ${ctx.service.toLowerCase()} is` : "You're"} ` +
    `about due for its next check. Want us to get you on the schedule? Reply here and we'll find a slot.`
  );
}

/** The drafting instruction for the model. Kept close to `fallbackMessage` so
 *  the two produce the same *kind* of message. */
function draftSystemPrompt(
  ctx: DraftContext,
  client: { businessName: string; industry?: string | null; verticalKey?: string | null },
  memory: string,
): string {
  const pack = resolveVertical(client);
  const goal =
    ctx.kind === "comeback.reactivate"
      ? "This customer has gone quiet well past their usual service interval. Write a warm re-approach that invites them back without discounting or pressure."
      : "This customer is about due for their next service. Write a short, friendly reminder that offers to book them in.";
  return [
    `You write outbound messages for ${ctx.businessName}, a ${client.industry ?? "local service business"}, to a PAST customer who has already paid them at least once.`,
    goal,
    "Rules: one short message, no subject line, no placeholders or brackets, no emoji, no discounts, no false urgency. Write it as if it could be sent by SMS. Address them by first name. Sign off as the business, not a named person.",
    ctx.voiceTone ? `Match this brand voice: ${ctx.voiceTone}` : "",
    pack ? `\n\nVoice reference for this trade:\n${pack.assetBodies["asset-voice-profile"]}` : "",
    memory,
    "\n\nReturn ONLY the message text. Nothing before or after it.",
  ]
    .filter(Boolean)
    .join(" ");
}

// ---------------------------------------------------------------------------
// The read-out (pure)
// ---------------------------------------------------------------------------

export interface ComebackSummary {
  total: number;
  dueNow: number;
  dormant: number;
  notDueYet: number;
  contacted: number;
  returned: number;
  doNotContact: number;
}

/**
 * The monthly read-out's numbers, from the records alone. Pure so the page can
 * render it without a second source of truth. "Who replied / came back" is only
 * as good as what the client tells us — `returned` counts records explicitly
 * marked as returned, and the page says so rather than inventing a reply rate.
 */
export function summarise(
  records: (RecordLike & { id: string })[],
  verticalKey: string | null | undefined,
  now: Date,
): ComebackSummary {
  const s: ComebackSummary = {
    total: records.length,
    dueNow: 0,
    dormant: 0,
    notDueYet: 0,
    contacted: 0,
    returned: 0,
    doNotContact: 0,
  };
  for (const r of records) {
    if (r.returnedAt) s.returned++;
    if (r.doNotContact) s.doNotContact++;
    if (r.lastContactedAt) s.contacted++;
    const v = assessRecord(r, verticalKey, now);
    if (v.do === "remind") s.dueNow++;
    else if (v.do === "reactivate") s.dormant++;
    else if (v.why.startsWith("not due")) s.notDueYet++;
  }
  return s;
}

/** A short human status for one record, for the page's list. Pure. */
export function recordStatus(
  record: RecordLike,
  verticalKey: string | null | undefined,
  now: Date,
): string {
  if (record.returnedAt) return "Came back";
  if (record.doNotContact) return "Do not contact";
  const v = assessRecord(record, verticalKey, now);
  if (v.do === "reactivate") return `Lapsed — ${v.overdueDays}d overdue`;
  if (v.do === "remind") return v.daysUntilDue >= 0 ? `Due in ${v.daysUntilDue}d` : `Due ${-v.daysUntilDue}d ago`;
  if (record.lastContactedAt) return "Contacted, waiting";
  return "Not due yet";
}

// ---------------------------------------------------------------------------
// The executor — how a released action actually reaches the customer
// ---------------------------------------------------------------------------

/** The shape `runComeback` puts on the wire and the executor reads back. */
export interface ComebackPayload {
  clientId: string;
  recordId: string;
  customerName: string;
  to: { email?: string | null; phone?: string | null };
  service?: string | null;
  message: string;
  kind: ComebackKind;
  drafted: "model" | "template";
}

/**
 * Deliver one released Comeback message. Registered for both kinds because the
 * delivery is identical — the difference between a reminder and a re-approach is
 * in the words, which are already fixed by the time the action is released.
 *
 * There is no built-in SMS/email-to-customer channel on this platform, and
 * pretending otherwise would be the exact failure the gate exists to prevent —
 * an action that looks sent but reached nobody. So delivery goes through the
 * client's own connected CRM/automation webhook (the same handoff the rest of
 * the platform uses for external actions). No webhook connected = a loud,
 * honest failure recorded against the action, not a silent success.
 */
async function deliverComeback(payload: unknown): Promise<Record<string, unknown>> {
  const p = payload as ComebackPayload;
  if (!p?.clientId || !p?.recordId || !p?.message) {
    throw new Error("Malformed comeback payload — nothing sent.");
  }

  const hook = await prisma.webhookConfig.findFirst({
    where: { clientId: p.clientId, enabled: true },
    orderBy: { createdAt: "asc" },
  });
  if (!hook) {
    throw new Error(
      "No delivery channel is connected. Connect your CRM or automation webhook so released messages can reach customers.",
    );
  }

  const delivered = await postWebhook(
    hook.url,
    {
      source: "comeback",
      kind: p.kind,
      customerName: p.customerName,
      to: p.to,
      service: p.service ?? null,
      message: p.message,
      at: new Date().toISOString(),
    },
    { label: "comeback-deliver" },
  );
  if (!delivered) {
    throw new Error("The connected webhook did not accept the message. Nothing was sent.");
  }

  // Only now — after a real, accepted delivery — does the cooldown clock start.
  await prisma.serviceRecord.update({
    where: { id: p.recordId },
    data: { lastContactedAt: new Date() },
  });

  return { delivered: true, via: "webhook", webhookId: hook.id };
}

// Registered at module load. The gate sweep and the queue page import this file
// for exactly this side effect, so a released comeback action has something to
// perform instead of recording "no executor wired".
registerExecutor("comeback.reminder", deliverComeback);
registerExecutor("comeback.reactivate", deliverComeback);

// ---------------------------------------------------------------------------
// The runner (impure)
// ---------------------------------------------------------------------------

export interface ComebackResult {
  clientId: string;
  status: "COMPLETE" | "SKIPPED" | "FAILED";
  reason?: string;
  proposed?: number;
}

/**
 * Run one client's Comeback pass: find who is due, draft each message, and queue
 * it in the gate. Idempotent — the dedupe key means a re-run (Vercel retries)
 * re-proposes nothing already queued this cycle, so it is safe to fire twice.
 */
export async function runComeback(clientId: string, now = new Date()): Promise<ComebackResult> {
  const client = await prisma.clientProfile.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      businessName: true,
      industry: true,
      verticalKey: true,
      voiceTone: true,
      comebackEnabled: true,
      comebackLastRunAt: true,
    },
  });
  if (!client) return { clientId, status: "SKIPPED", reason: "No such client" };
  if (!client.comebackEnabled) return { clientId, status: "SKIPPED", reason: "Comeback not enabled" };

  // The build attaches to the AI Employees line; no active plan, no loop.
  const sub = await getActiveSubscription(clientId, "AI_AGENTS");
  if (!sub) return { clientId, status: "SKIPPED", reason: "No active AI Agents plan" };

  if (!isComebackDue(now, client.comebackLastRunAt)) {
    return { clientId, status: "SKIPPED", reason: "Already ran today" };
  }

  try {
    const records = await prisma.serviceRecord.findMany({
      where: { clientId, doNotContact: false, returnedAt: null },
      orderBy: { completedAt: "asc" },
      take: 2000,
    });

    const due = selectDue(records, client.verticalKey, now);

    if (due.length === 0) {
      await prisma.clientProfile.update({
        where: { id: clientId },
        data: { comebackLastRunAt: now },
      });
      return { clientId, status: "COMPLETE", proposed: 0 };
    }

    const [agent, digest] = await Promise.all([
      prisma.agentDefinition.findUnique({ where: { slug: SEQUENCER_SLUG } }),
      memoryDigest(clientId),
    ]);

    let proposed = 0;
    for (const { record, verdict } of due) {
      // Respect the meter even unattended. If a client is out of runs, stop —
      // the remaining customers are still due tomorrow.
      const availability = await checkAgentRun(clientId, SEQUENCER_SLUG);
      if (!availability.allowed) break;

      const ctx: DraftContext = {
        businessName: client.businessName,
        voiceTone: client.voiceTone,
        customerName: record.customerName,
        service: record.service,
        kind: verdict.kind,
      };

      // The message is a bonus over the decision — a model outage falls back to
      // the template and still queues the action.
      let message = fallbackMessage(ctx);
      let drafted: "model" | "template" = "template";
      if (agent) {
        try {
          const res = await anthropic().messages.create({
            model: ANTHROPIC_MODEL,
            max_tokens: 400,
            system: draftSystemPrompt(ctx, client, digest),
            messages: [
              {
                role: "user",
                content: `Customer: ${record.customerName}\nLast service: ${record.service ?? "(not recorded)"}\nCompleted: ${record.completedAt.toISOString().slice(0, 10)}`,
              },
            ],
          });
          const text = res.content
            .map((b) => (b.type === "text" ? b.text : ""))
            .join("")
            .trim();
          if (text) {
            message = text;
            drafted = "model";
            await recordRun(clientId, SEQUENCER_SLUG, res.usage.input_tokens, res.usage.output_tokens);
          }
        } catch (err) {
          console.warn(`[comeback] draft failed for ${record.id}, using template:`, err);
        }
      }

      const cycle = cycleOf(record, client.verticalKey, now);
      const payload: ComebackPayload = {
        clientId,
        recordId: record.id,
        customerName: record.customerName,
        to: { email: record.email, phone: record.phone },
        service: record.service,
        message,
        kind: verdict.kind,
        drafted,
      };

      const summary =
        verdict.do === "reactivate"
          ? `Re-approach ${record.customerName} — lapsed ${verdict.overdueDays}d past due`
          : `Remind ${record.customerName} — due in ${verdict.daysUntilDue}d`;

      await propose({
        clientId,
        kind: verdict.kind,
        summary,
        subject: record.customerName,
        payload: payload as unknown as Record<string, unknown>,
        dedupeKey: dedupeKeyFor(record.id, verdict.kind, cycle),
        now,
      });
      proposed++;
    }

    await prisma.clientProfile.update({
      where: { id: clientId },
      data: { comebackLastRunAt: now },
    });

    return { clientId, status: "COMPLETE", proposed };
  } catch (err) {
    console.error("[comeback] run failed:", err);
    return { clientId, status: "FAILED", reason: (err as Error).message };
  }
}

/** Clients whose build is on and who have an active AI Agents plan. */
export async function comebackRoster(): Promise<string[]> {
  const clients = await prisma.clientProfile.findMany({
    where: {
      comebackEnabled: true,
      subscriptions: {
        some: { lineKey: "AI_AGENTS", status: { in: ["ACTIVE", "TRIALING"] } },
      },
    },
    select: { id: true },
  });
  return clients.map((c) => c.id);
}
