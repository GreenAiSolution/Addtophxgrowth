/**
 * THE PIPELINE — nobody who asked to be contacted gets forgotten.
 *
 * DIRECTION
 *   `/api/reserve` is the only conversion endpoint on the site, and it
 *   deliberately touches no database: it emails the desk and returns. That
 *   choice is right and stays (it is the one path that has to survive an
 *   unconfigured deploy), but it means the entire commercial pipeline of this
 *   business lived in an inbox. If that email was skipped because no
 *   RESEND_API_KEY was set, or landed in spam, or arrived on a busy Tuesday
 *   and got buried, the prospect was gone and nothing anywhere knew they had
 *   ever existed.
 *
 *   Somebody who reads a page of four-figure monthly upgrades and types their
 *   phone number in is the most valuable event that happens on this site. The
 *   fix is two things: write it down somewhere durable, and chase it without
 *   anybody having to remember to.
 *
 * BLUEPRINTS
 *   `planFollowUp` is pure, so the ladder is tested without a database — same
 *   split as dunning.ts, which it deliberately mirrors rung for rung.
 *
 *   No model call. A follow-up to a stranger who gave us their details is not
 *   the place for generated prose that nobody read before it sent.
 *
 * THE OPT-OUT IS NOT OPTIONAL
 *   This is the only loop in the platform that emails somebody who is not a
 *   client, on a timer, without a human in the path. Every message carries a
 *   one-click stop link that works without a login, and the ladder halts on
 *   the first sign of a human on either end — a reply logged, the stage moved,
 *   or the stop link clicked. An unattended sequence with no way off it is not
 *   something to point at a stranger's inbox.
 */

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendNotification, type NotificationKind } from "@/lib/notify";
import { formatCurrency } from "@/lib/utils";
import { env } from "@/lib/env";

export type FollowUpStep = "NUDGE" | "SECOND" | "LAST_CALL";

/**
 * Hours after capture that each follow-up becomes due.
 *
 * Front-loaded on purpose. The first day is when they still remember building
 * the thing; by day ten they are being reminded of a decision they have
 * already made, which is why the ladder stops there rather than running on.
 */
export const FOLLOW_UP_LADDER: {
  step: FollowUpStep;
  afterHours: number;
  kind: NotificationKind;
}[] = [
  { step: "NUDGE", afterHours: 24, kind: "FOLLOW_UP_NUDGE" },
  { step: "SECOND", afterHours: 96, kind: "FOLLOW_UP_SECOND" },
  { step: "LAST_CALL", afterHours: 240, kind: "FOLLOW_UP_LAST" },
];

/** No two follow-ups closer together than this, whatever the ladder says. */
export const MIN_FOLLOW_UP_GAP_HOURS = 20;

export interface FollowUpOpportunity {
  stage: "NEW" | "WORKING" | "WON" | "LOST" | "DORMANT";
  createdAt: Date;
  followUpsSent: number;
  lastFollowUpAt: Date | null;
  respondedAt: Date | null;
  stoppedAt: Date | null;
}

export type FollowUpVerdict =
  | { do: "send"; step: FollowUpStep; kind: NotificationKind; why: string }
  | { do: "wait"; why: string }
  | { do: "dormant"; why: string }
  | { do: "stop"; why: string };

function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 3_600_000;
}

/**
 * Pure: decide whether this prospect hears from us today.
 *
 * The stop conditions are checked before anything else and in that order. A
 * sequence that keeps sending after somebody has replied is worse than one
 * that never sent at all, so every reason to stop wins over every reason to
 * send.
 */
export function planFollowUp(opp: FollowUpOpportunity, now: Date): FollowUpVerdict {
  if (opp.stoppedAt) return { do: "stop", why: "They asked us to stop." };
  if (opp.respondedAt) return { do: "stop", why: "They replied; a person has it." };
  if (opp.stage !== "NEW") {
    return { do: "stop", why: `Stage is ${opp.stage}; the ladder only runs on NEW.` };
  }

  const age = hoursBetween(opp.createdAt, now);
  const sent = opp.followUpsSent;

  if (sent >= FOLLOW_UP_LADDER.length) {
    return { do: "dormant", why: "Ladder complete with no reply." };
  }

  const next = FOLLOW_UP_LADDER[sent];
  if (age < next.afterHours) {
    return {
      do: "wait",
      why: `${next.step} is due ${next.afterHours}h after capture; it is ${Math.floor(age)}h.`,
    };
  }

  if (opp.lastFollowUpAt) {
    const since = hoursBetween(opp.lastFollowUpAt, now);
    if (since < MIN_FOLLOW_UP_GAP_HOURS) {
      return {
        do: "wait",
        why: `Last touch was ${Math.floor(since)}h ago; minimum gap is ${MIN_FOLLOW_UP_GAP_HOURS}h.`,
      };
    }
  }

  return {
    do: "send",
    step: next.step,
    kind: next.kind,
    why: `${next.step}, ${Math.floor(age)}h after capture.`,
  };
}

