import { describe, expect, it } from "vitest";
import {
  CREW,
  EMPLOYEES,
  actionsFor,
  crewRing,
  employeeByKey,
  employeeForAction,
  isCustomerInitiated,
  needsRelease,
  upgradeFor,
  type Trigger,
} from "@/lib/employees";
import { ACTION_KINDS, kindByKey } from "@/lib/gate";
import { FLIGHT_PLANS, OPERATORS, UPGRADES } from "@/lib/upgrades";

/**
 * The crew is three employees the site already sells and had never built. These
 * tests hold it to the two rules the rest of the repository is held to: it may
 * not duplicate work somebody is already paying for, and it may not claim an
 * outcome it cannot show.
 */

describe("the crew is attached to what is actually sold", () => {
  it("has three employees with distinct keys and names", () => {
    expect(EMPLOYEES).toHaveLength(3);
    expect(new Set(EMPLOYEES.map((e) => e.key)).size).toBe(3);
    expect(new Set(EMPLOYEES.map((e) => e.name)).size).toBe(3);
  });

  it("every employee answers for an upgrade on the price list", () => {
    // The invariant block in employees.ts throws at import, so this failing
    // means the module did not even load — but it is asserted here too because
    // the whole point is that renaming an upgrade must not leave an employee
    // delivering something nobody sells.
    for (const e of EMPLOYEES) {
      const upgrade = upgradeFor(e);
      expect(upgrade, `${e.name} delivers "${e.delivers}", which is not an upgrade`).toBeDefined();
      expect(UPGRADES.some((u) => u.key === e.delivers)).toBe(true);
    }
  });

  it("covers the phone and the job runner, which are the two that had no code", () => {
    const delivered = new Set(EMPLOYEES.map((e) => e.delivers));
    expect(delivered.has("voice-employee")).toBe(true);
    expect(delivered.has("job-runner")).toBe(true);
  });

  it("claims no gate action the gate has never heard of", () => {
    for (const e of EMPLOYEES) {
      for (const key of e.actions) {
        expect(kindByKey(key), `${e.name} claims "${key}"`).toBeDefined();
      }
      expect(actionsFor(e)).toHaveLength(e.actions.length);
    }
  });

  it("gives every crew action back to exactly one employee", () => {
    const claimed = EMPLOYEES.flatMap((e) => e.actions);
    expect(new Set(claimed).size, "two employees claim the same action").toBe(claimed.length);
    for (const key of claimed) {
      expect(employeeForAction(key)?.actions).toContain(key);
    }
    expect(employeeForAction("not-a-kind")).toBeUndefined();
  });

  it("does not take a name or a job from the parent's ten operators", () => {
    // The rule that has already cut seven upgrades, applied one layer down.
    // An employee called Closer, or one whose duty list reads like Echo's, is
    // the same duplication in a place no test was watching.
    const parentNames = new Set(OPERATORS.map((o) => o.name.toLowerCase()));
    for (const e of EMPLOYEES) {
      expect(parentNames.has(e.name.toLowerCase()), `${e.name} is already an operator`).toBe(false);
    }
  });

  it("stops where Closer starts", () => {
    // Closer "runs a persistent follow-up cadence across email, SMS and DM
    // until the deal is booked or dead". No employee may sell that back.
    const duties = EMPLOYEES.flatMap((e) => e.duties).join(" ").toLowerCase();
    expect(duties).not.toMatch(/follow-up cadence/);
    expect(duties).not.toMatch(/\bdm\b/);
  });
});

describe("the ring closes", () => {
  it("walks all three and returns to where it started", () => {
    const ring = crewRing();
    expect(ring).toHaveLength(3);
    expect(new Set(ring).size).toBe(3);
    // crewRing stops when it revisits; the last one handing back to the first
    // is what makes the walk terminate at exactly three.
    expect(employeeByKey(ring[ring.length - 1])?.handsTo).toBe(ring[0]);
  });

  it("closes from whichever employee you start at", () => {
    for (const e of EMPLOYEES) {
      expect(crewRing(e.key), `starting at ${e.name}`).toHaveLength(3);
    }
  });

  it("never points an employee at itself", () => {
    for (const e of EMPLOYEES) {
      expect(e.handsTo, `${e.name} hands to itself`).not.toBe(e.key);
    }
  });
});

