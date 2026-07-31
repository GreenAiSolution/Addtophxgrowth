import { describe, expect, it } from "vitest";
import {
  calendarSchema,
  confirmSlot,
  defaultCalendar,
  nextSlots,
  offerLine,
  slotKey,
  speakSlot,
  type Appointment,
  type Calendar,
} from "@/lib/booking";

/**
 * A customer told Thursday at nine who nobody turns up for costs more than a
 * missed call ever did, because they cleared their morning for it. So these
 * tests are about the two ways that happens: offering a time the business
 * cannot work, and confirming a time the operator never actually said.
 */

const PHOENIX = -420;

function cal(over: Partial<Calendar> = {}): Calendar {
  return calendarSchema.parse({ ...defaultCalendar(), utcOffsetMinutes: PHOENIX, ...over });
}

// Monday 3 August 2026, 9am Phoenix (16:00 UTC).
const MONDAY_9AM = new Date("2026-08-03T16:00:00Z");

const localHour = (d: Date) => new Date(d.getTime() + PHOENIX * 60_000).getUTCHours();
const localDay = (d: Date) => new Date(d.getTime() + PHOENIX * 60_000).getUTCDay();
const localDate = (d: Date) => new Date(d.getTime() + PHOENIX * 60_000).toISOString().slice(0, 10);

describe("what the diary will offer", () => {
  it("never offers sooner than the lead time", () => {
    // A crew already on the road cannot be at a new address in ten minutes.
    const c = cal({ leadTimeHours: 4 });
    const slots = nextSlots(c, [], { now: MONDAY_9AM });
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect(s.at.getTime()).toBeGreaterThanOrEqual(MONDAY_9AM.getTime() + 4 * 3_600_000);
    }
  });

  it("stays inside working hours, in the business's own time", () => {
    const c = cal({ startHour: 8, endHour: 16 });
    for (const s of nextSlots(c, [], { count: 8, now: MONDAY_9AM })) {
      expect(localHour(s.at)).toBeGreaterThanOrEqual(8);
      expect(localHour(s.at)).toBeLessThan(16);
    }
  });

  it("skips days the business does not work", () => {
    // Weekends only.
    const c = cal({ days: [0, 6] });
    for (const s of nextSlots(c, [], { count: 5, now: MONDAY_9AM })) {
      expect([0, 6]).toContain(localDay(s.at));
    }
  });

  it("skips a blackout date entirely", () => {
    const c = cal({ blackoutDates: ["2026-08-03", "2026-08-04"] });
    for (const s of nextSlots(c, [], { count: 5, now: MONDAY_9AM })) {
      expect(["2026-08-03", "2026-08-04"]).not.toContain(localDate(s.at));
    }
  });

  it("does not offer a slot that clashes with a booked visit", () => {
    const c = cal({ leadTimeHours: 0, slotMinutes: 60 });
    const taken: Appointment[] = [
      { at: new Date("2026-08-03T16:00:00Z"), minutes: 60 },
      { at: new Date("2026-08-03T17:00:00Z"), minutes: 60 },
    ];
    const slots = nextSlots(c, taken, { count: 3, now: MONDAY_9AM });
    for (const s of slots) {
      for (const t of taken) {
        expect(s.at.getTime()).not.toBe(t.at.getTime());
      }
    }
  });

  it("respects a long visit that straddles the next slot", () => {
    // A three-hour job blocks three one-hour slots, not one.
    const c = cal({ leadTimeHours: 0, slotMinutes: 60 });
    const taken: Appointment[] = [{ at: new Date("2026-08-03T16:00:00Z"), minutes: 180 }];
    const first = nextSlots(c, taken, { count: 1, now: MONDAY_9AM })[0]!;
    expect(first.at.getTime()).toBeGreaterThanOrEqual(new Date("2026-08-03T19:00:00Z").getTime());
  });

  it("stops at the daily cap even when the day is otherwise open", () => {
    const c = cal({ leadTimeHours: 0, maxPerDay: 2 });
    const slots = nextSlots(c, [], { count: 6, now: MONDAY_9AM });
    const monday = slots.filter((s) => localDate(s.at) === "2026-08-03");
    expect(monday.length).toBeLessThanOrEqual(2);
  });

  it("counts what is already booked against the daily cap", () => {
    const c = cal({ leadTimeHours: 0, maxPerDay: 2 });
    const taken: Appointment[] = [
      { at: new Date("2026-08-03T15:00:00Z"), minutes: 60 },
      { at: new Date("2026-08-03T16:00:00Z"), minutes: 60 },
    ];
    const slots = nextSlots(c, taken, { count: 4, now: MONDAY_9AM });
    expect(slots.filter((s) => localDate(s.at) === "2026-08-03")).toHaveLength(0);
  });

  it("never offers beyond the horizon", () => {
    const c = cal({ horizonDays: 3 });
    const limit = MONDAY_9AM.getTime() + 3 * 86_400_000;
    for (const s of nextSlots(c, [], { count: 20, now: MONDAY_9AM })) {
      expect(s.at.getTime()).toBeLessThan(limit);
    }
  });

  it("returns nothing rather than something impossible", () => {
    // Every day blacked out. The honest answer is an empty list, and the
    // operator's line for that says a human will ring.
    const c = cal({ days: [] });
    expect(nextSlots(c, [], { now: MONDAY_9AM })).toEqual([]);
    expect(offerLine([])).toMatch(/somebody ring you/);
  });

  it("gives every slot a stable key", () => {
    const slots = nextSlots(cal(), [], { count: 3, now: MONDAY_9AM });
    const keys = slots.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((k) => /^\d{8}\d{4}$/.test(k))).toBe(true);
    expect(slotKey(new Date("2026-08-03T16:00:00Z"))).toBe("202608031600");
  });
});

