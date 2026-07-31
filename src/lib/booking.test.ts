import { describe, expect, it } from "vitest";
import {
  DEFAULT_HORIZON_DAYS,
  DEFAULT_HOURS,
  DEFAULT_LEAD_MINUTES,
  REMIND_HOURS_BEFORE,
  canBook,
  describeSlot,
  findSlots,
  isFree,
  localPartsOf,
  minutesToClock,
  overlaps,
  remindAt,
  tzOffsetMs,
  withinHours,
  zonedToUtc,
  type AvailabilityRule,
  type Interval,
} from "@/lib/booking";

const PHX = "America/Phoenix"; // No DST — the client base, and the blind spot.
const LA = "America/Los_Angeles"; // DST — where the bug would actually show up.

/** A Thursday, 6am Phoenix. */
const NOW = new Date("2026-07-30T13:00:00Z");

const iv = (start: string, end: string): Interval => ({
  start: new Date(start),
  end: new Date(end),
});

describe("overlap", () => {
  it("catches every way two appointments can collide", () => {
    const base = iv("2026-08-03T16:00:00Z", "2026-08-03T18:00:00Z");
    const cases: [string, Interval, boolean][] = [
      ["identical", iv("2026-08-03T16:00:00Z", "2026-08-03T18:00:00Z"), true],
      ["contained", iv("2026-08-03T16:30:00Z", "2026-08-03T17:00:00Z"), true],
      ["straddles start", iv("2026-08-03T15:00:00Z", "2026-08-03T17:00:00Z"), true],
      ["straddles end", iv("2026-08-03T17:00:00Z", "2026-08-03T19:00:00Z"), true],
      ["envelops", iv("2026-08-03T15:00:00Z", "2026-08-03T19:00:00Z"), true],
      ["before", iv("2026-08-03T14:00:00Z", "2026-08-03T16:00:00Z"), false],
      ["after", iv("2026-08-03T18:00:00Z", "2026-08-03T20:00:00Z"), false],
    ];
    for (const [name, other, expected] of cases) {
      expect(overlaps(base, other), name).toBe(expected);
      expect(overlaps(other, base), `${name} reversed`).toBe(expected);
    }
  });

  it("lets appointments touch end to start", () => {
    // Back-to-back jobs are the normal case, not a collision.
    expect(
      overlaps(
        iv("2026-08-03T16:00:00Z", "2026-08-03T17:00:00Z"),
        iv("2026-08-03T17:00:00Z", "2026-08-03T18:00:00Z"),
      ),
    ).toBe(false);
  });

  it("is free of an empty diary", () => {
    expect(isFree(iv("2026-08-03T16:00:00Z", "2026-08-03T17:00:00Z"), [])).toBe(true);
  });
});

describe("time zones", () => {
  it("reads the offset of a zone without DST", () => {
    expect(tzOffsetMs(new Date("2026-01-15T12:00:00Z"), PHX)).toBe(-7 * 3_600_000);
    expect(tzOffsetMs(new Date("2026-07-15T12:00:00Z"), PHX)).toBe(-7 * 3_600_000);
  });

  it("follows a zone across its DST boundary", () => {
    // The whole reason there is no offset column. A stored -8 would book every
    // summer appointment an hour early, and it would look correct in Phoenix.
    expect(tzOffsetMs(new Date("2026-01-15T12:00:00Z"), LA)).toBe(-8 * 3_600_000);
    expect(tzOffsetMs(new Date("2026-07-15T12:00:00Z"), LA)).toBe(-7 * 3_600_000);
  });

  it("converts a wall clock to an instant on both sides of a DST change", () => {
    // 9am local in January is 17:00Z; 9am local in July is 16:00Z. Same rule,
    // different instant, which is exactly what "eight until five" means.
    expect(zonedToUtc(2026, 1, 15, 9 * 60, LA).toISOString()).toBe("2026-01-15T17:00:00.000Z");
    expect(zonedToUtc(2026, 7, 15, 9 * 60, LA).toISOString()).toBe("2026-07-15T16:00:00.000Z");
  });

  it("round-trips a wall clock through an instant and back", () => {
    for (const [tz, date] of [
      [PHX, "2026-03-08"],
      [LA, "2026-03-08"], // spring forward
      [LA, "2026-11-01"], // fall back
      [LA, "2026-07-15"],
    ] as const) {
      const [y, m, d] = date.split("-").map(Number);
      const at = zonedToUtc(y, m, d, 14 * 60, tz);
      const parts = localPartsOf(at, tz);
      expect(parts.minutes, `${tz} ${date}`).toBe(14 * 60);
      expect(parts.day, `${tz} ${date}`).toBe(d);
    }
  });

  it("reads local weekday and minutes back correctly", () => {
    // 2026-07-30T13:00Z is 6am Thursday in Phoenix.
    const p = localPartsOf(NOW, PHX);
    expect(p.weekday).toBe(4);
    expect(p.minutes).toBe(6 * 60);
    expect(p.day).toBe(30);
  });
});

