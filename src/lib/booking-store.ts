/**
 * The diary's database layer.
 *
 * Same split as everywhere else: `booking.ts` decides what is offerable and
 * what is confirmable, this file reads and writes. The one rule it owns on its
 * own is double-booking, and it enforces it with a unique constraint rather
 * than a check — two calls landing on the same slot in the same second is
 * exactly the case a read-then-write loses.
 */

import { prisma } from "@/lib/prisma";
import { calendarSchema, defaultCalendar, type Appointment, type Calendar, type Slot } from "@/lib/booking";

export async function activeCalendar(
  clientId: string,
): Promise<{ value: Calendar; saved: boolean }> {
  const row = await prisma.bookingCalendar.findUnique({ where: { clientId } });
  if (row) {
    const parsed = calendarSchema.safeParse(row.payload);
    if (parsed.success) return { value: parsed.data, saved: true };
  }
  return { value: defaultCalendar(), saved: false };
}

export async function saveCalendar(clientId: string, cal: Calendar, by: string): Promise<void> {
  const value = calendarSchema.parse(cal);
  await prisma.bookingCalendar.upsert({
    where: { clientId },
    create: { clientId, payload: value as never, updatedBy: by },
    update: { payload: value as never, updatedBy: by },
  });
}

/**
 * What is already in the diary, from now to the end of the horizon.
 *
 * Cancelled visits are excluded — a slot somebody cancelled is a slot the
 * operator should be offering again, and leaving them in is how a diary looks
 * full while the crew sits idle.
 */
export async function bookedAppointments(
  clientId: string,
  cal: Calendar,
  now = new Date(),
): Promise<Appointment[]> {
  const rows = await prisma.appointment.findMany({
    where: {
      clientId,
      status: { in: ["BOOKED", "COMPLETED"] },
      at: { gte: new Date(now.getTime() - 86_400_000), lte: new Date(now.getTime() + cal.horizonDays * 86_400_000) },
    },
    select: { at: true, minutes: true },
    orderBy: { at: "asc" },
    take: 500,
  });
  return rows.map((r) => ({ at: r.at, minutes: r.minutes }));
}

/**
 * Write the booking.
 *
 * Returns null when the slot was taken between the confirmation and the write —
 * the unique constraint on (clientId, slotKey) is what makes that a caught
 * conflict rather than two crews at one address.
 */
export async function createAppointment(input: {
  clientId: string;
  callId?: string;
  slot: Slot;
  minutes: number;
  customer: { name?: string; phone?: string; address?: string; description?: string };
}) {
  let appointment;
  try {
    appointment = await prisma.appointment.create({
      data: {
        clientId: input.clientId,
        callId: input.callId ?? null,
        slotKey: input.slot.key,
        at: input.slot.at,
        minutes: input.minutes,
        customerName: input.customer.name ?? null,
        customerPhone: input.customer.phone ?? null,
        customerAddress: input.customer.address ?? null,
        jobDescription: input.customer.description ?? null,
      },
    });
  } catch {
    return null;
  }

  // Told to whoever is listening — the client's calendar, their CRM, their
  // scheduler. Queued, never delivered inline: this runs while a caller is
  // still on the line waiting to hear the slot read back.
  const { emit } = await import("@/lib/event-bus");
  await emit({
    clientId: input.clientId,
    type: "appointment.booked",
    key: appointment.id,
    data: {
      appointmentId: appointment.id,
      callId: input.callId ?? null,
      at: appointment.at.toISOString(),
      minutes: appointment.minutes,
      customer: {
        name: input.customer.name ?? null,
        phone: input.customer.phone ?? null,
        address: input.customer.address ?? null,
      },
      job: input.customer.description ?? null,
    },
  });

  return appointment;
}
