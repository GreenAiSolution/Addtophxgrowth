import { describe, expect, it } from "vitest";
import {
  attributionOf,
  headlines,
  scoreboard,
  stillLeaking,
  wouldHaveBeenMissed,
  type ScoredBooking,
  type ScoredCall,
  type ScoredEstimate,
  type ScoreboardInput,
} from "@/lib/scoreboard";
import { DEFAULT_HOURS } from "@/lib/booking";

const PHX = "America/Phoenix";

/** Monday 2026-08-03. 16:00Z = 9am Phoenix (open). 06:00Z = 11pm Sunday (shut). */
const IN_HOURS = new Date("2026-08-03T16:00:00Z");
const OUT_OF_HOURS = new Date("2026-08-03T06:00:00Z");

const call = (over: Partial<ScoredCall> = {}): ScoredCall => ({
  direction: "INBOUND",
  outcome: "QUALIFIED",
  startedAt: IN_HOURS,
  textBackSentAt: null,
  ...over,
});

const base = (over: Partial<ScoreboardInput> = {}): ScoreboardInput => ({
  calls: [],
  estimates: [],
  bookings: [],
  outcomes: [],
  hours: DEFAULT_HOURS,
  timeZone: PHX,
  ...over,
});

describe("the one defensible counterfactual", () => {
  it("counts a call answered when the business was shut", () => {
    // Not an assumption about human behaviour: the client's own working week
    // against the call's own timestamp, both of which they entered.
    expect(wouldHaveBeenMissed(call({ startedAt: OUT_OF_HOURS }), DEFAULT_HOURS, PHX)).toBe(true);
  });

  it("does not count a call answered during working hours", () => {
    // Some of these genuinely would have been missed. Undercounting in our own
    // disfavour is the only bias this file is allowed to have.
    expect(wouldHaveBeenMissed(call({ startedAt: IN_HOURS }), DEFAULT_HOURS, PHX)).toBe(false);
  });

  it("makes no claim at all when the client has stated no hours", () => {
    expect(wouldHaveBeenMissed(call({ startedAt: OUT_OF_HOURS }), [], PHX)).toBe(false);
  });

  it("does not count a call that was never answered", () => {
    for (const outcome of ["MISSED", "VOICEMAIL", "FAILED"] as const) {
      expect(
        wouldHaveBeenMissed(call({ startedAt: OUT_OF_HOURS, outcome }), DEFAULT_HOURS, PHX),
        outcome,
      ).toBe(false);
    }
  });

  it("does not count outbound calls", () => {
    // We chose when to place those. Nobody was trying to reach anybody.
    expect(
      wouldHaveBeenMissed(
        call({ direction: "OUTBOUND", startedAt: OUT_OF_HOURS }),
        DEFAULT_HOURS,
        PHX,
      ),
    ).toBe(false);
  });

  it("judges by when the call started, not how long it ran", () => {
    // A long call that started five minutes before closing was still answered
    // by somebody who had gone home; stretching the window by call length would
    // start counting in-hours calls as out-of-hours ones.
    const long = call({ startedAt: IN_HOURS, durationSeconds: 9 * 3600 });
    expect(wouldHaveBeenMissed(long, DEFAULT_HOURS, PHX)).toBe(false);
  });
});

describe("counting calls", () => {
  it("separates answered, missed and reopened", () => {
    const s = scoreboard(
      base({
        calls: [
          call({ outcome: "QUALIFIED" }),
          call({ outcome: "BOOKED", startedAt: OUT_OF_HOURS }),
          call({ outcome: "MISSED", textBackSentAt: new Date() }),
          call({ outcome: "MISSED" }),
          call({ outcome: "VOICEMAIL" }),
        ],
      }),
    );
    expect(s.answered).toBe(2);
    expect(s.outsideHours).toBe(1);
    expect(s.stillMissed).toBe(3);
    expect(s.reopened).toBe(1);
  });

  it("ignores outbound calls in the inbound counts", () => {
    const s = scoreboard(
      base({ calls: [call({ direction: "OUTBOUND", outcome: "QUALIFIED" })] }),
    );
    expect(s.answered).toBe(0);
  });

  it("never counts a call as both answered and missed", () => {
    const calls: ScoredCall[] = [
      call({ outcome: "QUALIFIED" }),
      call({ outcome: "MESSAGE" }),
      call({ outcome: "MISSED" }),
      call({ outcome: "FAILED" }),
    ];
    const s = scoreboard(base({ calls }));
    expect(s.answered + s.stillMissed).toBeLessThanOrEqual(calls.length);
  });
});

describe("counting estimates", () => {
  const raised = new Date("2026-08-03T16:00:00Z");
  const est = (over: Partial<ScoredEstimate> = {}): ScoredEstimate => ({
    status: "SENT",
    createdAt: raised,
    sentAt: new Date(raised.getTime() + 3_600_000),
    totalCents: 50000,
    ...over,
  });

  it("counts only estimates that actually went", () => {
    const s = scoreboard(base({ estimates: [est(), est({ sentAt: null, status: "DRAFT" })] }));
    expect(s.estimatesSent).toBe(1);
  });

  it("counts same-day against when the job was raised", () => {
    const s = scoreboard(
      base({
        estimates: [
          est(),
          est({ sentAt: new Date(raised.getTime() + 3 * 86_400_000) }),
        ],
      }),
    );
    expect(s.estimatesSent).toBe(2);
    expect(s.sentSameDay).toBe(1);
  });

  it("counts an estimate sent exactly a day later as same-day", () => {
    const s = scoreboard(
      base({ estimates: [est({ sentAt: new Date(raised.getTime() + 86_400_000) })] }),
    );
    expect(s.sentSameDay).toBe(1);
  });

  it("counts acceptances", () => {
    const s = scoreboard(base({ estimates: [est({ status: "ACCEPTED" }), est()] }));
    expect(s.estimatesAccepted).toBe(1);
  });
});

