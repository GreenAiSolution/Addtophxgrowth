import { describe, it, expect } from "vitest";
import {
  intervalFor,
  classify,
  cycleFor,
  dedupeKeyFor,
  daysBetween,
  intervalLabel,
  composeMessage,
  planComebacks,
  isDue,
  latestJobPerCustomer,
  DEFAULT_INTERVAL_DAYS,
  MIN_INTERVAL_DAYS,
  REMINDER_LEAD_DAYS,
  REMINDER_GRACE_DAYS,
  REACTIVATE_AFTER_MULTIPLE,
  MAX_PER_RUN,
  MIN_HOURS_BETWEEN_RUNS,
  type PastCustomer,
} from "@/lib/comeback";

const DAY = 86_400_000;
const NOW = new Date("2026-06-01T12:00:00.000Z");

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * DAY);
}

function customer(over: Partial<PastCustomer> = {}): PastCustomer {
  return {
    leadId: "lead-1",
    name: "Dana Reyes",
    company: "Reyes Residence",
    email: "dana@example.com",
    phone: null,
    lastJobAt: daysAgo(360),
    valueCents: 1_400_000,
    ...over,
  };
}

describe("intervalFor", () => {
  it("prefers the client's explicit override", () => {
    expect(intervalFor({ comebackIntervalDays: 120, verticalKey: "roofing" })).toBe(120);
  });

  it("falls back to the vertical pack's default", () => {
    // roofing is 365, hvac is 180 — sourced from the pack, not typed here.
    expect(intervalFor({ verticalKey: "roofing" })).toBe(365);
    expect(intervalFor({ verticalKey: "hvac" })).toBe(180);
  });

  it("matches on free-text industry when no key is set", () => {
    expect(intervalFor({ industry: "Local roofing company" })).toBe(365);
  });

  it("falls back to a year when nothing is known", () => {
    expect(intervalFor({})).toBe(DEFAULT_INTERVAL_DAYS);
  });

  it("floors a nonsense override rather than nagging weekly", () => {
    expect(intervalFor({ comebackIntervalDays: 3 })).toBe(MIN_INTERVAL_DAYS);
  });
});

describe("classify", () => {
  const interval = 365;

  it("says nothing for a customer nowhere near due", () => {
    expect(classify(100, interval)).toBeNull();
  });

  it("reminds inside the window before the due date", () => {
    expect(classify(interval - REMINDER_LEAD_DAYS, interval)).toBe("reminder");
    expect(classify(interval - REMINDER_LEAD_DAYS - 1, interval)).toBeNull();
  });

  it("reminds inside the grace window after the due date", () => {
    expect(classify(interval + REMINDER_GRACE_DAYS, interval)).toBe("reminder");
    expect(classify(interval + REMINDER_GRACE_DAYS + 1, interval)).toBeNull();
  });

  it("leaves a cool-off gap between reminder and win-back", () => {
    // Past the reminder grace but not yet dormant → deliberately nothing.
    const between = interval + REMINDER_GRACE_DAYS + 10;
    expect(between).toBeLessThan(interval * REACTIVATE_AFTER_MULTIPLE);
    expect(classify(between, interval)).toBeNull();
  });

  it("switches to win-back once dormant", () => {
    expect(classify(interval * REACTIVATE_AFTER_MULTIPLE, interval)).toBe("reactivate");
    expect(classify(interval * 3, interval)).toBe("reactivate");
  });
});

describe("cycleFor / dedupeKeyFor", () => {
  const interval = 365;

  it("buckets a reminder to one cycle across the due-date boundary", () => {
    // A customer 25 days before due and 25 days after due is the SAME reminder,
    // so a run repeating over that span must not queue two.
    const before = cycleFor("reminder", interval - 25, interval);
    const after = cycleFor("reminder", interval + 25, interval);
    expect(before).toBe(after);
    expect(dedupeKeyFor("reminder", "lead-1", before)).toBe(
      dedupeKeyFor("reminder", "lead-1", after),
    );
  });

  it("advances the reminder cycle at each new interval", () => {
    expect(cycleFor("reminder", interval, interval)).toBe(1);
    expect(cycleFor("reminder", interval * 2, interval)).toBe(2);
  });

  it("buckets a win-back once per interval overdue", () => {
    expect(cycleFor("reactivate", interval * 1.6, interval)).toBe(1);
    expect(cycleFor("reactivate", interval * 2.2, interval)).toBe(2);
  });

  it("keys distinctly by kind and lead", () => {
    expect(dedupeKeyFor("reminder", "a", 1)).toBe("comeback:reminder:a:1");
    expect(dedupeKeyFor("reactivate", "a", 1)).toBe("comeback:reactivate:a:1");
    expect(dedupeKeyFor("reminder", "b", 1)).not.toBe(dedupeKeyFor("reminder", "a", 1));
  });
});

describe("intervalLabel", () => {
  it("reads naturally across the range", () => {
    expect(intervalLabel(90)).toBe("seasonal");
    expect(intervalLabel(180)).toBe("six-monthly");
    expect(intervalLabel(365)).toBe("annual");
    expect(intervalLabel(730)).toBe("periodic");
  });
});

