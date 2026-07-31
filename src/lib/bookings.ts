/**
 * THE BOOKER, wired up.
 *
 * `booking.ts` decides what is free. This file reads the diary, takes the slot,
 * and queues the reminder. Same split as the other two employees — nothing here
 * decides anything the pure layer has not already decided.
 *
 * THE RACE, AND WHY IT IS NOT SOLVED BY CHECKING HARDER
 *   Two customers open the booking page, both see nine o'clock, and both press
 *   it. Any amount of checking before the insert loses that race, because both
 *   checks pass before either row exists.
 *
 *   The database settles it. `slotKey` is non-null exactly while a booking
 *   holds its time, and `@@unique([clientId, slotKey])` makes the second insert
 *   fail rather than succeed. We catch that failure and tell the second
 *   customer the truth — somebody has just taken it — which is a far better
 *   outcome than two people being told the same slot is theirs and one of them
 *   finding out on the day.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { propose, registerExecutor } from "@/lib/gate";
import { notifyAgency } from "@/lib/notify";
import { sendSms } from "@/lib/switchboard";
import {
  DEFAULT_HOURS,
  canBook,
  describeSlot,
  findSlots,
  remindAt,
  type AvailabilityRule,
  type Interval,
  type Slot,
} from "@/lib/booking";

/** The client's working week, falling back to weekdays eight until five. */
export async function hoursFor(clientId: string): Promise<AvailabilityRule[]> {
  const rows = await prisma.availabilityRule.findMany({
    where: { clientId },
    orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
  });
  if (rows.length === 0) return DEFAULT_HOURS;
  return rows.map((r) => ({
    weekday: r.weekday,
    startMinute: r.startMinute,
    endMinute: r.endMinute,
  }));
}

/**
 * Everything already in the diary between two instants.
 *
 * Includes bookings made by hand, which is the case a booker that only knows
 * about its own appointments gets wrong — and gets wrong in the most expensive
 * direction, by sending somebody to a slot the owner had already promised.
 */
export async function busyFor(clientId: string, from: Date, to: Date): Promise<Interval[]> {
  const rows = await prisma.booking.findMany({
    where: {
      clientId,
      status: { in: ["BOOKED", "CONFIRMED"] },
      startsAt: { lt: to },
      endsAt: { gt: from },
    },
    select: { startsAt: true, endsAt: true },
  });
  return rows.map((r) => ({ start: r.startsAt, end: r.endsAt }));
}

export interface BookingSettings {
  timeZone: string;
  durationMinutes: number;
  leadMinutes: number;
  horizonDays: number;
}

export async function settingsFor(clientId: string): Promise<BookingSettings> {
  const c = await prisma.clientProfile.findUnique({
    where: { id: clientId },
    select: {
      timeZone: true,
      bookingDurationMinutes: true,
      bookingLeadMinutes: true,
      bookingHorizonDays: true,
    },
  });
  return {
    timeZone: c?.timeZone ?? "America/Phoenix",
    durationMinutes: c?.bookingDurationMinutes ?? 60,
    leadMinutes: c?.bookingLeadMinutes ?? 120,
    horizonDays: c?.bookingHorizonDays ?? 21,
  };
}

/** What to offer a customer, right now. */
export async function offerSlots(clientId: string, now = new Date(), limit = 12): Promise<Slot[]> {
  const settings = await settingsFor(clientId);
  const [rules, busy] = await Promise.all([
    hoursFor(clientId),
    busyFor(clientId, now, new Date(now.getTime() + settings.horizonDays * 86_400_000)),
  ]);

  return findSlots({
    rules,
    busy,
    timeZone: settings.timeZone,
    durationMinutes: settings.durationMinutes,
    leadMinutes: settings.leadMinutes,
    horizonDays: settings.horizonDays,
    now,
    limit,
  });
}

export interface TakeSlotInput {
  clientId: string;
  start: Date;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  address?: string | null;
  jobSummary?: string | null;
  source?: "PHONE" | "WEB" | "MANUAL" | "ESTIMATE";
  leadId?: string | null;
  callId?: string | null;
  estimateId?: string | null;
  now?: Date;
}

export type TakeSlotResult =
  | { booked: true; id: string; start: Date; end: Date }
  | { booked: false; why: string };

/**
 * Take the slot.
 *
 * Re-checks with `canBook` even though the customer picked from a list we
 * generated — the list is minutes old by the time they press it, and in those
 * minutes the slot can be taken or the notice window can close on it.
 */
export async function takeSlot(input: TakeSlotInput): Promise<TakeSlotResult> {
  const now = input.now ?? new Date();
  const settings = await settingsFor(input.clientId);
  const end = new Date(input.start.getTime() + settings.durationMinutes * 60_000);
  const slot = { start: input.start, end };

  const [rules, busy] = await Promise.all([
    hoursFor(input.clientId),
    busyFor(
      input.clientId,
      new Date(input.start.getTime() - 86_400_000),
      new Date(end.getTime() + 86_400_000),
    ),
  ]);

  const verdict = canBook({
    slot,
    busy,
    rules,
    timeZone: settings.timeZone,
    leadMinutes: settings.leadMinutes,
    horizonDays: settings.horizonDays,
    now,
  });
  if (!verdict.ok) return { booked: false, why: verdict.why };

  try {
    const booking = await prisma.booking.create({
      data: {
        clientId: input.clientId,
        customerName: input.customerName,
        customerPhone: input.customerPhone ?? null,
        customerEmail: input.customerEmail ?? null,
        address: input.address ?? null,
        jobSummary: input.jobSummary ?? null,
        startsAt: input.start,
        endsAt: end,
        // Non-null exactly while this booking holds the time. The unique index
        // on it is what actually settles the race.
        slotKey: input.start,
        source: input.source ?? "WEB",
        leadId: input.leadId ?? null,
        callId: input.callId ?? null,
        estimateId: input.estimateId ?? null,
        remindAt: remindAt(input.start, now),
      },
    });

    return { booked: true, id: booking.id, start: booking.startsAt, end: booking.endsAt };
  } catch (e) {
    // P2002 is the unique violation: somebody else's insert landed first.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { booked: false, why: "Somebody has just taken that slot." };
    }
    throw e;
  }
}