describe("finding slots", () => {
  const rules = DEFAULT_HOURS;

  it("offers slots inside working hours only", () => {
    const slots = findSlots({ rules, busy: [], timeZone: PHX, durationMinutes: 60, now: NOW });
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect(withinHours(s, rules, PHX), describeSlot(s, PHX)).toBe(true);
    }
  });

  it("lands slots on sensible local boundaries", () => {
    // Walking local days rather than UTC hours is what stops slots landing at
    // 9:37 because the offset happened to be odd.
    const slots = findSlots({ rules, busy: [], timeZone: PHX, durationMinutes: 60, now: NOW });
    for (const s of slots) {
      expect(localPartsOf(s.start, PHX).minutes % 60, describeSlot(s, PHX)).toBe(0);
    }
  });

  it("never offers a slot inside the lead window", () => {
    const slots = findSlots({ rules, busy: [], timeZone: PHX, durationMinutes: 60, now: NOW });
    const earliest = NOW.getTime() + DEFAULT_LEAD_MINUTES * 60_000;
    for (const s of slots) expect(s.start.getTime()).toBeGreaterThanOrEqual(earliest);
  });

  it("never offers a slot that collides with the diary", () => {
    const first = findSlots({
      rules,
      busy: [],
      timeZone: PHX,
      durationMinutes: 60,
      now: NOW,
      limit: 1,
    })[0];

    const withBusy = findSlots({
      rules,
      busy: [first],
      timeZone: PHX,
      durationMinutes: 60,
      now: NOW,
      limit: 1,
    })[0];

    expect(withBusy.start.getTime()).not.toBe(first.start.getTime());
    expect(isFree(withBusy, [first])).toBe(true);
  });

  it("respects appointments put in the diary by hand", () => {
    // The case a naive implementation misses, because it only knows about the
    // bookings it made itself.
    const slots = findSlots({ rules, busy: [], timeZone: PHX, durationMinutes: 60, now: NOW });
    const blocked = slots.slice(0, 3);
    const after = findSlots({
      rules,
      busy: blocked,
      timeZone: PHX,
      durationMinutes: 60,
      now: NOW,
    });
    for (const s of after) expect(isFree(s, blocked)).toBe(true);
  });

  it("returns them soonest first", () => {
    const slots = findSlots({ rules, busy: [], timeZone: PHX, durationMinutes: 60, now: NOW });
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].start.getTime()).toBeGreaterThan(slots[i - 1].start.getTime());
    }
  });

  it("caps the answer, because ninety options is no choice at all", () => {
    const slots = findSlots({
      rules,
      busy: [],
      timeZone: PHX,
      durationMinutes: 60,
      now: NOW,
      limit: 5,
    });
    expect(slots).toHaveLength(5);
  });

  it("never offers a slot that would run past closing", () => {
    // A two-hour job starting at half four on a five o'clock finish is inside
    // the hours when it begins and an hour of overtime by the time it ends.
    const slots = findSlots({ rules, busy: [], timeZone: PHX, durationMinutes: 120, now: NOW });
    for (const s of slots) {
      const end = localPartsOf(new Date(s.end.getTime() - 1), PHX);
      expect(end.minutes, describeSlot(s, PHX)).toBeLessThan(17 * 60);
    }
  });

  it("offers nothing when the business works no hours", () => {
    expect(findSlots({ rules: [], busy: [], timeZone: PHX, durationMinutes: 60, now: NOW })).toEqual(
      [],
    );
  });

  it("ignores a window that ends before it starts", () => {
    const broken: AvailabilityRule[] = [{ weekday: 1, startMinute: 1020, endMinute: 480 }];
    expect(
      findSlots({ rules: broken, busy: [], timeZone: PHX, durationMinutes: 60, now: NOW }),
    ).toEqual([]);
  });

  it("refuses a nonsense duration rather than looping", () => {
    for (const d of [0, -60, NaN, Infinity]) {
      expect(
        findSlots({ rules, busy: [], timeZone: PHX, durationMinutes: d, now: NOW }),
        String(d),
      ).toEqual([]);
    }
  });

  it("stays inside the horizon", () => {
    const slots = findSlots({
      rules,
      busy: [],
      timeZone: PHX,
      durationMinutes: 60,
      now: NOW,
      limit: 200,
    });
    const latest = NOW.getTime() + DEFAULT_HORIZON_DAYS * 86_400_000;
    for (const s of slots) expect(s.start.getTime()).toBeLessThanOrEqual(latest);
  });

  it("keeps offering the right local hour across a DST change", () => {
    // Book across March 8th in Los Angeles. Every slot must still read as a
    // working hour locally, whichever side of the change it falls.
    const beforeDst = new Date("2026-03-05T17:00:00Z");
    const slots = findSlots({
      rules,
      busy: [],
      timeZone: LA,
      durationMinutes: 60,
      now: beforeDst,
      limit: 40,
    });
    expect(slots.length).toBeGreaterThan(10);
    for (const s of slots) {
      const p = localPartsOf(s.start, LA);
      expect(p.minutes, describeSlot(s, LA)).toBeGreaterThanOrEqual(8 * 60);
      expect(p.minutes, describeSlot(s, LA)).toBeLessThan(17 * 60);
    }
  });
});

