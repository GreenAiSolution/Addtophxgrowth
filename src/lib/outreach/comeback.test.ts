import { describe, expect, it } from "vitest";
import {
  COMEBACK,
  DEFAULT_INTERVAL_DAYS,
  FALLBACK_INTERVAL_DAYS,
  defaultIntervalDays,
  intervalFor,
  nextDueAt,
  assessRecord,
  selectDue,
  cycleOf,
  dedupeKeyFor,
  isComebackDue,
  summarise,
  recordStatus,
  fallbackMessage,
  MAX_PER_RUN,
  type RecordLike,
  type DraftContext,
} from "@/lib/outreach/comeback";
import { ACTION_KINDS, kindByKey } from "@/lib/gate";
import { upgradeByKey } from "@/lib/upgrades";

/**
 * The Comeback is an outbound loop that contacts real customers, so these tests
 * are about the two promises that matter: it contacts the right people at the
 * right time, and it never contacts the people it has been told to leave alone.
 */

const DAY = 86_400_000;
const daysAgo = (n: number, now: Date) => new Date(now.getTime() - n * DAY);

// A fixed "now" — the whole engine is deterministic given one.
const NOW = new Date("2026-07-29T12:00:00.000Z");

function rec(overrides: Partial<RecordLike> & { completedAt: Date }): RecordLike & { id: string } {
  return {
    id: Math.random().toString(36).slice(2),
    intervalDays: null,
    lastContactedAt: null,
    doNotContact: false,
    returnedAt: null,
    ...overrides,
  };
}

describe("intervals", () => {
  it("uses the record's own interval when it has one", () => {
    expect(intervalFor(rec({ completedAt: NOW, intervalDays: 30 }), "roofing")).toBe(30);
  });

  it("falls back to the trade default, then the global default", () => {
    expect(intervalFor(rec({ completedAt: NOW }), "hvac")).toBe(DEFAULT_INTERVAL_DAYS.hvac);
    expect(intervalFor(rec({ completedAt: NOW }), "unknown-trade")).toBe(FALLBACK_INTERVAL_DAYS);
    expect(defaultIntervalDays(null)).toBe(FALLBACK_INTERVAL_DAYS);
  });

  it("ignores a zero or negative interval and uses the default", () => {
    expect(intervalFor(rec({ completedAt: NOW, intervalDays: 0 }), "dental")).toBe(
      DEFAULT_INTERVAL_DAYS.dental,
    );
  });

  it("dates the next job from the completion date", () => {
    const r = rec({ completedAt: new Date("2026-01-01T00:00:00Z"), intervalDays: 100 });
    expect(nextDueAt(r, null).toISOString()).toBe(new Date("2026-04-11T00:00:00Z").toISOString());
  });
});

describe("assessRecord — who to contact and when", () => {
  it("skips a customer whose next job is still far off", () => {
    const r = rec({ completedAt: daysAgo(30, NOW), intervalDays: 365 });
    expect(assessRecord(r, null, NOW).do).toBe("skip");
  });

  it("reminds inside the lead window before the due date", () => {
    // due in (lead - 1) days → inside the window
    const interval = 365;
    const r = rec({
      completedAt: daysAgo(interval - (COMEBACK.reminderLeadDays - 1), NOW),
      intervalDays: interval,
    });
    const v = assessRecord(r, null, NOW);
    expect(v.do).toBe("remind");
    if (v.do === "remind") expect(v.kind).toBe("comeback.reminder");
  });

  it("does NOT remind before the lead window opens", () => {
    const interval = 365;
    const r = rec({
      completedAt: daysAgo(interval - (COMEBACK.reminderLeadDays + 5), NOW),
      intervalDays: interval,
    });
    expect(assessRecord(r, null, NOW).do).toBe("skip");
  });

  it("reactivates a customer well past the interval", () => {
    const interval = 100;
    // 2× interval elapsed → past the dormant threshold (1.5×)
    const r = rec({ completedAt: daysAgo(interval * 2, NOW), intervalDays: interval });
    const v = assessRecord(r, null, NOW);
    expect(v.do).toBe("reactivate");
    if (v.do === "reactivate") {
      expect(v.kind).toBe("comeback.reactivate");
      expect(v.overdueDays).toBe(interval); // due at 1×, now at 2× → interval days overdue
    }
  });

  it("leaves no gap between reminder and reactivation", () => {
    // Sweep day by day across the whole life of a record; every day must be
    // exactly one of skip/remind/reactivate, and once it turns dormant it never
    // reverts to a reminder.
    const interval = 200;
    const completedAt = new Date("2026-01-01T00:00:00Z");
    let sawRemind = false;
    let sawReactivate = false;
    for (let d = 0; d < interval * 2; d++) {
      const now = new Date(completedAt.getTime() + d * DAY);
      const v = assessRecord(rec({ completedAt, intervalDays: interval }), null, now);
      expect(["skip", "remind", "reactivate"]).toContain(v.do);
      if (v.do === "remind") {
        sawRemind = true;
        expect(sawReactivate).toBe(false); // never remind after reactivation started
      }
      if (v.do === "reactivate") sawReactivate = true;
    }
    expect(sawRemind).toBe(true);
    expect(sawReactivate).toBe(true);
  });
});