describe("counting bookings", () => {
  const bk = (over: Partial<ScoredBooking> = {}): ScoredBooking => ({
    source: "WEB",
    status: "BOOKED",
    startsAt: new Date("2026-08-10T16:00:00Z"),
    createdAt: IN_HOURS,
    ...over,
  });

  it("counts the ones taken on the call separately", () => {
    const s = scoreboard(base({ bookings: [bk({ source: "PHONE" }), bk(), bk()] }));
    expect(s.booked).toBe(3);
    expect(s.bookedOnTheCall).toBe(1);
  });

  it("does not count a cancelled booking as held", () => {
    const s = scoreboard(base({ bookings: [bk(), bk({ status: "CANCELLED" })] }));
    expect(s.booked).toBe(2);
    expect(s.bookingsHeld).toBe(1);
  });
});

describe("money is only ever what the client logged", () => {
  it("returns null when nothing has been logged", () => {
    // Not a zeroed object. Zero reads as "it earned nothing"; null reads as
    // "you haven't told us yet", and those are very different sentences to put
    // in front of somebody deciding whether to keep paying.
    expect(attributionOf([])).toBeNull();
    expect(scoreboard(base()).attribution).toBeNull();
  });

  it("counts wins and losses the client recorded", () => {
    const a = attributionOf([
      { kind: "WON", valueCents: 120000, createdAt: new Date() },
      { kind: "WON", valueCents: 80000, createdAt: new Date() },
      { kind: "LOST", createdAt: new Date() },
    ])!;
    expect(a.won).toBe(2);
    expect(a.lost).toBe(1);
    expect(a.wonValueCents).toBe(200000);
  });

  it("reports no value rather than zero when deals carry none", () => {
    // A deal logged without a value is not a deal worth nothing.
    const a = attributionOf([{ kind: "WON", createdAt: new Date() }])!;
    expect(a.won).toBe(1);
    expect(a.wonValueCents).toBeNull();
  });

  it("never infers a value from an average job size", () => {
    const a = attributionOf([
      { kind: "WON", valueCents: 100000, createdAt: new Date() },
      { kind: "WON", valueCents: null, createdAt: new Date() },
    ])!;
    // Only the one with a number contributes. The unvalued win is not filled in
    // from its sibling.
    expect(a.wonValueCents).toBe(100000);
  });
});

describe("every headline carries its own derivation", () => {
  it("states a basis for all three", () => {
    // Not a tooltip and not optional. A number on a dashboard with no stated
    // method is a number a client eventually stops believing.
    for (const h of headlines(scoreboard(base()))) {
      expect(h.basis.length, h.label).toBeGreaterThan(40);
      expect(h.label.length).toBeGreaterThan(5);
      expect(Number.isFinite(h.value)).toBe(true);
    }
  });

  it("quotes no percentage or multiple anywhere", () => {
    // Held to the same bar as the public catalogue.
    const copy = [
      ...headlines(scoreboard(base())).flatMap((h) => [h.label, h.basis]),
      stillLeaking(scoreboard(base({ calls: [call({ outcome: "MISSED" })] }))) ?? "",
    ].join(" ");
    expect(copy).not.toMatch(/\d+(\.\d+)?\s?%/);
    expect(copy).not.toMatch(/\d+(\.\d+)?\s?[x×]\s/i);
  });
});

describe("the honest negative", () => {
  it("names what is still leaking", () => {
    // A scoreboard that only counts wins is marketing.
    const s = scoreboard(base({ calls: [call({ outcome: "MISSED" }), call({ outcome: "MISSED" })] }));
    expect(stillLeaking(s)).toMatch(/still a leak/);
  });

  it("says so when every missed call was chased", () => {
    const s = scoreboard(
      base({ calls: [call({ outcome: "MISSED", textBackSentAt: new Date() })] }),
    );
    expect(stillLeaking(s)).toMatch(/recovery text/);
    expect(stillLeaking(s)).not.toMatch(/still a leak/);
  });

  it("stays quiet when nothing was missed at all", () => {
    expect(stillLeaking(scoreboard(base()))).toBeNull();
  });

  it("gets its plurals right", () => {
    const one = scoreboard(base({ calls: [call({ outcome: "MISSED" })] }));
    expect(stillLeaking(one)).toContain("1 call rang out");
    const two = scoreboard(
      base({ calls: [call({ outcome: "MISSED" }), call({ outcome: "MISSED" })] }),
    );
    expect(stillLeaking(two)).toContain("2 calls rang out");
  });
});

describe("an empty account", () => {
  it("counts zero of everything without throwing", () => {
    const s = scoreboard(base());
    for (const [key, value] of Object.entries(s)) {
      if (key === "attribution") continue;
      expect(value, key).toBe(0);
    }
  });
});