/**
 * Cancel, and release the slot.
 *
 * Nulling `slotKey` is what frees the time for somebody else. Doing it in the
 * same update as the status is deliberate: a cancelled booking still holding
 * its key would block the slot forever, and nobody would ever work out why that
 * one nine o'clock could not be booked.
 */
export async function cancelBooking(id: string, reason?: string, now = new Date()) {
  return prisma.booking.update({
    where: { id },
    data: {
      status: "CANCELLED",
      slotKey: null,
      cancelledAt: now,
      cancelReason: reason ?? null,
    },
  });
}

/**
 * Queue the reminders that are due.
 *
 * Business-initiated contact, so it rides the gate like everything else the
 * crew starts — `booking.remind` is TIMED with an hour's window. Driven by the
 * same sweep as the rest of the queue.
 */
export async function queueDueReminders(now = new Date()): Promise<number> {
  const due = await prisma.booking.findMany({
    where: {
      status: { in: ["BOOKED", "CONFIRMED"] },
      remindAt: { not: null, lte: now },
      remindedAt: null,
      startsAt: { gt: now },
    },
    include: { client: { select: { timeZone: true, businessName: true } } },
    take: 200,
  });

  let queued = 0;
  for (const b of due) {
    const when = describeSlot({ start: b.startsAt, end: b.endsAt }, b.client.timeZone);
    await propose({
      clientId: b.clientId,
      kind: "booking.remind",
      summary: `Remind ${b.customerName} about ${when}`,
      subject: b.customerName,
      payload: {
        bookingId: b.id,
        to: b.customerPhone,
        when,
        businessName: b.client.businessName,
      },
      // One reminder per booking, however often the sweep runs.
      dedupeKey: `booking.remind:${b.id}`,
    });
    await prisma.booking.update({ where: { id: b.id }, data: { remindedAt: now } });
    queued++;
  }
  return queued;
}

/**
 * What a released reminder actually does.
 *
 * Re-reads the booking rather than trusting the payload. A reminder queued an
 * hour ago and released now must not go out about an appointment that has since
 * been cancelled — the payload cannot know that and the row can.
 */
registerExecutor("booking.remind", async (payload) => {
  const p = payload as { bookingId?: string };
  if (!p.bookingId) throw new Error("Released reminder carries no booking.");

  const booking = await prisma.booking.findUnique({
    where: { id: p.bookingId },
    include: { client: { select: { businessName: true, timeZone: true } } },
  });
  if (!booking) throw new Error("The booking this reminder refers to no longer exists.");
  if (!["BOOKED", "CONFIRMED"].includes(booking.status)) {
    throw new Error(`Not reminding — this booking is ${booking.status.toLowerCase()}.`);
  }
  if (booking.startsAt <= new Date()) {
    throw new Error("Not reminding — the appointment has already started.");
  }
  if (!booking.customerPhone) throw new Error("No number to remind on.");

  const when = describeSlot(
    { start: booking.startsAt, end: booking.endsAt },
    booking.client.timeZone,
  );
  const sms = await sendSms(
    booking.customerPhone,
    `${booking.client.businessName}: reminder, we're with you ${when}. Reply if you need to move it.`,
  );
  if (!sms.delivered) throw new Error(sms.detail);

  return { reminded: true, when };
});

/** Tell the business somebody booked. Fire-and-forget, like every notify call. */
export function announceBooking(booking: {
  customerName: string;
  customerPhone: string | null;
  startsAt: Date;
  endsAt: Date;
  jobSummary: string | null;
}, businessName: string, timeZone: string) {
  notifyAgency("REQUEST_FILED", {
    businessName,
    title: `Booked — ${booking.customerName}`,
    detail: booking.jobSummary ?? undefined,
    path: "/app/bookings",
    lines: [
      `When: ${describeSlot({ start: booking.startsAt, end: booking.endsAt }, timeZone)}`,
      `Phone: ${booking.customerPhone ?? "not given"}`,
    ],
  });
}

/** Confirm to the customer, on the phone they booked from. */
export async function confirmToCustomer(
  booking: { customerPhone: string | null; startsAt: Date; endsAt: Date },
  businessName: string,
  timeZone: string,
) {
  if (!booking.customerPhone) return { delivered: false, detail: "no number given" };
  const when = describeSlot({ start: booking.startsAt, end: booking.endsAt }, timeZone);
  return sendSms(
    booking.customerPhone,
    `${businessName}: you're booked for ${when}. Reply to change it and we'll sort it.`,
  );
}
