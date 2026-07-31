/**
 * THE BOOKER — Dispatch, and the slot that is genuinely free.
 *
 * DIRECTION
 *   The leak: the customer says yes, somebody promises to ring back about a
 *   time, and the ringing back is what never happens. A yes has to become a
 *   date in the diary during the conversation it was said in, because that is
 *   the only moment it is reliably still a yes.
 *
 * WHY THIS FILE IS LONGER THAN IT LOOKS LIKE IT SHOULD BE
 *   "Offer some free slots" is a one-liner until you write down what free
 *   means, and then it is four separate rules that all have to hold at once:
 *
 *     1. Inside hours the business actually works.
 *     2. Not overlapping anything already in the diary — including jobs put
 *        there by hand, which is the case a naive implementation misses because
 *        it only knows about its own bookings.
 *     3. Far enough ahead to be real. Offering a slot in nine minutes is how a
 *        van ends up double-booked across town.
 *     4. Not so far ahead that it is a guess about a month nobody has planned.
 *
 * TIME ZONES, AND WHY THERE IS NO OFFSET COLUMN
 *   A trade's working hours are local — "eight until five" means eight until
 *   five in their town, in January and in July. Storing a fixed offset gets
 *   that right for half the year and then silently books everybody an hour
 *   early, and the failure is invisible in Phoenix (no DST) which is exactly
 *   where it would ship from without being noticed.
 *
 *   So this works in an IANA zone and converts through `Intl`, which knows the
 *   rules and updates with the platform. `zonedToUtc` uses the standard
 *   two-pass correction: guess, read the real offset at the guess, correct.
 *   The ambiguous hour when clocks go back resolves to one of its two possible
 *   instants rather than erroring — a booking in that hour is rare, and refusing
 *   to offer any slot that morning would be the worse failure.
 *
 * NO DATABASE, NO MODEL, NO AMBIENT CLOCK. `now` is always passed in, because
 * "can this be booked yet" is the one question that must be testable without
 * waiting.
 */

export interface AvailabilityRule {
  /** 0 = Sunday, matching JavaScript's own getDay. */
  weekday: number;
  /** Minutes from local midnight. 8am = 480. */
  startMinute: number;
  /** Exclusive. 5pm = 1020. */
  endMinute: number;
}

export interface Interval {
  start: Date;
  end: Date;
}

export interface Slot {
  start: Date;
  end: Date;
}

/** Two intervals share time. Touching end-to-start does not count. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Free of everything already in the diary. */
export function isFree(slot: Interval, busy: Interval[]): boolean {
  return !busy.some((b) => overlaps(slot, b));
}

/**
 * The zone's offset from UTC at a given instant, in milliseconds.
 *
 * Derived by asking `Intl` what the wall clock reads there and subtracting.
 * Uses `en-CA` because it formats as YYYY-MM-DD, which parses unambiguously —
 * a detail worth stating, since the obvious `en-US` gives MM/DD/YYYY and breaks
 * the moment anybody runs this in a different default locale.
 */
export function tzOffsetMs(at: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(at).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  // Hour 24 is how some engines render midnight. Date.UTC handles it, but
  // normalising keeps the arithmetic obvious.
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - at.getTime();
}

/**
 * A local wall-clock time in a zone, as an instant.
 *
 * Two passes: guess that local is UTC, read the real offset at that guess, then
 * correct using the offset that actually applies at the corrected instant. One
 * pass is wrong across a DST boundary; two is right everywhere except the
 * ambiguous repeated hour, which resolves to one of its two instants.
 */
export function zonedToUtc(
  year: number,
  month: number,
  day: number,
  minutes: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0) + minutes * 60_000;
  const firstOffset = tzOffsetMs(new Date(guess), timeZone);
  const corrected = guess - firstOffset;
  const secondOffset = tzOffsetMs(new Date(corrected), timeZone);
  return new Date(guess - secondOffset);
}

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  weekday: number;
  minutes: number;
}

/** What the clock and calendar read in `timeZone` at this instant. */
export function localPartsOf(at: Date, timeZone: string): LocalParts {
  const shifted = new Date(at.getTime() + tzOffsetMs(at, timeZone));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/**
 * How soon a slot may be. Offering one in nine minutes is how a van ends up
 * double-booked across town.
 */
export const DEFAULT_LEAD_MINUTES = 120;

/** How far ahead to offer. Beyond this it is a guess about an unplanned month. */
export const DEFAULT_HORIZON_DAYS = 21;

export interface FindSlotsInput {
  rules: AvailabilityRule[];
  busy: Interval[];
  /** IANA zone, e.g. "America/Phoenix". */
  timeZone: string;
  durationMinutes: number;
  now: Date;
  leadMinutes?: number;
  horizonDays?: number;
  /** Cap the answer. A customer choosing from ninety options chooses none. */
  limit?: number;
  /** Slot boundaries, from the start of each open window. */
  stepMinutes?: number;
}

/**
 * Every slot that is genuinely bookable, soonest first.
 *
 * Walks local days rather than UTC hours, so a slot always lands on a sensible
 * local boundary — nine o'clock, not nine-thirty-seven because the window
 * happened to start at an odd UTC offset.
 */
export function findSlots(input: FindSlotsInput): Slot[] {
  const duration = Math.floor(input.durationMinutes);
  if (!Number.isFinite(duration) || duration <= 0) return [];

  const lead = input.leadMinutes ?? DEFAULT_LEAD_MINUTES;
  const horizon = input.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const limit = input.limit ?? 12;
  const step = input.stepMinutes && input.stepMinutes > 0 ? input.stepMinutes : duration;

  const earliest = new Date(input.now.getTime() + Math.max(0, lead) * 60_000);
  const latest = new Date(input.now.getTime() + Math.max(1, horizon) * 86_400_000);

  const byWeekday = new Map<number, AvailabilityRule[]>();
  for (const r of input.rules) {
    if (r.endMinute <= r.startMinute) continue; // A window that ends before it starts is not one.
    const list = byWeekday.get(r.weekday) ?? [];
    list.push(r);
    byWeekday.set(r.weekday, list);
  }
  if (byWeekday.size === 0) return [];

  const out: Slot[] = [];

  // Start from the local day `earliest` falls in, and walk forward a day at a
  // time. Walking local days is what keeps slots on local boundaries.
  const startParts = localPartsOf(earliest, input.timeZone);
  let cursor = Date.UTC(startParts.year, startParts.month - 1, startParts.day);

  for (let d = 0; d <= horizon + 1 && out.length < limit; d++) {
    const day = new Date(cursor + d * 86_400_000);
    const year = day.getUTCFullYear();
    const month = day.getUTCMonth() + 1;
    const date = day.getUTCDate();
    const weekday = day.getUTCDay();

    for (const rule of byWeekday.get(weekday) ?? []) {
      for (let m = rule.startMinute; m + duration <= rule.endMinute; m += step) {
        if (out.length >= limit) break;

        const start = zonedToUtc(year, month, date, m, input.timeZone);
        const end = new Date(start.getTime() + duration * 60_000);

        if (start < earliest) continue;
        if (start > latest) continue;
        if (!isFree({ start, end }, input.busy)) continue;

        out.push({ start, end });
      }
    }
  }

  return out.sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, limit);
}

