/**
 * THE SCOREBOARD — what the crew actually did, from the client's own rows.
 *
 * DIRECTION
 *   Everything sold on this site is sold without an outcome claim, on purpose:
 *   the parent labels every figure on its results page "representative" and
 *   says the case studies aren't up yet, and `upgrades.test.ts` fails any copy
 *   quoting a percentage or a multiple. That is the right posture for a page
 *   selling to strangers.
 *
 *   It is the wrong posture for a client who has been running the crew for two
 *   months. They are owed a number. The difference is that theirs is not a
 *   claim about our product — it is a count of things that happened in their
 *   own account, which they can go and check row by row.
 *
 *   So this file has exactly one rule, and it is the same one `leak.ts` follows:
 *
 *     EVERY FIGURE HERE IS THE CLIENT'S OWN DATA COUNTED. Nothing is modelled,
 *     extrapolated, benchmarked, or multiplied by an assumed close rate.
 *
 * THE HARD PART: "WOULD HAVE BEEN MISSED"
 *   The number the crew is really being bought for is "calls that would have
 *   rung out". That is a counterfactual, and counterfactuals are where honest
 *   reporting goes to die — the tempting move is to assume some share of
 *   answered calls would have been missed and quietly pick a percentage.
 *
 *   There is one case where it is not a guess. A call that arrived outside the
 *   hours the business itself says it works had nobody there to answer it. That
 *   is not an assumption about human behaviour, it is the client's own working
 *   week compared against the call's own timestamp, and both are facts they
 *   entered. `wouldHaveBeenMissed` counts exactly those and nothing else.
 *
 *   Calls answered *during* working hours are deliberately excluded even though
 *   some of them would genuinely have been missed. Undercounting in our own
 *   disfavour is the only bias this file is allowed to have.
 *
 * MONEY
 *   Only ever from `DealOutcome` rows the client logged themselves. If they
 *   have logged nothing, the scoreboard says so rather than inferring a value
 *   from an average job size — see `attribution`, which returns null rather
 *   than zero, because zero reads as "it earned nothing" and null reads as
 *   "you haven't told us", which are very different sentences.
 *
 * NO DATABASE, NO MODEL. Rows in, counts out.
 */

import { withinHours, type AvailabilityRule } from "@/lib/booking";

export type CountedCallOutcome =
  | "IN_PROGRESS"
  | "QUALIFIED"
  | "BOOKED"
  | "ESTIMATE_REQUESTED"
  | "MESSAGE"
  | "TRANSFERRED"
  | "MISSED"
  | "VOICEMAIL"
  | "FAILED";

export interface ScoredCall {
  direction: "INBOUND" | "OUTBOUND";
  outcome: CountedCallOutcome;
  startedAt: Date;
  /** Roughly how long it ran. Used only to bound the "was anyone there" check. */
  durationSeconds?: number | null;
  textBackSentAt?: Date | null;
}

export interface ScoredEstimate {
  status: string;
  createdAt: Date;
  sentAt?: Date | null;
  totalCents: number;
}

export interface ScoredBooking {
  source: "PHONE" | "WEB" | "MANUAL" | "ESTIMATE";
  status: string;
  startsAt: Date;
  createdAt: Date;
}

/** Only what the client logged themselves. Never inferred. */
export interface LoggedOutcome {
  kind: "WON" | "LOST";
  valueCents?: number | null;
  createdAt: Date;
}

export interface ScoreboardInput {
  calls: ScoredCall[];
  estimates: ScoredEstimate[];
  bookings: ScoredBooking[];
  outcomes: LoggedOutcome[];
  /** The client's own working week. */
  hours: AvailabilityRule[];
  timeZone: string;
}

/**
 * A call nobody was there for.
 *
 * The one defensible counterfactual in the product: the business's own stated
 * hours, against the call's own timestamp. Both are facts the client entered.
 *
 * Uses a nominal one-minute window rather than the call's real duration —
 * a long call that *started* five minutes before closing was still answered by
 * somebody who had gone home, and stretching the window by the call length
 * would start counting in-hours calls as out-of-hours ones.
 */
export function wouldHaveBeenMissed(
  call: ScoredCall,
  hours: AvailabilityRule[],
  timeZone: string,
): boolean {
  if (call.direction !== "INBOUND") return false;
  if (!WAS_ANSWERED.includes(call.outcome)) return false;
  if (hours.length === 0) return false; // No stated hours means no claim to make.

  const slot = {
    start: call.startedAt,
    end: new Date(call.startedAt.getTime() + 60_000),
  };
  return !withinHours(slot, hours, timeZone);
}

const WAS_ANSWERED: CountedCallOutcome[] = [
  "QUALIFIED",
  "BOOKED",
  "ESTIMATE_REQUESTED",
  "MESSAGE",
  "TRANSFERRED",
];

const WAS_UNANSWERED: CountedCallOutcome[] = ["MISSED", "VOICEMAIL"];

