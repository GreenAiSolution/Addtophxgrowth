/**
 * CONVERSATION INTELLIGENCE — the leaks.
 *
 * DIRECTION
 *   This is the part that pays for the subsystem, and it needs no model at
 *   all.
 *
 *   A home-services business does not usually lose a month to bad salesmanship.
 *   It loses it to a phone that rang at 11:40 on a Tuesday while both crews
 *   were on roofs, and nobody rang back. The lead was paid for, the intent was
 *   real, and the loss leaves no trace anywhere in this system today: the
 *   Spend Watch sees the spend that produced it, `/app/leads` never hears
 *   about it because no form was filled, and `memory.ts` never learns from it
 *   because there is no outcome to log.
 *
 *   Every function here is arithmetic over call records. No model, no
 *   inference, no scoring — which means these findings survive an Anthropic
 *   outage, cannot hallucinate, and can be handed to an owner as fact rather
 *   than as an opinion the software formed.
 *
 * THE RULE THIS FILE OBEYS
 *   Never invent the value of a leak. A missed call is worth something and
 *   nobody knows what; a quote that went cold is worth the quoted figure,
 *   because somebody said it out loud. So `valueCents` is populated only from
 *   a real quote, and is null everywhere else — rather than multiplying a
 *   missed call by an average job value to produce a large, satisfying,
 *   fabricated number. `leak.ts` makes the same choice on the marketing side,
 *   and for the same reason.
 *
 * BLUEPRINTS
 *   Pure. Records and a clock in, findings out.
 */

import { CONTACTED_OUTCOMES, type CallOutcome } from "./taxonomy";

export type Direction = "INBOUND" | "OUTBOUND";
export type Channel = "CALL" | "SMS" | "EMAIL" | "CHAT";

/** One conversation, reduced to what the leak rules need. */
export interface ConversationRecord {
  id: string;
  /** Groups conversations with the same person. A phone number, usually. */
  contactKey: string;
  direction: Direction;
  channel: Channel;
  startedAt: Date;
  outcome: CallOutcome;
  quotedCents: number | null;
  nextStepAgreed: boolean;
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

/**
 * How long a missed inbound call may go unreturned before it is a leak.
 *
 * Deliberately short. The evidence every trade body publishes on this points
 * the same way — the first business to call back usually wins — and a window
 * generous enough to never embarrass anybody is a window that reports nothing
 * while the leads are still worth chasing.
 */
export const CALLBACK_WINDOW_MINUTES = 60;

/** A quote nobody has touched since. */
export const QUOTE_FOLLOWUP_HOURS = 48;

/** A promised callback that never happened. */
export const PROMISE_WINDOW_HOURS = 24;

export type LeakKind =
  | "MISSED_NO_CALLBACK"
  | "PROMISE_BROKEN"
  | "QUOTE_COLD"
  | "REPEAT_MISSED";

export type LeakSeverity = "CRITICAL" | "WARNING";

export interface Leak {
  kind: LeakKind;
  severity: LeakSeverity;
  contactKey: string;
  /** The conversation that started the problem. */
  conversationId: string;
  occurredAt: Date;
  ageHours: number;
  /** Only ever a figure somebody actually said. Null otherwise — never estimated. */
  valueCents: number | null;
  detail: string;
}

const MS_PER_HOUR = 3_600_000;

function hoursBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / MS_PER_HOUR;
}

/** Group by contact, each group sorted oldest first. */
function byContact(records: ConversationRecord[]): Map<string, ConversationRecord[]> {
  const out = new Map<string, ConversationRecord[]>();
  for (const r of records) {
    const list = out.get(r.contactKey);
    if (list) list.push(r);
    else out.set(r.contactKey, [r]);
  }
  for (const list of out.values()) {
    list.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  }
  return out;
}

/**
 * Pure: every leak in the book, worst first.
 *
 * A conversation can only produce one leak. Reporting a missed call, then the
 * broken promise to ring back, then the cold quote from the same thread turns
 * one lost customer into three tasks, and a list that inflates is a list
 * people stop working.
 */