describe("how a time is said out loud", () => {
  it("says today and tomorrow like a person", () => {
    expect(speakSlot(new Date("2026-08-03T21:00:00Z"), PHOENIX, MONDAY_9AM)).toBe("today at 2pm");
    expect(speakSlot(new Date("2026-08-04T16:00:00Z"), PHOENIX, MONDAY_9AM)).toBe("tomorrow at 9am");
  });

  it("names the day and the date after that", () => {
    const said = speakSlot(new Date("2026-08-06T16:00:00Z"), PHOENIX, MONDAY_9AM);
    expect(said).toBe("Thursday the 6th at 9am");
  });

  it("gets the ordinals right, including the awkward ones", () => {
    const at = (d: string) => speakSlot(new Date(`${d}T16:00:00Z`), PHOENIX, MONDAY_9AM);
    expect(at("2026-08-11")).toContain("11th");
    expect(at("2026-08-12")).toContain("12th");
    expect(at("2026-08-13")).toContain("13th");
    expect(at("2026-08-21")).toContain("21st");
    expect(at("2026-08-22")).toContain("22nd");
    expect(at("2026-08-23")).toContain("23rd");
  });

  it("never reads a year, a timezone or a leading zero", () => {
    // Reading "2026-08-06T09:00:00Z" aloud is the fastest way to sound like
    // software.
    const said = speakSlot(new Date("2026-08-06T16:30:00Z"), PHOENIX, MONDAY_9AM);
    expect(said).not.toMatch(/2026|Z|UTC|:00\b/);
    expect(said).toContain("9:30am");
  });

  it("handles noon and midnight without saying 0", () => {
    expect(speakSlot(new Date("2026-08-03T19:00:00Z"), PHOENIX, MONDAY_9AM)).toContain("12pm");
    expect(speakSlot(new Date("2026-08-04T07:00:00Z"), PHOENIX, MONDAY_9AM)).toContain("12am");
  });
});

describe("confirming what the caller agreed to", () => {
  const offered = () => nextSlots(cal(), [], { count: 3, now: MONDAY_9AM });

  it("accepts a slot this call actually offered", () => {
    const slots = offered();
    const v = confirmSlot(slots, slots[1]!.key, cal(), [], MONDAY_9AM);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.slot.key).toBe(slots[1]!.key);
  });

  it("refuses a time the operator never said, and re-offers", () => {
    // The model agreeing to "Sunday at 7pm" is the failure this exists for.
    const v = confirmSlot(offered(), "202608091900", cal(), [], MONDAY_9AM);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.why).toMatch(/never offered/);
      expect(v.offer.length).toBeGreaterThan(0);
      expect(v.spoken).toMatch(/what I've actually got/);
    }
  });

  it("refuses a slot taken during the call, and says so kindly", () => {
    const slots = offered();
    const taken: Appointment[] = [{ at: slots[0]!.at, minutes: 60 }];
    const v = confirmSlot(slots, slots[0]!.key, cal(), taken, MONDAY_9AM);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.why).toMatch(/taken while we were talking/);
      expect(v.spoken).toMatch(/just gone/);
    }
  });

  it("refuses a slot that has slipped inside the lead time", () => {
    const slots = offered();
    const muchLater = new Date(slots[0]!.at.getTime() - 60_000);
    const v = confirmSlot(slots, slots[0]!.key, cal({ leadTimeHours: 4 }), [], muchLater);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.why).toMatch(/lead time/);
  });

  it("never says the diary is empty when it is not", () => {
    const v = confirmSlot(offered(), "nonsense", cal(), [], MONDAY_9AM);
    if (!v.ok) expect(v.spoken).not.toMatch(/nothing/);
  });
});

describe("how the offer is worded", () => {
  it("reads two or more times as a list with an or", () => {
    const slots = nextSlots(cal(), [], { count: 3, now: MONDAY_9AM });
    const line = offerLine(slots);
    expect(line.startsWith("I can do ")).toBe(true);
    expect(line).toMatch(/ or /);
    expect(line.split(" or ")).toHaveLength(2);
  });

  it("does not say 'or' with a single option", () => {
    const slots = nextSlots(cal(), [], { count: 1, now: MONDAY_9AM });
    expect(offerLine(slots)).not.toMatch(/ or /);
  });

  it("appends the client's note when there is one", () => {
    const slots = nextSlots(cal(), [], { count: 2, now: MONDAY_9AM });
    expect(offerLine(slots, "We'll text when the crew is 30 minutes out.")).toContain(
      "30 minutes out",
    );
  });
});