// ---------------------------------------------------------------------------
// The database half.
// ---------------------------------------------------------------------------

export interface CaptureInput {
  source: "RESERVATION" | "ENQUIRY" | "COCKPIT";
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  note?: string | null;
  items?: string[];
  quotedMonthlyCents?: number;
  quotedOneTimeCents?: number;
}

/**
 * Write a prospect down.
 *
 * Merges into the open opportunity for that email rather than creating a
 * second one. Somebody who configures a build, thinks about it, and configures
 * a bigger one two days later is one conversation — and two rows would mean
 * two ladders emailing them in parallel, which is precisely the failure this
 * module exists to prevent.
 *
 * NEVER THROWS. Every caller is a conversion path, and losing the enquiry
 * email because a database was briefly unreachable would be a worse outcome
 * than losing the row.
 */
export async function captureOpportunity(input: CaptureInput) {
  try {
    const email = input.email.trim().toLowerCase();

    const open = await prisma.opportunity.findFirst({
      where: { email, stage: { in: ["NEW", "WORKING"] } },
      orderBy: { createdAt: "desc" },
    });

    if (open) {
      return await prisma.opportunity.update({
        where: { id: open.id },
        data: {
          // The newer submission is the better information about what they
          // want, so it wins — except for contact details, where a blank field
          // in the second form must not erase what the first one told us.
          name: input.name || open.name,
          phone: input.phone ?? open.phone,
          company: input.company ?? open.company,
          note: input.note ?? open.note,
          items: input.items?.length ? input.items : open.items,
          quotedMonthlyCents: input.quotedMonthlyCents ?? open.quotedMonthlyCents,
          quotedOneTimeCents: input.quotedOneTimeCents ?? open.quotedOneTimeCents,
          source: input.source,
        },
      });
    }

    return await prisma.opportunity.create({
      data: {
        source: input.source,
        name: input.name,
        email,
        phone: input.phone ?? null,
        company: input.company ?? null,
        note: input.note ?? null,
        items: input.items ?? [],
        quotedMonthlyCents: input.quotedMonthlyCents ?? 0,
        quotedOneTimeCents: input.quotedOneTimeCents ?? 0,
        stopToken: randomBytes(24).toString("base64url"),
      },
    });
  } catch (err) {
    console.error("[pipeline] capture failed (the notification still went):", err);
    return null;
  }
}

/** The link that ends the sequence. Works with no login, by design. */
export function stopUrl(stopToken: string): string {
  return `${env.publicUrl}/api/pipeline/stop?t=${encodeURIComponent(stopToken)}`;
}

/**
 * Honour a stop click. Idempotent — a second click, or a prefetch by a mail
 * client, must not error or undo anything.
 */
export async function stopFollowUps(stopToken: string): Promise<boolean> {
  const result = await prisma.opportunity.updateMany({
    where: { stopToken, stoppedAt: null },
    data: { stoppedAt: new Date() },
  });
  // A token that matched an already-stopped row is still a success from the
  // clicker's point of view: they are off the list either way.
  if (result.count > 0) return true;
  const exists = await prisma.opportunity.findUnique({ where: { stopToken } });
  return Boolean(exists);
}

export interface FollowUpRunResult {
  checked: number;
  sent: number;
  dormant: number;
  waiting: number;
  stopped: number;
}

/** The unattended pass. Driven by the daily revenue cron. */
export async function runFollowUps(now = new Date()): Promise<FollowUpRunResult> {
  const out: FollowUpRunResult = { checked: 0, sent: 0, dormant: 0, waiting: 0, stopped: 0 };

  const open = await prisma.opportunity.findMany({
    where: { stage: "NEW", stoppedAt: null, respondedAt: null },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  for (const opp of open) {
    out.checked++;
    const verdict = planFollowUp(opp as FollowUpOpportunity, now);

    try {
      if (verdict.do === "send") {
        await sendNotification({
          kind: verdict.kind,
          to: opp.email,
          payload: {
            businessName: opp.company || opp.name,
            title: opp.items.length
              ? `Your build: ${opp.items.join(", ")}`
              : "The build you started",
            path: "/cockpit",
            lines: opp.quotedMonthlyCents
              ? [`Monthly as configured: ${formatCurrency(opp.quotedMonthlyCents)}`]
              : [],
            unsubscribeUrl: stopUrl(opp.stopToken),
          },
        });

        await prisma.opportunity.update({
          where: { id: opp.id },
          data: { followUpsSent: { increment: 1 }, lastFollowUpAt: now },
        });
        out.sent++;
        continue;
      }

      if (verdict.do === "dormant") {
        await prisma.opportunity.update({
          where: { id: opp.id },
          data: { stage: "DORMANT" },
        });
        out.dormant++;
        continue;
      }

      if (verdict.do === "stop") {
        out.stopped++;
        continue;
      }

      out.waiting++;
    } catch (err) {
      console.error(`[pipeline] follow-up for ${opp.id} threw:`, err);
      out.waiting++;
    }
  }

  return out;
}