export function findLeaks(records: ConversationRecord[], now = new Date()): Leak[] {
  const leaks: Leak[] = [];

  for (const [contactKey, thread] of byContact(records)) {
    // Only look at the tail. A missed call in March that was returned in March
    // is not a leak, and the state that matters is where the thread stands now.
    const last = thread[thread.length - 1];
    const age = hoursBetween(last.startedAt, now);

    // Did anything happen after this record? If so the thread moved on.
    const missedInbound =
      last.direction === "INBOUND" && last.outcome === "NO_ANSWER";

    if (missedInbound && age * 60 >= CALLBACK_WINDOW_MINUTES) {
      // Somebody who has rung more than once and been missed every time is a
      // different, worse problem than a single missed call — they are actively
      // trying to give this business money.
      const missedCount = thread.filter(
        (r) => r.direction === "INBOUND" && r.outcome === "NO_ANSWER",
      ).length;
      const repeat = missedCount > 1;

      leaks.push({
        kind: repeat ? "REPEAT_MISSED" : "MISSED_NO_CALLBACK",
        severity: "CRITICAL",
        contactKey,
        conversationId: last.id,
        occurredAt: last.startedAt,
        ageHours: age,
        valueCents: null,
        detail: repeat
          ? `Rang ${missedCount} times and got through none of them. Nothing has gone back the other way.`
          : `Rang ${Math.round(age)}h ago, nobody picked up, and nobody has called back.`,
      });
      continue;
    }

    if (last.outcome === "CALLBACK_PROMISED" && age >= PROMISE_WINDOW_HOURS) {
      leaks.push({
        kind: "PROMISE_BROKEN",
        severity: "CRITICAL",
        contactKey,
        conversationId: last.id,
        occurredAt: last.startedAt,
        ageHours: age,
        valueCents: last.quotedCents,
        detail: `Someone here promised to come back to them ${Math.round(age / 24)} day${
          Math.round(age / 24) === 1 ? "" : "s"
        } ago and has not.`,
      });
      continue;
    }

    if (last.outcome === "QUOTED" && age >= QUOTE_FOLLOWUP_HOURS) {
      leaks.push({
        kind: "QUOTE_COLD",
        severity: "WARNING",
        contactKey,
        conversationId: last.id,
        occurredAt: last.startedAt,
        ageHours: age,
        // The one place a figure is legitimate: they were quoted this.
        valueCents: last.quotedCents,
        detail: last.quotedCents
          ? `Quoted and untouched for ${Math.round(age / 24)} days.`
          : `A price was discussed ${Math.round(age / 24)} days ago and nothing has happened since.`,
      });
    }
  }

  // Critical before warning, then oldest first — an older leak is a colder one.
  const rank: Record<LeakSeverity, number> = { CRITICAL: 0, WARNING: 1 };
  return leaks.sort((a, b) => {
    if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
    return b.ageHours - a.ageHours;
  });
}

/**
 * Pure: the total a client can be told is sitting in the leak list.
 *
 * Only quoted figures are summed, and the count of leaks with no figure is
 * returned alongside — so the sentence reads "$14,200 across 3 quotes, plus 9
 * more we cannot put a number on" rather than a single total that quietly
 * pretends the unpriced ones are worth nothing.
 */
export function leakValue(leaks: Leak[]): { knownCents: number; unpriced: number } {
  return {
    knownCents: leaks.reduce((n, l) => n + (l.valueCents ?? 0), 0),
    unpriced: leaks.filter((l) => l.valueCents == null).length,
  };
}

// ---------------------------------------------------------------------------
// Answer rate — the number that explains the leaks
// ---------------------------------------------------------------------------

export interface AnswerStats {
  inbound: number;
  answered: number;
  /** 0..1. Null when there were no inbound conversations to measure. */
  rate: number | null;
  /** Inbound calls that were missed and never returned. */
  unreturned: number;
}

/**
 * Pure: how often this business actually picks up.
 *
 * Reported next to cost-per-lead, because the two multiply. An account paying
 * to generate leads while answering two thirds of them is paying half again
 * for every booked job, and that is a fact about the front desk that no amount
 * of media buying will fix — which is exactly why an agency should be the one
 * to say it.
 */
export function answerStats(records: ConversationRecord[], now = new Date()): AnswerStats {
  const inbound = records.filter((r) => r.direction === "INBOUND");
  const answered = inbound.filter((r) => CONTACTED_OUTCOMES.includes(r.outcome));
  const leaks = findLeaks(records, now);

  return {
    inbound: inbound.length,
    answered: answered.length,
    rate: inbound.length === 0 ? null : answered.length / inbound.length,
    unreturned: leaks.filter(
      (l) => l.kind === "MISSED_NO_CALLBACK" || l.kind === "REPEAT_MISSED",
    ).length,
  };
}

// ---------------------------------------------------------------------------
// What was actually said
// ---------------------------------------------------------------------------

export interface Turn {
  speaker: "CUSTOMER" | "BUSINESS";
  text: string;
}

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export interface TalkStats {
  /** Share of words spoken by the business, 0..1. Null if nothing was said. */
  businessShare: number | null;
  /** Questions the business asked. */
  questionsAsked: number;
  turns: number;
}

/**
 * Pure: the two numbers that separate a conversation from a pitch.
 *
 * Reported without a target attached. Every sales book publishes a different
 * ideal talk ratio and none of them were measured on roofing calls in Arizona,
 * so inventing a bar here would be exactly the fabricated statistic the rest of
 * this codebase refuses to print. The number is shown; whether it is a problem
 * is a conversation for a human who has listened to the call.
 */
export function talkStats(turns: Turn[]): TalkStats {
  const total = turns.reduce((n, t) => n + words(t.text), 0);
  const business = turns
    .filter((t) => t.speaker === "BUSINESS")
    .reduce((n, t) => n + words(t.text), 0);

  return {
    businessShare: total === 0 ? null : business / total,
    questionsAsked: turns.filter((t) => t.speaker === "BUSINESS" && t.text.includes("?")).length,
    turns: turns.length,
  };
}
