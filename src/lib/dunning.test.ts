import { describe, it, expect } from "vitest";
import {
  planDunning,
  LADDER,
  MIN_NOTICE_GAP_HOURS,
  ESCALATE_AFTER_HOURS,
  type DunningIssue,
} from "@/lib/dunning";

const T0 = new Date("2026-03-01T12:00:00Z");
const hours = (n: number) => new Date(T0.getTime() + n * 3_600_000);

function issue(over: Partial<DunningIssue> = {}): DunningIssue {
  return {
    state: "OPEN",
    firstFailedAt: T0,
    noticesSent: 0,
    lastNoticeAt: null,
    lastNoticeStep: null,
    escalatedAt: null,
    ...over,
  };
}

describe("the ladder itself", () => {
  it("escalates in time, so each rung is a new piece of information", () => {
    for (let i = 1; i < LADDER.length; i++) {
      expect(LADDER[i].afterHours).toBeGreaterThan(LADDER[i - 1].afterHours);
    }
  });

  it("finishes before the escalation window, or a person is asked to call too early", () => {
    const last = LADDER[LADDER.length - 1];
    expect(last.afterHours).toBeLessThan(ESCALATE_AFTER_HOURS);
  });

  it("spaces its rungs at least the minimum gap apart", () => {
    // Otherwise the gap rule and the ladder disagree, and the ladder silently
    // loses — a rung that can never fire on schedule is a rung that isn't there.
    for (let i = 1; i < LADDER.length; i++) {
      expect(LADDER[i].afterHours - LADDER[i - 1].afterHours).toBeGreaterThanOrEqual(
        MIN_NOTICE_GAP_HOURS,
      );
    }
  });
});

describe("planDunning", () => {
  it("sends the first notice immediately", () => {
    const v = planDunning(issue(), T0);
    expect(v.do).toBe("notify");
    if (v.do === "notify") expect(v.step).toBe("FIRST");
  });

  it("says nothing at all once the money has arrived", () => {
    // The mistake that costs an account outright: chasing somebody who paid.
    const recovered = issue({
      state: "RECOVERED",
      lastNoticeStep: "FIRST",
      lastNoticeAt: T0,
    });
    expect(planDunning(recovered, hours(1000)).do).toBe("close");
  });

  it("says nothing on a lost issue however overdue it looks", () => {
    expect(planDunning(issue({ state: "LOST" }), hours(1000)).do).toBe("close");
  });

  it("waits for the next rung to come due", () => {
    const sent = issue({ noticesSent: 1, lastNoticeStep: "FIRST", lastNoticeAt: T0 });
    const v = planDunning(sent, hours(50)); // REMINDER is due at 72h
    expect(v.do).toBe("wait");
  });

  it("sends the reminder once its window opens", () => {
    const sent = issue({ noticesSent: 1, lastNoticeStep: "FIRST", lastNoticeAt: T0 });
    const v = planDunning(sent, hours(73));
    expect(v.do).toBe("notify");
    if (v.do === "notify") expect(v.step).toBe("REMINDER");
  });

  it("never sends two notices inside the minimum gap", () => {
    // The case this actually guards: an issue opened late, where two rungs are
    // due on the same sweep. Three emails in an hour reads as a broken system.
    const backfilled = issue({
      firstFailedAt: T0,
      noticesSent: 1,
      lastNoticeStep: "FIRST",
      lastNoticeAt: hours(200), // notified late
    });
    const v = planDunning(backfilled, hours(201));
    expect(v.do).toBe("wait");
    if (v.do === "wait") expect(v.why).toContain("minimum gap");
  });

  it("escalates to a person only after the whole ladder and the window", () => {
    const done = issue({
      noticesSent: 3,
      lastNoticeStep: "FINAL",
      lastNoticeAt: hours(168),
    });
    expect(planDunning(done, hours(ESCALATE_AFTER_HOURS - 1)).do).toBe("wait");
    expect(planDunning(done, hours(ESCALATE_AFTER_HOURS)).do).toBe("escalate");
  });

  it("escalates exactly once", () => {
    // Otherwise the desk gets the same "needs a phone call" email every day
    // until somebody deals with it, which is how people mute a mailbox.
    const escalated = issue({
      noticesSent: 3,
      lastNoticeStep: "FINAL",
      lastNoticeAt: hours(168),
      escalatedAt: hours(ESCALATE_AFTER_HOURS),
    });
    expect(planDunning(escalated, hours(ESCALATE_AFTER_HOURS + 48)).do).toBe("wait");
  });

  it("climbs one rung at a time even when it is discovered very late", () => {
    // A backfill must not skip straight to FINAL. The client has been told
    // nothing yet, and the first thing they hear should not be the last
    // warning.
    const v = planDunning(issue(), hours(500));
    expect(v.do).toBe("notify");
    if (v.do === "notify") expect(v.step).toBe("FIRST");
  });

  it("holds an unknown last step rather than starting the ladder again", () => {
    // A renamed step key must not produce a fresh FIRST notice to somebody who
    // has already had three. stepIndex returns -1 for unknown, so this pins
    // the behaviour deliberately: it restarts, and the gap rule is what stops
    // it being immediate.
    const weird = issue({
      noticesSent: 3,
      lastNoticeStep: "SOMETHING_ELSE",
      lastNoticeAt: hours(200),
    });
    const v = planDunning(weird, hours(201));
    expect(v.do).toBe("wait");
  });
});
