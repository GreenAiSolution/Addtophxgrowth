/**
 * THE DIARY — what the operator is allowed to put in it.
 *
 * DIRECTION
 *   "Qualification, quoting rules and calendar booking handled on the call."
 *   Booking is the half of that promise with the sharpest failure mode: a
 *   customer told Thursday at nine who nobody turns up for costs more than a
 *   missed call ever did, because they cleared their morning for it.
 *
 * THE LOAD-BEARING IDEA — the same one as pricing
 *   The model never picks a time. This file computes the next few genuinely
 *   available slots, the prompt is told it may offer exactly those, and when the
 *   caller agrees the chosen slot is checked against the offered list again
 *   before anything is written. A model that invents "how about Sunday at 7pm"
 *   produces a rejected slot and a re-offer, not an appointment.
 *
 *   Everything here is pure. `booking-store.ts` does the reads and writes.
 */

import { z } from "zod";

/** 0 = Sunday, matching JS `getUTCDay`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const calendarSchema = z.object({
  /** Minutes to add to UTC for this business. Phoenix is -420. */
  utcOffsetMinutes: z.number().int().min(-840).max(840).default(-420),
  /** Days the business will book. */
  days: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
  /** Local hour the first slot starts, and the hour after which none start. */
  startHour: z.number().int().min(0).max(23).default(8),
  endHour: z.number().int().min(1).max(24).default(16),
  /** How long one visit blocks the diary. */
  slotMinutes: z.number().int().min(15).max(480).default(60),
  /**
   * How soon the earliest offer may be.
   *
   * The default is deliberately not zero. A crew already on the road cannot be
   * at a new address in ten minutes, and an operator that offers it books an
   * appointment the business will miss.
   */
  leadTimeHours: z.number().int().min(0).max(168).default(4),
  /** How far ahead it will offer. Beyond this a human takes the booking. */
  horizonDays: z.number().int().min(1).max(120).default(14),
  /** Hard cap per day, whatever the diary looks like. */
  maxPerDay: z.number().int().min(1).max(50).default(6),
  /** ISO dates (YYYY-MM-DD, local) the business is closed. */
  blackoutDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(120).default([]),
  /** Shown to the caller with every offer. */
  note: z.string().max(200).default(""),
});
export type Calendar = z.infer<typeof calendarSchema>;

export function defaultCalendar(): Calendar {
  return calendarSchema.parse({});
}

export interface Appointment {
  /** Start of the visit, in UTC. */
  at: Date;
  minutes: number;
}

export interface Slot {
  /** UTC instant the visit starts. */
  at: Date;
  minutes: number;
  /** Exactly how the operator is allowed to say it out loud. */
  spoken: string;
  /** Stable id the model echoes back. Cheaper to validate than a date string. */
  key: string;
}