describe("composeMessage", () => {
  it("writes a reminder in the business's name, never ours", () => {
    const msg = composeMessage({
      kind: "reminder",
      businessName: "Ironclad Roofing",
      customerName: "Dana Reyes",
      intervalDays: 365,
      daysSince: 360,
    });
    expect(msg.subject).toContain("Ironclad Roofing");
    expect(msg.body).toContain("Dana");
    expect(msg.body).toContain("Ironclad Roofing");
    // No trace of the platform in a customer-facing send.
    expect(msg.body).not.toMatch(/PHX|Growth Plus|Claude|automation/i);
  });

  it("writes a warmer win-back for a dormant customer", () => {
    const msg = composeMessage({
      kind: "reactivate",
      businessName: "Ironclad Roofing",
      customerName: null,
      intervalDays: 365,
      daysSince: 800,
    });
    expect(msg.subject.toLowerCase()).toContain("back");
    // Degrades gracefully with no name.
    expect(msg.body).toContain("Hi there");
  });
});

describe("planComebacks", () => {
  const interval = 365;

  it("proposes a reminder for a customer coming due", () => {
    const out = planComebacks({
      businessName: "Ironclad",
      customers: [customer({ lastJobAt: daysAgo(360) })],
      intervalDays: interval,
      now: NOW,
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("reminder");
    expect(out[0]!.actionKind).toBe("comeback.reminder");
    expect(out[0]!.dedupeKey).toContain("comeback:reminder:lead-1");
    expect(out[0]!.payload.message.subject).toContain("Ironclad");
  });

  it("proposes a win-back for a dormant customer", () => {
    const out = planComebacks({
      businessName: "Ironclad",
      customers: [customer({ leadId: "old", lastJobAt: daysAgo(800) })],
      intervalDays: interval,
      now: NOW,
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.actionKind).toBe("comeback.reactivate");
  });

  it("skips a customer with no way to reach them", () => {
    const out = planComebacks({
      businessName: "Ironclad",
      customers: [customer({ email: null, phone: null, lastJobAt: daysAgo(360) })],
      intervalDays: interval,
      now: NOW,
    });
    expect(out).toHaveLength(0);
  });

  it("keeps a phone-only customer", () => {
    const out = planComebacks({
      businessName: "Ironclad",
      customers: [customer({ email: null, phone: "+1 555 0100", lastJobAt: daysAgo(360) })],
      intervalDays: interval,
      now: NOW,
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.payload.phone).toBe("+1 555 0100");
  });

  it("skips a customer nowhere near due, and one with a future job date", () => {
    const out = planComebacks({
      businessName: "Ironclad",
      customers: [
        customer({ leadId: "fresh", lastJobAt: daysAgo(30) }),
        customer({ leadId: "future", lastJobAt: daysAgo(-10) }),
      ],
      intervalDays: interval,
      now: NOW,
    });
    expect(out).toHaveLength(0);
  });

  it("works oldest-first and honours the cap", () => {
    const customers: PastCustomer[] = Array.from({ length: MAX_PER_RUN + 5 }, (_, i) => ({
      leadId: `lead-${i}`,
      name: `Cust ${i}`,
      company: null,
      email: `c${i}@example.com`,
      phone: null,
      // All dormant, staggered so the sort order is observable.
      lastJobAt: daysAgo(900 + i),
      valueCents: 100000,
    }));
    const out = planComebacks({ businessName: "X", customers, intervalDays: interval, now: NOW, cap: MAX_PER_RUN });
    expect(out).toHaveLength(MAX_PER_RUN);
    // The very oldest job is the very first proposal.
    expect(out[0]!.leadId).toBe(`lead-${MAX_PER_RUN + 4}`);
  });

  it("is idempotent in its keys — same input, same dedupe keys", () => {
    const args = {
      businessName: "Ironclad",
      customers: [customer({ lastJobAt: daysAgo(360) })],
      intervalDays: interval,
      now: NOW,
    };
    const a = planComebacks(args);
    const b = planComebacks(args);
    expect(a[0]!.dedupeKey).toBe(b[0]!.dedupeKey);
  });
});

describe("latestJobPerCustomer", () => {
  it("collapses repeat customers to their most recent job", () => {
    const lead = { name: "Dana", company: null, email: "d@x.com", phone: null };
    const rows = [
      { leadId: "a", createdAt: daysAgo(400), valueCents: 100, lead },
      { leadId: "a", createdAt: daysAgo(30), valueCents: 200, lead },
      { leadId: "b", createdAt: daysAgo(50), valueCents: 300, lead },
    ];
    const out = latestJobPerCustomer(rows);
    expect(out).toHaveLength(2);
    const a = out.find((c) => c.leadId === "a")!;
    expect(daysBetween(a.lastJobAt, NOW)).toBe(30);
    expect(a.valueCents).toBe(200);
  });

  it("drops rows with no linked lead", () => {
    const out = latestJobPerCustomer([
      { leadId: null, createdAt: daysAgo(400), valueCents: 100, lead: null },
      { leadId: "b", createdAt: daysAgo(400), valueCents: 100, lead: null },
    ]);
    expect(out).toHaveLength(0);
  });
});

describe("isDue", () => {
  it("runs when it has never run", () => {
    expect(isDue({ now: NOW, lastRunAt: null })).toBe(true);
  });

  it("waits out the daily interval", () => {
    const justRan = new Date(NOW.getTime() - (MIN_HOURS_BETWEEN_RUNS - 1) * 3_600_000);
    expect(isDue({ now: NOW, lastRunAt: justRan })).toBe(false);
    const longAgo = new Date(NOW.getTime() - (MIN_HOURS_BETWEEN_RUNS + 1) * 3_600_000);
    expect(isDue({ now: NOW, lastRunAt: longAgo })).toBe(true);
  });
});