describe("booking the slot, re-checked at the moment it is taken", () => {
  const rules = DEFAULT_HOURS;
  const good = findSlots({ rules, busy: [], timeZone: PHX, durationMinutes: 60, now: NOW })[0];

  it("takes a slot that is still free", () => {
    expect(canBook({ slot: good, busy: [], rules, timeZone: PHX, now: NOW })).toEqual({ ok: true });
  });

  it("refuses a slot somebody took while the customer was thinking", () => {
    // The reason this is not the same call as findSlots: a customer reads a
    // list and thinks for four minutes, and trusting that list is how two
    // people get told the same nine o'clock is theirs.
    const verdict = canBook({ slot: good, busy: [good], rules, timeZone: PHX, now: NOW });
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.why).toMatch(/just taken/i);
  });

  it("refuses a time in the past", () => {
    const past = { start: new Date("2026-07-29T16:00:00Z"), end: new Date("2026-07-29T17:00:00Z") };
    const verdict = canBook({ slot: past, busy: [], rules, timeZone: PHX, now: NOW });
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.why).toMatch(/already passed/i);
  });

  it("refuses a slot inside the notice window", () => {
    const soon = {
      start: new Date(NOW.getTime() + 20 * 60_000),
      end: new Date(NOW.getTime() + 80 * 60_000),
    };
    const verdict = canBook({ slot: soon, busy: [], rules, timeZone: PHX, now: NOW });
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.why).toMatch(/notice/i);
  });

  it("refuses a slot beyond the horizon", () => {
    const far = {
      start: new Date(NOW.getTime() + 90 * 86_400_000),
      end: new Date(NOW.getTime() + 90 * 86_400_000 + 3_600_000),
    };
    const verdict = canBook({ slot: far, busy: [], rules, timeZone: PHX, now: NOW });
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.why).toMatch(/ahead/i);
  });

  it("refuses a slot outside working hours", () => {
    // 3am Phoenix on a Monday.
    const night = {
      start: new Date("2026-08-03T10:00:00Z"),
      end: new Date("2026-08-03T11:00:00Z"),
    };
    const verdict = canBook({ slot: night, busy: [], rules, timeZone: PHX, now: NOW });
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.why).toMatch(/working hours/i);
  });

  it("refuses an appointment that ends before it starts", () => {
    const backwards = { start: good.end, end: good.start };
    expect(canBook({ slot: backwards, busy: [], rules, timeZone: PHX, now: NOW }).ok).toBe(false);
  });

  it("refuses an unreal date rather than throwing", () => {
    const bad = { start: new Date("nonsense"), end: new Date("nonsense") };
    const verdict = canBook({ slot: bad, busy: [], rules, timeZone: PHX, now: NOW });
    expect(verdict.ok).toBe(false);
  });

  it("explains every refusal", () => {
    for (const slot of [
      { start: new Date("2026-07-29T16:00:00Z"), end: new Date("2026-07-29T17:00:00Z") },
      { start: new Date("2026-08-03T10:00:00Z"), end: new Date("2026-08-03T11:00:00Z") },
    ]) {
      const v = canBook({ slot, busy: [], rules, timeZone: PHX, now: NOW });
      expect(v.ok).toBe(false);
      expect(v.ok === false && v.why.length).toBeGreaterThan(10);
    }
  });
});