export interface Scoreboard {
  /** Inbound calls the crew handled. */
  answered: number;
  /**
   * Of those, the ones that arrived when the business was shut. The honest
   * core of the whole page.
   */
  outsideHours: number;
  /** Inbound calls nobody reached. Shown, because the leak is the point. */
  stillMissed: number;
  /** Missed calls where a recovery text went out. Reopened, not recovered. */
  reopened: number;

  estimatesSent: number;
  /** Sent within a day of being raised. The Job Runner's actual promise. */
  sentSameDay: number;
  estimatesAccepted: number;

  booked: number;
  /** Taken during a call rather than needing anybody to ring back. */
  bookedOnTheCall: number;
  /** Booked and then not cancelled. */
  bookingsHeld: number;

  /** Null when the client has logged nothing. Never zero-by-default. */
  attribution: Attribution | null;
}

export interface Attribution {
  won: number;
  lost: number;
  /** Null when outcomes were logged but none carried a value. */
  wonValueCents: number | null;
}

const DAY_MS = 86_400_000;

/** Count it all. Pure, and every field is a count of rows. */
export function scoreboard(input: ScoreboardInput): Scoreboard {
  const inbound = input.calls.filter((c) => c.direction === "INBOUND");

  const answered = inbound.filter((c) => WAS_ANSWERED.includes(c.outcome));
  const missed = inbound.filter((c) => WAS_UNANSWERED.includes(c.outcome));

  const sent = input.estimates.filter((e) => e.sentAt);
  const sentSameDay = sent.filter(
    (e) => e.sentAt!.getTime() - e.createdAt.getTime() <= DAY_MS,
  );

  const live = input.bookings.filter((b) => b.status !== "CANCELLED");

  return {
    answered: answered.length,
    outsideHours: answered.filter((c) => wouldHaveBeenMissed(c, input.hours, input.timeZone))
      .length,
    stillMissed: missed.length,
    reopened: missed.filter((c) => c.textBackSentAt).length,

    estimatesSent: sent.length,
    sentSameDay: sentSameDay.length,
    estimatesAccepted: input.estimates.filter((e) => e.status === "ACCEPTED").length,

    booked: input.bookings.length,
    bookedOnTheCall: input.bookings.filter((b) => b.source === "PHONE").length,
    bookingsHeld: live.length,

    attribution: attributionOf(input.outcomes),
  };
}

/**
 * What the client's own logged deals say.
 *
 * Returns null when nothing has been logged — deliberately not a zeroed object.
 * Zero reads as "it earned nothing"; null reads as "you haven't told us yet",
 * and those are very different sentences to put in front of somebody deciding
 * whether to keep paying.
 */
export function attributionOf(outcomes: LoggedOutcome[]): Attribution | null {
  if (outcomes.length === 0) return null;

  const won = outcomes.filter((o) => o.kind === "WON");
  const valued = won.filter((o) => typeof o.valueCents === "number" && o.valueCents! > 0);

  return {
    won: won.length,
    lost: outcomes.filter((o) => o.kind === "LOST").length,
    // Null rather than 0 for the same reason as above: deals logged with no
    // value are not deals worth nothing.
    wonValueCents: valued.length > 0 ? valued.reduce((n, o) => n + (o.valueCents ?? 0), 0) : null,
  };
}

export interface Headline {
  /** The number. */
  value: number;
  label: string;
  /** How it was arrived at, in the client's own terms. Always shown. */
  basis: string;
}

/**
 * The three figures the hub leads with, each carrying its own derivation.
 *
 * `basis` is not optional and is not a tooltip. A number on a dashboard with no
 * stated method is a number a client eventually stops believing, and the whole
 * argument of this platform is that its arithmetic can be pointed at.
 */
export function headlines(s: Scoreboard): Headline[] {
  return [
    {
      value: s.outsideHours,
      label: "answered when you were shut",
      basis:
        "Inbound calls the crew handled at a time outside the working hours you set. Nobody was there to take these.",
    },
    {
      value: s.sentSameDay,
      label: "prices out the same day",
      basis: "Estimates sent within a day of the job being raised.",
    },
    {
      value: s.bookedOnTheCall,
      label: "booked without a callback",
      basis: "Appointments taken during the call itself, rather than needing somebody to ring back.",
    },
  ];
}

/**
 * The honest negative, stated as plainly as the positives.
 *
 * A scoreboard that only counts wins is marketing. This one names what is still
 * leaking, and returns null only when there is genuinely nothing to report.
 */
export function stillLeaking(s: Scoreboard): string | null {
  if (s.stillMissed === 0) return null;
  const unrecovered = s.stillMissed - s.reopened;
  if (unrecovered <= 0) {
    return `${s.stillMissed} call${s.stillMissed === 1 ? "" : "s"} rang out, and every one got a recovery text.`;
  }
  return `${unrecovered} call${unrecovered === 1 ? "" : "s"} rang out with no recovery text sent. That is still a leak.`;
}
