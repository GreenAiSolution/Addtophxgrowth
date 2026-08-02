import { describe, it, expect } from "vitest";
import {
  planFollowUp,
  FOLLOW_UP_LADDER,
  MIN_FOLLOW_UP_GAP_HOURS,
  type FollowUpOpportunity,
} from "@/lib/pipeline";

const T0 = new Date("2026-03-01T12:00:00Z");
const hours = (n: number) => new Date(T0.getTime() + n * 3_600_000);

function opp(over: Partial<FollowUpOpportunity> = {}): FollowUpOpportunity {
  return {
    stage: "NEW",
    createdAt: T0,
    followUpsSent: 0,
    lastFollowUpAt: null,
    respondedAt: null,
    stoppedAt: null,
    ...over,
  };
}

describe("the follow-up ladder", () => {
  it("is short and finite", () => {
    // The ladder is the whole promise about how much a stranger hears from us.
    // If somebody makes this ten rungs long, this test is where they find out
    // they have changed the product rather than a constant.
    expect(FOLLOW_UP_LADDER.length).toBeLessThanOrEqual(3);
  });

  it("escalates in time", () => {
    for (let i = 1; i < FOLLOW_UP_LADDER.length; i++) {
      expect(FOLLOW_UP_LADDER[i].afterHours).toBeGreaterThan(FOLLOW_UP_LADDER[i - 1].afterHours);
    }
  });

  it("never schedules two touches inside the minimum gap", () => {
    for (let i = 1; i < FOLLOW_UP_LADDER.length; i++) {
      expect(
        FOLLOW_UP_LADDER[i].afterHours - FOLLOW_UP_LADDER[i - 1].afterHours,
      ).toBeGreaterThanOrEqual(MIN_FOLLOW_UP_GAP_HOURS);
    }
  });

  it("does not fire on the same day they enquired", () => {
    // They have just been sent a receipt promising a human reply. Following up
    // an hour later contradicts it.
    expect(FOLLOW_UP_LADDER[0].afterHours).toBeGreaterThanOrEqual(24);
  });
});

describe("planFollowUp — every reason to stop beats every reason to send", () => {
  it("stops the moment they ask to stop", () => {
    const v = planFollowUp(opp({ stoppedAt: hours(1) }), hours(500));
    expect(v.do).toBe("stop");
  });

  it("stops the moment they reply", () => {
    const v = planFollowUp(opp({ respondedAt: hours(2) }), hours(500));
    expect(v.do).toBe("stop");
  });

  it("stops as soon as a human moves the stage", () => {
    for (const stage of ["WORKING", "WON", "LOST", "DORMANT"] as const) {
      expect(planFollowUp(opp({ stage }), hours(500)).do).toBe("stop");
    }
  });

  it("stops even when a stopped prospect still has rungs left", () => {
    // The dangerous combination: opted out on day one, ladder only one rung in.
    const v = planFollowUp(opp({ stoppedAt: hours(1), followUpsSent: 1 }), hours(100));
    expect(v.do).toBe("stop");
  });
});

describe("planFollowUp — timing", () => {
  it("waits out the first day", () => {
    expect(planFollowUp(opp(), hours(2)).do).toBe("wait");
    expect(planFollowUp(opp(), hours(23)).do).toBe("wait");
  });

  it("sends the nudge once a day has passed", () => {
    const v = planFollowUp(opp(), hours(25));
    expect(v.do).toBe("send");
    if (v.do === "send") expect(v.step).toBe("NUDGE");
  });

  it("walks the rungs in order", () => {
    const second = planFollowUp(opp({ followUpsSent: 1, lastFollowUpAt: hours(24) }), hours(97));
    expect(second.do).toBe("send");
    if (second.do === "send") expect(second.step).toBe("SECOND");

    const last = planFollowUp(opp({ followUpsSent: 2, lastFollowUpAt: hours(96) }), hours(241));
    expect(last.do).toBe("send");
    if (last.do === "send") expect(last.step).toBe("LAST_CALL");
  });

  it("honours the minimum gap even when the next rung is overdue", () => {
    const v = planFollowUp(opp({ followUpsSent: 1, lastFollowUpAt: hours(300) }), hours(301));
    expect(v.do).toBe("wait");
    if (v.do === "wait") expect(v.why).toContain("minimum gap");
  });

  it("goes dormant when the ladder runs out, and never sends a fourth", () => {
    const spent = opp({ followUpsSent: FOLLOW_UP_LADDER.length, lastFollowUpAt: hours(240) });
    expect(planFollowUp(spent, hours(1000)).do).toBe("dormant");
    expect(planFollowUp(spent, hours(10_000)).do).toBe("dormant");
  });

  it("cannot be walked past the end by a corrupt counter", () => {
    // followUpsSent higher than the ladder length must not index past it and
    // throw — it means the same thing as "finished".
    const v = planFollowUp(opp({ followUpsSent: 99 }), hours(1000));
    expect(v.do).toBe("dormant");
  });
});