describe("hours", () => {
  it("requires the whole appointment inside one window", () => {
    const rules: AvailabilityRule[] = [{ weekday: 1, startMinute: 8 * 60, endMinute: 17 * 60 }];
    // Monday 4:30pm–6:30pm Phoenix.
    const overrunning = {
      start: new Date("2026-08-03T23:30:00Z"),
      end: new Date("2026-08-04T01:30:00Z"),
    };
    expect(withinHours(overrunning, rules, PHX)).toBe(false);
  });

  it("accepts an appointment finishing exactly at closing", () => {
    const rules: AvailabilityRule[] = [{ weekday: 1, startMinute: 8 * 60, endMinute: 17 * 60 }];
    // Monday 4pm–5pm Phoenix.
    const flush = {
      start: new Date("2026-08-03T23:00:00Z"),
      end: new Date("2026-08-04T00:00:00Z"),
    };
    expect(withinHours(flush, rules, PHX)).toBe(true);
  });
});

describe("reading it back to a human", () => {
  it("formats minutes as a clock", () => {
    expect(minutesToClock(0)).toBe("12:00 am");
    expect(minutesToClock(8 * 60)).toBe("8:00 am");
    expect(minutesToClock(12 * 60)).toBe("12:00 pm");
    expect(minutesToClock(13 * 60 + 30)).toBe("1:30 pm");
    expect(minutesToClock(17 * 60)).toBe("5:00 pm");
  });

  it("never produces a nonsense clock", () => {
    for (const n of [NaN, Infinity, -60, 99999]) {
      expect(minutesToClock(n), String(n)).toMatch(/^\d{1,2}:\d{2} (am|pm)$/);
    }
  });

  it("describes a slot in the business's own zone", () => {
    const slot = {
      start: new Date("2026-08-03T16:00:00Z"),
      end: new Date("2026-08-03T17:00:00Z"),
    };
    expect(describeSlot(slot, PHX)).toMatch(/9:00/);
  });
});

describe("reminders", () => {
  it("lands the evening before, not the morning of", () => {
    // Somebody who has forgotten needs time to rearrange. A reminder an hour
    // before is a notification about a loss, not a way to prevent one.
    const start = new Date("2026-08-05T16:00:00Z");
    const at = remindAt(start, NOW)!;
    expect(start.getTime() - at.getTime()).toBe(REMIND_HOURS_BEFORE * 3_600_000);
    expect(at.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("declines to remind about something already too close", () => {
    const soon = new Date(NOW.getTime() + 2 * 3_600_000);
    expect(remindAt(soon, NOW)).toBeNull();
  });
});