describe("assessRecord — the people it must never contact", () => {
  it("never contacts a do-not-contact record, however overdue", () => {
    const r = rec({ completedAt: daysAgo(10_000, NOW), intervalDays: 100, doNotContact: true });
    expect(assessRecord(r, null, NOW).do).toBe("skip");
  });

  it("never contacts a customer who already came back", () => {
    const r = rec({
      completedAt: daysAgo(10_000, NOW),
      intervalDays: 100,
      returnedAt: daysAgo(5, NOW),
    });
    expect(assessRecord(r, null, NOW).do).toBe("skip");
  });

  it("respects the cooldown after a recent contact", () => {
    const r = rec({
      completedAt: daysAgo(10_000, NOW),
      intervalDays: 100,
      lastContactedAt: daysAgo(COMEBACK.cooldownDays - 1, NOW),
    });
    expect(assessRecord(r, null, NOW).do).toBe("skip");
  });

  it("re-approaches again once the cooldown has passed", () => {
    const r = rec({
      completedAt: daysAgo(10_000, NOW),
      intervalDays: 100,
      lastContactedAt: daysAgo(COMEBACK.cooldownDays + 1, NOW),
    });
    expect(assessRecord(r, null, NOW).do).toBe("reactivate");
  });
});

describe("selectDue — ordering and cap", () => {
  it("puts reactivations before reminders, most overdue first", () => {
    const interval = 100;
    const records = [
      rec({ completedAt: daysAgo(interval - 5, NOW), intervalDays: interval }), // remind
      rec({ completedAt: daysAgo(interval * 3, NOW), intervalDays: interval }), // very overdue
      rec({ completedAt: daysAgo(interval * 2, NOW), intervalDays: interval }), // overdue
    ];
    const due = selectDue(records, null, NOW);
    expect(due.map((d) => d.verdict.do)).toEqual(["reactivate", "reactivate", "remind"]);
    // most overdue reactivation leads
    expect(due[0].record.completedAt.getTime()).toBeLessThan(due[1].record.completedAt.getTime());
  });

  it("caps the number returned", () => {
    const many = Array.from({ length: MAX_PER_RUN + 10 }, () =>
      rec({ completedAt: daysAgo(500, NOW), intervalDays: 100 }),
    );
    expect(selectDue(many, null, NOW).length).toBe(MAX_PER_RUN);
    expect(selectDue(many, null, NOW, 5).length).toBe(5);
  });

  it("returns nothing when nobody is due", () => {
    const records = [rec({ completedAt: daysAgo(1, NOW), intervalDays: 365 })];
    expect(selectDue(records, null, NOW)).toEqual([]);
  });
});

describe("dedupe keys and cycles", () => {
  it("is stable within a cycle and changes across cycles", () => {
    const r = rec({ completedAt: daysAgo(50, NOW), intervalDays: 100 });
    const later = new Date(NOW.getTime() + 10 * DAY); // still cycle 0
    expect(cycleOf(r, null, NOW)).toBe(0);
    expect(cycleOf(r, null, later)).toBe(0);

    const r2 = rec({ completedAt: daysAgo(150, NOW), intervalDays: 100 });
    expect(cycleOf(r2, null, NOW)).toBe(1);

    expect(dedupeKeyFor("abc", "comeback.reminder", 0)).toBe("comeback:comeback.reminder:abc:c0");
    expect(dedupeKeyFor("abc", "comeback.reminder", 0)).toBe(
      dedupeKeyFor("abc", "comeback.reminder", 0),
    );
    expect(dedupeKeyFor("abc", "comeback.reminder", 0)).not.toBe(
      dedupeKeyFor("abc", "comeback.reminder", 1),
    );
    expect(dedupeKeyFor("abc", "comeback.reminder", 0)).not.toBe(
      dedupeKeyFor("abc", "comeback.reactivate", 0),
    );
  });
});