describe("who started it decides whether the gate is consulted", () => {
  const customer: Trigger[] = [
    "customer-called",
    "customer-submitted",
    "customer-replied",
    "customer-booked",
  ];

  it("never holds a response to somebody who contacted us", () => {
    // This is the one that matters. The value of answering a phone is that it
    // happens now; a five-minute supervised text-back is a late text-back.
    for (const t of customer) {
      expect(isCustomerInitiated(t), t).toBe(true);
      expect(needsRelease(t), `${t} must not wait for a release`).toBe(false);
    }
  });

  it("always holds contact the business decided to make", () => {
    expect(isCustomerInitiated("business-initiated")).toBe(false);
    expect(needsRelease("business-initiated")).toBe(true);
  });
});

describe("the gate registry stays honest as the crew grows", () => {
  it("proposes only under an upgrade the catalogue sells as a build", () => {
    // The crew has no build key of its own, deliberately. Every action an
    // employee proposes rides the upgrade whose promise it answers for, so a
    // queue entry can always be traced to something the client bought.
    const sold = new Set(UPGRADES.filter((u) => u.build).map((u) => u.key));
    for (const e of EMPLOYEES) {
      for (const kind of actionsFor(e)) {
        expect(sold.has(kind.build), `${e.name}'s "${kind.key}" bills to "${kind.build}"`).toBe(
          true,
        );
      }
    }
  });

  it("holds the switchboard's outbound calls under the upgrade that sells them", () => {
    // Adding outbound dialling is what turned The Voice Employee into a loop
    // that runs unattended. The catalogue had to say so — and a build with no
    // gated action would be a published oversight promise with nothing behind
    // it, which is the failure this pins.
    expect(kindByKey("call.outbound")?.build).toBe("voice-employee");
    const voice = UPGRADES.find((u) => u.key === "voice-employee")!;
    expect(voice.build, "the switchboard dials out; that is a running loop").toBe(true);
    expect(voice.oversight).toBeDefined();
  });

  it("lets nothing the crew initiates commit a price on a timer", () => {
    const crewKinds = EMPLOYEES.flatMap((e) => actionsFor(e));
    expect(crewKinds.length).toBeGreaterThan(0);
    for (const k of crewKinds) {
      if (k.movesMoney) {
        expect(k.minimumHold, `${k.key} moves money`).toBe("MANUAL");
      }
    }
  });

  it("keeps pricing on the one kind that already existed", () => {
    // The estimator uses quote.send rather than minting a second way to send a
    // price. Two kinds meaning the same thing is two minimum holds that can
    // drift, and the looser one is the one nobody notices.
    const estimator = employeeByKey("estimator")!;
    expect(estimator.actions).toEqual(["quote.send"]);
    expect(kindByKey("quote.send")?.movesMoney).toBe(true);
    expect(kindByKey("quote.send")?.minimumHold).toBe("MANUAL");
    expect(ACTION_KINDS.some((k) => k.key === "estimate.send")).toBe(false);
  });
});

describe("the crew claims a mechanism, never a result", () => {
  const copy = [
    CREW.headline,
    CREW.body,
    CREW.boundary,
    ...EMPLOYEES.flatMap((e) => [e.leak, e.winsBy, ...e.duties]),
  ].join(" ");

  it("quotes no percentage that is not one of the real fee rates", () => {
    const feeRates = new Set(FLIGHT_PLANS.map((p) => p.fee.match(/\d+%/)![0]));
    for (const pct of copy.match(/\d+(\.\d+)?\s?%/g) ?? []) {
      expect(feeRates.has(pct.replace(/\s/g, "")), `"${pct}" is invented`).toBe(true);
    }
  });

  it("quotes no multiple and guarantees no result", () => {
    expect(copy).not.toMatch(/\d+(\.\d+)?\s?[x×]\s/i);
    expect(copy).not.toMatch(/\d+(\.\d+)?\s?[x×]\s+(more|better|faster|higher|return)/i);
    expect(copy).not.toMatch(/\b(guarantee[ds]?|guaranteed) (results?|roas|revenue|growth|clients?)\b/i);
  });

  it("says out loud that it recovers demand rather than creating it", () => {
    // Without this the reader is left to assume the crew is a growth channel,
    // which would be both a promise it cannot keep and a duplication of the ad
    // account next door.
    expect(CREW.boundary.length).toBeGreaterThan(40);
    expect(CREW.boundary.toLowerCase()).toMatch(/ad account|phx\/growth/);
  });

  it("argues each leak and each mechanism rather than sloganising", () => {
    for (const e of EMPLOYEES) {
      expect(e.leak.length, `${e.name} leak`).toBeGreaterThan(60);
      expect(e.winsBy.length, `${e.name} winsBy`).toBeGreaterThan(120);
      expect(e.duties.length, `${e.name} duties`).toBeGreaterThanOrEqual(4);
      for (const d of e.duties) {
        expect(d.length, `${e.name}: "${d}"`).toBeGreaterThan(20);
      }
    }
  });
});