export type BookVerdict = { ok: true } | { ok: false; why: string };

export interface CanBookInput {
  slot: Interval;
  busy: Interval[];
  rules: AvailabilityRule[];
  timeZone: string;
  now: Date;
  leadMinutes?: number;
  horizonDays?: number;
}

/**
 * Whether this exact slot may be taken, re-checked at the moment of booking.
 *
 * Not the same call as `findSlots`, and it is not redundant. A customer reads a
 * list of times and then thinks about it for four minutes; in those four
 * minutes somebody else can take the slot, or the lead window can close on it.
 * Trusting the list the browser was handed is how two customers get told the
 * same nine o'clock is theirs.
 */
export function canBook(input: CanBookInput): BookVerdict {
  const { slot, now } = input;

  if (!(slot.start instanceof Date) || Number.isNaN(slot.start.getTime())) {
    return { ok: false, why: "That is not a real time." };
  }
  if (slot.end <= slot.start) {
    return { ok: false, why: "That appointment ends before it starts." };
  }

  const lead = input.leadMinutes ?? DEFAULT_LEAD_MINUTES;
  const earliest = new Date(now.getTime() + Math.max(0, lead) * 60_000);
  if (slot.start < earliest) {
    return {
      ok: false,
      why:
        slot.start < now
          ? "That time has already passed."
          : `We need at least ${lead} minutes' notice.`,
    };
  }

  const horizon = input.horizonDays ?? DEFAULT_HORIZON_DAYS;
  if (slot.start > new Date(now.getTime() + horizon * 86_400_000)) {
    return { ok: false, why: `We are only booking ${horizon} days ahead at the moment.` };
  }

  if (!withinHours(slot, input.rules, input.timeZone)) {
    return { ok: false, why: "That is outside our working hours." };
  }

  if (!isFree(slot, input.busy)) {
    return { ok: false, why: "Somebody has just taken that slot." };
  }

  return { ok: true };
}

/**
 * The whole appointment sits inside one open window.
 *
 * Checks the end as well as the start, deliberately. A two-hour job starting at
 * half four on a five o'clock finish is inside the hours at the moment it
 * begins and an hour of unpaid overtime by the time it ends.
 */
export function withinHours(
  slot: Interval,
  rules: AvailabilityRule[],
  timeZone: string,
): boolean {
  const start = localPartsOf(slot.start, timeZone);
  // The end is measured in minutes from the *start's* midnight, so a slot
  // running to exactly midnight compares as 1440 rather than wrapping to 0.
  const lengthMinutes = Math.round((slot.end.getTime() - slot.start.getTime()) / 60_000);
  const endMinutes = start.minutes + lengthMinutes;

  return rules.some(
    (r) =>
      r.weekday === start.weekday &&
      r.endMinute > r.startMinute &&
      start.minutes >= r.startMinute &&
      endMinutes <= r.endMinute,
  );
}

/** A sensible default week: weekdays, eight until five. */
export const DEFAULT_HOURS: AvailabilityRule[] = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startMinute: 8 * 60,
  endMinute: 17 * 60,
}));

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** "8:00 am" from minutes past midnight. */
export function minutesToClock(minutes: number): string {
  const safe = Number.isFinite(minutes) ? Math.max(0, Math.min(1440, Math.floor(minutes))) : 0;
  const h24 = Math.floor(safe / 60);
  const m = safe % 60;
  const suffix = h24 >= 12 ? "pm" : "am";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** How a slot reads to a customer, in their business's own zone. */
export function describeSlot(slot: Slot, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(slot.start);
}

/**
 * When to remind somebody.
 *
 * The evening before, not the morning of — a customer who has forgotten needs
 * time to rearrange, and a reminder that arrives an hour before an appointment
 * they cannot now make is a notification about a loss rather than a way to
 * prevent one. Returns null when the appointment is too close for a reminder to
 * be anything but noise.
 */
export const REMIND_HOURS_BEFORE = 18;

export function remindAt(start: Date, now: Date): Date | null {
  const at = new Date(start.getTime() - REMIND_HOURS_BEFORE * 3_600_000);
  return at > now ? at : null;
}