describe("isComebackDue — one pass a day", () => {
  it("runs when it has never run", () => {
    expect(isComebackDue(NOW, null)).toBe(true);
  });
  it("does not run twice in the same UTC day", () => {
    const earlier = new Date("2026-07-29T01:00:00Z");
    expect(isComebackDue(NOW, earlier)).toBe(false);
  });
  it("runs again the next day", () => {
    const yesterday = new Date("2026-07-28T23:00:00Z");
    expect(isComebackDue(NOW, yesterday)).toBe(true);
  });
});

describe("the message", () => {
  const base: DraftContext = {
    businessName: "Ironclad Roofing",
    customerName: "Marcy Bell",
    service: "roof inspection",
    kind: "comeback.reminder",
  };

  it("addresses the customer by first name and names the business", () => {
    const msg = fallbackMessage(base);
    expect(msg).toContain("Marcy");
    expect(msg).not.toContain("Bell"); // first name only
    expect(msg).toContain("Ironclad Roofing");
  });

  it("has no placeholders or brackets", () => {
    for (const kind of ["comeback.reminder", "comeback.reactivate"] as const) {
      const msg = fallbackMessage({ ...base, kind });
      expect(msg).not.toMatch(/[[\]{}]/);
      expect(msg.toLowerCase()).not.toContain("placeholder");
    }
  });

  it("degrades gracefully when the service is unknown", () => {
    const msg = fallbackMessage({ ...base, service: null });
    expect(msg).toContain("Marcy");
    expect(msg.length).toBeGreaterThan(20);
  });
});

describe("the read-out", () => {
  it("counts each record into exactly the right bucket", () => {
    const records = [
      rec({ completedAt: daysAgo(1, NOW), intervalDays: 365 }), // not due yet
      rec({ completedAt: daysAgo(360, NOW), intervalDays: 365 }), // due now (within lead window)
      rec({ completedAt: daysAgo(800, NOW), intervalDays: 365 }), // dormant
      rec({ completedAt: daysAgo(800, NOW), intervalDays: 365, doNotContact: true }),
      rec({ completedAt: daysAgo(800, NOW), intervalDays: 365, returnedAt: daysAgo(3, NOW) }),
      rec({
        completedAt: daysAgo(800, NOW),
        intervalDays: 365,
        lastContactedAt: daysAgo(10, NOW),
      }),
    ];
    const s = summarise(records, null, NOW);
    expect(s.total).toBe(6);
    expect(s.dueNow).toBe(1);
    expect(s.dormant).toBe(1);
    expect(s.notDueYet).toBe(1);
    expect(s.doNotContact).toBe(1);
    expect(s.returned).toBe(1);
    expect(s.contacted).toBe(1);
  });

  it("labels a record for the list", () => {
    expect(recordStatus(rec({ completedAt: daysAgo(800, NOW), intervalDays: 365 }), null, NOW)).toContain(
      "Lapsed",
    );
    expect(
      recordStatus(rec({ completedAt: daysAgo(800, NOW), intervalDays: 365, doNotContact: true }), null, NOW),
    ).toBe("Do not contact");
    expect(
      recordStatus(rec({ completedAt: daysAgo(1, NOW), intervalDays: 365 }), null, NOW),
    ).toBe("Not due yet");
  });
});

describe("consistency with the gate and the catalogue", () => {
  it("only uses action kinds the gate declares, and they belong to the comeback build", () => {
    for (const key of ["comeback.reminder", "comeback.reactivate"] as const) {
      const kind = kindByKey(key);
      expect(kind, `gate must declare ${key}`).toBeDefined();
      expect(kind!.build).toBe("comeback");
      // Contacting a past customer never moves money — it must be a timed hold,
      // visible before it sends, exactly as the catalogue promises.
      expect(kind!.movesMoney).toBe(false);
      expect(kind!.minimumHold).toBe("TIMED");
    }
  });

  it("covers every comeback kind the gate declares", () => {
    const gateComebackKinds = ACTION_KINDS.filter((k) => k.build === "comeback").map((k) => k.key).sort();
    expect(gateComebackKinds).toEqual(["comeback.reactivate", "comeback.reminder"]);
  });

  it("the build it implements is a real, sold upgrade", () => {
    const upgrade = upgradeByKey("comeback");
    expect(upgrade).toBeDefined();
    expect(upgrade!.build).toBe(true);
  });
});