/** Local wall-clock parts for an instant, given a fixed offset. */
function local(at: Date, offsetMinutes: number) {
  const d = new Date(at.getTime() + offsetMinutes * 60_000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay() as Weekday,
    isoDate: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
      d.getUTCDate(),
    ).padStart(2, "0")}`,
  };
}

/** Build the UTC instant for a local wall-clock time. */
function utcFor(
  parts: { year: number; month: number; day: number; hour: number; minute: number },
  offsetMinutes: number,
): Date {
  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) -
      offsetMinutes * 60_000,
  );
}

/**
 * How a person says a time out loud.
 *
 * "Thursday the 6th at 9am" — not an ISO string, not "09:00", and never a year.
 * A voice operator reading back "2026-08-06T09:00:00Z" is the fastest way to
 * sound like software.
 */
export function speakSlot(at: Date, offsetMinutes: number, now = new Date()): string {
  const l = local(at, offsetMinutes);
  const today = local(now, offsetMinutes);
  const hour12 = l.hour % 12 === 0 ? 12 : l.hour % 12;
  const ampm = l.hour < 12 ? "am" : "pm";
  const time = l.minute ? `${hour12}:${String(l.minute).padStart(2, "0")}${ampm}` : `${hour12}${ampm}`;

  const dayDiff = Math.round(
    (utcFor({ ...l, hour: 12, minute: 0 }, offsetMinutes).getTime() -
      utcFor({ ...today, hour: 12, minute: 0 }, offsetMinutes).getTime()) /
      86_400_000,
  );
  if (dayDiff === 0) return `today at ${time}`;
  if (dayDiff === 1) return `tomorrow at ${time}`;

  const ordinal =
    l.day % 10 === 1 && l.day !== 11
      ? "st"
      : l.day % 10 === 2 && l.day !== 12
        ? "nd"
        : l.day % 10 === 3 && l.day !== 13
          ? "rd"
          : "th";
  return `${WEEKDAY_NAMES[l.weekday]} the ${l.day}${ordinal} at ${time}`;
}

export function slotKey(at: Date): string {
  return at.toISOString().slice(0, 16).replace(/[-:T]/g, "");
}

/**
 * The next available slots, in order.
 *
 * Walks forward in slot-sized steps from the lead time rather than generating a
 * grid and filtering it, so a long horizon costs nothing when the diary is busy
 * — the loop stops as soon as it has what it was asked for.
 */
export function nextSlots(
  cal: Calendar,
  booked: Appointment[],
  opts: { count?: number; now?: Date } = {},
): Slot[] {
  const count = opts.count ?? 3;
  const now = opts.now ?? new Date();
  const out: Slot[] = [];

  const earliest = new Date(now.getTime() + cal.leadTimeHours * 3_600_000);
  const limit = new Date(now.getTime() + cal.horizonDays * 86_400_000);

  // Start at the top of the next slot boundary at or after the lead time.
  const first = local(earliest, cal.utcOffsetMinutes);
  let cursor = utcFor({ ...first, minute: 0 }, cal.utcOffsetMinutes);
  if (cursor < earliest) cursor = new Date(cursor.getTime() + 3_600_000);

  const perDay = new Map<string, number>();
  for (const b of booked) {
    const key = local(b.at, cal.utcOffsetMinutes).isoDate;
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }

  // Bounded: a horizon of 120 days at 15-minute slots is the worst case, and
  // the loop exits early on `count`. The cap is a backstop against a calendar
  // that can never produce a slot (every day blacked out, say) spinning here.
  for (let i = 0; i < 20_000 && out.length < count && cursor < limit; i++) {
    const l = local(cursor, cal.utcOffsetMinutes);
    const dayCount = perDay.get(l.isoDate) ?? 0;

    const openDay = cal.days.includes(l.weekday) && !cal.blackoutDates.includes(l.isoDate);
    const inHours = l.hour >= cal.startHour && l.hour < cal.endHour;
    const hasRoom = dayCount < cal.maxPerDay;
    const clashes = booked.some((b) => overlaps(cursor, cal.slotMinutes, b));

    if (openDay && inHours && hasRoom && !clashes) {
      out.push({
        at: new Date(cursor),
        minutes: cal.slotMinutes,
        spoken: speakSlot(cursor, cal.utcOffsetMinutes, now),
        key: slotKey(cursor),
      });
      perDay.set(l.isoDate, dayCount + 1);
      cursor = new Date(cursor.getTime() + cal.slotMinutes * 60_000);
      continue;
    }

    // Jump to the next open hour rather than crawling minute by minute.
    if (!openDay || l.hour >= cal.endHour || !hasRoom) {
      const nextDay = utcFor(
        { ...l, day: l.day + 1, hour: cal.startHour, minute: 0 },
        cal.utcOffsetMinutes,
      );
      cursor = nextDay;
      continue;
    }
    if (l.hour < cal.startHour) {
      cursor = utcFor({ ...l, hour: cal.startHour, minute: 0 }, cal.utcOffsetMinutes);
      continue;
    }
    cursor = new Date(cursor.getTime() + cal.slotMinutes * 60_000);
  }

  return out;
}

function overlaps(start: Date, minutes: number, appt: Appointment): boolean {
  const end = start.getTime() + minutes * 60_000;
  const apptEnd = appt.at.getTime() + appt.minutes * 60_000;
  return start.getTime() < apptEnd && appt.at.getTime() < end;
}

export type BookVerdict =
  | { ok: true; slot: Slot }
  | { ok: false; why: string; spoken: string; offer: Slot[] };

/**
 * Confirm a slot the caller agreed to.
 *
 * Checked against the slots that were actually offered on this call, not
 * recomputed from the calendar — because between offering and confirming, the
 * model may have paraphrased, and the only time the operator is allowed to book
 * is one it read out loud.
 */
export function confirmSlot(
  offered: Slot[],
  chosenKey: string,
  cal: Calendar,
  booked: Appointment[],
  now = new Date(),
): BookVerdict {
  const slot = offered.find((s) => s.key === chosenKey);
  if (!slot) {
    const offer = nextSlots(cal, booked, { now });
    return {
      ok: false,
      why: `"${chosenKey}" was never offered on this call`,
      spoken: offer.length
        ? `Let me give you what I've actually got — ${offer.map((s) => s.spoken).join(", or ")}.`
        : "I don't have anything I can promise you — let me have somebody ring you to sort a time.",
      offer,
    };
  }

  // The diary can move between the offer and the confirmation on a long call.
  if (booked.some((b) => overlaps(slot.at, slot.minutes, b))) {
    const offer = nextSlots(cal, booked, { now });
    return {
      ok: false,
      why: "that slot was taken while we were talking",
      spoken: offer.length
        ? `That one's just gone, sorry — I can do ${offer.map((s) => s.spoken).join(", or ")}.`
        : "That one's just gone and I've nothing else today — let me have somebody ring you.",
      offer,
    };
  }

  if (slot.at.getTime() < now.getTime() + cal.leadTimeHours * 3_600_000) {
    const offer = nextSlots(cal, booked, { now });
    return {
      ok: false,
      why: "inside the lead time",
      spoken: offer.length
        ? `I can't promise that one at this notice — ${offer.map((s) => s.spoken).join(", or ")}?`
        : "I can't promise a time that soon — let me have somebody ring you straight back.",
      offer,
    };
  }

  return { ok: true, slot };
}

/** The line the operator is permitted to say when offering times. */
export function offerLine(slots: Slot[], note?: string): string {
  if (!slots.length) {
    return "I haven't got a slot I can promise you — let me take your details and have somebody ring you to arrange it.";
  }
  const list =
    slots.length === 1
      ? slots[0]!.spoken
      : `${slots.slice(0, -1).map((s) => s.spoken).join(", ")} or ${slots.at(-1)!.spoken}`;
  return `I can do ${list}.${note?.trim() ? ` ${note.trim()}` : ""}`;
}
