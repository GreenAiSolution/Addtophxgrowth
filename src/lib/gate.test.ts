import { describe, expect, it } from "vitest";
import {
  ACTION_KINDS,
  kindByKey,
  resolveHold,
  decide,
  canRelease,
  canWithdraw,
  isTerminal,
  autoReleaseAt,
  expiryFor,
  describeWait,
  hasExecutor,
  release,
  SWEEP_INTERVAL_MINUTES,
  type GateAction,
  type GateHold,
  type GateState,
} from "@/lib/gate";
import { UPGRADES } from "@/lib/upgrades";

/**
 * The gate is the only thing standing between an automation and a client's
 * customers, and the promise it enforces is published on a price list. So
 * these tests are not about whether the code runs — they are about whether the
 * three sentences the catalogue prints are true.
 *
 *   1. Anything that moves money waits for a named human.
 *   2. Nothing reaches a customer without being visible first.
 *   3. Every release is recorded against somebody.
 *
 * A bug here does not throw. It sends an invoice.
 */

const at = (iso: string) => new Date(iso);
const T0 = at("2026-08-01T09:00:00Z");

function action(over: Partial<GateAction> = {}): GateAction {
  return {
    id: "a1",
    kind: "comeback.reminder",
    hold: "TIMED",
    state: "HELD",
    releaseAt: at("2026-08-01T21:00:00Z"),
    expiresAt: at("2026-08-04T09:00:00Z"),
    ...over,
  };
}

describe("the registry is the thing that cannot be argued with", () => {
  it("holds every money-moving action manually, with no exceptions", () => {
    // The load-bearing assertion of the entire file. If this ever passes for
    // the wrong reason, the price list is lying.
    const money = ACTION_KINDS.filter((k) => k.movesMoney);
    expect(money.length, "no money-moving kinds — the check would be vacuous").toBeGreaterThan(0);
    for (const k of money) {
      expect(k.minimumHold, `${k.key} moves money but is not MANUAL`).toBe("MANUAL");
      expect(k.reviewWindowMinutes, `${k.key} has a review window it must never use`).toBeUndefined();
    }
  });

  it("gives every timed kind a window to actually be reviewed in", () => {
    for (const k of ACTION_KINDS.filter((k) => k.minimumHold === "TIMED")) {
      expect(k.reviewWindowMinutes, k.key).toBeGreaterThan(0);
      // A window longer than the expiry would mean it lapses before it sends.
      expect(k.reviewWindowMinutes!, `${k.key} sends after it expires`).toBeLessThan(
        k.expiresAfterHours * 60,
      );
    }
  });

  it("promises no review window the sweep cannot honour", () => {
    // A five-minute countdown swept hourly is a countdown connected to
    // nothing: the queue says "pull it in the next five minutes" and then
    // nothing happens for fifty-five more. The invariant is what stops the
    // cron schedule and the catalogue drifting apart silently.
    for (const k of ACTION_KINDS.filter((k) => k.reviewWindowMinutes)) {
      expect(k.reviewWindowMinutes!, `${k.key} sends later than it says`).toBeGreaterThanOrEqual(
        SWEEP_INTERVAL_MINUTES,
      );
    }
  });

  it("matches the cron that actually drives it", async () => {
    // Read from vercel.json rather than trusted from a comment. The constant
    // and the deployment have to agree or the invariant above is checking a
    // number nobody is honouring.
    const { readFile } = await import("node:fs/promises");
    const cfg = JSON.parse(
      await readFile(new URL("../../vercel.json", import.meta.url), "utf8"),
    ) as { crons: { path: string; schedule: string }[] };
    const gate = cfg.crons.find((c) => c.path.includes("gate"));
    expect(gate, "no cron drives the gate sweep").toBeDefined();
    const every = gate!.schedule.match(/^\*\/(\d+) /);
    expect(every, `gate cron "${gate!.schedule}" is not an every-N-minutes schedule`).not.toBeNull();
    expect(Number(every![1])).toBe(SWEEP_INTERVAL_MINUTES);
  });

  it("names only builds the catalogue actually sells", () => {
    // An action kind belonging to a product that does not exist would be a
    // queue entry no client ever agreed to.
    const builds = new Set(UPGRADES.filter((u) => u.build).map((u) => u.key));
    expect(builds.size).toBeGreaterThan(0);
    for (const k of ACTION_KINDS) {
      expect(builds.has(k.build), `${k.key} belongs to unknown build "${k.build}"`).toBe(true);
    }
  });

  it("covers both builds, so neither ships ungated", () => {
    for (const u of UPGRADES.filter((u) => u.build)) {
      expect(
        ACTION_KINDS.some((k) => k.build === u.key),
        `${u.key} has no gated actions at all`,
      ).toBe(true);
    }
  });

  it("has unique keys and resolves them", () => {
    const keys = ACTION_KINDS.map((k) => k.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(kindByKey("invoice.raise")?.movesMoney).toBe(true);
    expect(kindByKey("nope")).toBeUndefined();
  });
});

describe("a caller can ask for more supervision, never less", () => {
  it("refuses to weaken a manual hold, however it is asked", () => {
    const money = kindByKey("invoice.raise")!;
    for (const requested of [undefined, "TIMED", "MANUAL"] as (GateHold | undefined)[]) {
      expect(resolveHold(money, requested), `asked for ${requested}`).toBe("MANUAL");
    }
  });

  it("lets a timed kind be escalated to manual", () => {
    const timed = kindByKey("comeback.reminder")!;
    expect(resolveHold(timed, "MANUAL")).toBe("MANUAL");
    expect(resolveHold(timed, "TIMED")).toBe("TIMED");
    expect(resolveHold(timed, undefined)).toBe("TIMED");
  });

  it("never puts a release timer on a manual hold", () => {
    // Belt and braces: even if a manual kind somehow carried a window, an
    // action held manually must have no auto-release date at all.
    const money = kindByKey("payment.chase")!;
    expect(autoReleaseAt(money, "MANUAL", T0)).toBeNull();
    const timed = kindByKey("comeback.reminder")!;
    expect(autoReleaseAt(timed, "MANUAL", T0)).toBeNull();
    expect(autoReleaseAt(timed, "TIMED", T0)).toBeInstanceOf(Date);
  });
});

describe("what happens to an action, moment by moment", () => {
  it("never releases a manual hold on time alone", () => {
    // The single most important test here. A manual action left for a year
    // is still waiting for a person.
    const a = action({ kind: "invoice.raise", hold: "MANUAL", releaseAt: null });
    for (const t of ["2026-08-01T09:00:01Z", "2026-08-02T09:00:00Z", "2026-08-03T23:59:59Z"]) {
      expect(decide(a, at(t)).do, `at ${t}`).toBe("wait");
    }
  });

  it("never releases a manual hold even if something wrongly gave it a timer", () => {
    /*
      Defence in depth, and it needed proving.

      The version of this above passes a manual action with `releaseAt: null`,
      which is how `propose` builds one — so deleting the entire MANUAL branch
      out of `decide` left it green. The null was doing the work, not the
      branch, and the branch is the part that survives somebody backfilling a
      column or a migration defaulting a date.

      So: a manual hold carrying a release date that has already passed. If
      `decide` ever consults the timer before the hold, this is the invoice
      that goes out on its own.
    */
    const a = action({
      kind: "invoice.raise",
      hold: "MANUAL",
      releaseAt: at("2026-08-01T00:00:00Z"), // already elapsed at T0
    });
    expect(decide(a, T0).do).toBe("wait");
    expect(decide(a, at("2026-08-03T23:59:59Z")).do).toBe("wait");
  });

  it("releases a timed hold only after its window closes", () => {
    const a = action();
    expect(decide(a, at("2026-08-01T20:59:00Z")).do).toBe("wait");
    expect(decide(a, at("2026-08-01T21:00:00Z")).do).toBe("release");
  });

  it("expires rather than firing late", () => {
    // The ordering that matters: an action whose window closed after its
    // expiry must never go. Otherwise a three-day-old appointment reminder
    // arrives as though it were today's.
    const a = action({
      releaseAt: at("2026-08-05T09:00:00Z"),
      expiresAt: at("2026-08-04T09:00:00Z"),
    });
    expect(decide(a, at("2026-08-04T09:00:01Z")).do).toBe("expire");
  });

  it("expires a released action that never got run", () => {
    const a = action({ state: "RELEASED", expiresAt: at("2026-08-04T09:00:00Z") });
    expect(decide(a, at("2026-08-03T09:00:00Z")).do).toBe("execute");
    expect(decide(a, at("2026-08-04T09:00:01Z")).do).toBe("expire");
  });

  it("leaves every finished action alone, forever", () => {
    // Nothing revives. A withdrawn action must not come back on the next
    // sweep because a timer happened to elapse.
    for (const state of ["EXECUTED", "WITHDRAWN", "EXPIRED", "FAILED"] as GateState[]) {
      expect(isTerminal(state), state).toBe(true);
      const a = action({ state, releaseAt: at("2026-08-01T00:00:00Z") });
      expect(decide(a, at("2027-01-01T00:00:00Z")).do, state).toBe("wait");
    }
    expect(isTerminal("HELD")).toBe(false);
    expect(isTerminal("RELEASED")).toBe(false);
  });
});

describe("what a person is allowed to do", () => {
  it("lets a held, in-date action be released", () => {
    expect(canRelease(action(), T0)).toBe(true);
  });

  it("refuses to release an expired one", () => {
    expect(canRelease(action(), at("2026-08-05T09:00:00Z"))).toBe(false);
  });

  it("refuses to release anything already decided", () => {
    for (const state of ["RELEASED", "EXECUTED", "WITHDRAWN", "EXPIRED", "FAILED"] as GateState[]) {
      expect(canRelease(action({ state }), T0), state).toBe(false);
    }
  });

  it("lets anything that has not gone out still be pulled", () => {
    // Deliberately wider than release. The moment somebody wants to stop
    // something is the wrong moment for the rules to be clever.
    expect(canWithdraw(action({ state: "HELD" }))).toBe(true);
    expect(canWithdraw(action({ state: "RELEASED" }))).toBe(true);
    for (const state of ["EXECUTED", "WITHDRAWN", "EXPIRED", "FAILED"] as GateState[]) {
      expect(canWithdraw(action({ state })), state).toBe(false);
    }
  });
});

describe("the queue reads like something a person can act on", () => {
  it("says who it is waiting for", () => {
    expect(describeWait(action({ hold: "MANUAL" }), T0)).toBe("waiting for you");
  });

  it("counts down in units a human uses", () => {
    expect(describeWait(action({ releaseAt: at("2026-08-01T09:30:00Z") }), T0)).toBe("sends in 30 min");
    expect(describeWait(action({ releaseAt: at("2026-08-01T14:00:00Z") }), T0)).toBe("sends in 5h");
    expect(describeWait(action({ releaseAt: at("2026-08-03T09:00:00Z") }), T0)).toBe("sends in 2d");
    expect(describeWait(action({ releaseAt: at("2026-08-01T08:00:00Z") }), T0)).toBe("sending now");
  });

  it("reports a finished action as finished", () => {
    expect(describeWait(action({ state: "WITHDRAWN" }), T0)).toBe("withdrawn");
  });
});

describe("expiry windows are real durations", () => {
  it("computes them from the kind", () => {
    const k = kindByKey("invoice.raise")!;
    expect(expiryFor(k, T0).getTime() - T0.getTime()).toBe(k.expiresAfterHours * 3_600_000);
  });

  it("gives money-moving actions long enough for a person to get to them", () => {
    // A quote that lapses in an hour would train everybody to release without
    // reading, which is worse than no gate.
    for (const k of ACTION_KINDS.filter((k) => k.movesMoney)) {
      expect(k.expiresAfterHours, k.key).toBeGreaterThanOrEqual(24);
    }
  });
});

describe("a release always has a name on it", () => {
  /**
   * The catalogue says "every release is recorded against your name". That
   * guard lives in `release`, which touches the database — so it went untested
   * while every pure function around it was covered, and deleting the check
   * left the suite green.
   *
   * It does not need a database to test. The name check is the first line, and
   * it throws before Prisma is reached, which is itself the property worth
   * pinning: an anonymous release must be rejected on the way in, not
   * discovered later in a column that happens to be null.
   */
  it("refuses an empty or whitespace actor before touching anything", async () => {
    for (const name of ["", "   ", "\t"]) {
      await expect(release("any-id", { name }), `name: ${JSON.stringify(name)}`).rejects.toThrow(
        /recorded against a name/i,
      );
    }
  });
});

describe("an action nobody can perform never looks performed", () => {
  it("has no executors wired yet, and says so", () => {
    // Neither loop is built. The gate shipped first on purpose — a gate
    // retrofitted onto a running automation is a gate with a bypass. What
    // matters is that this state is visible rather than silently successful:
    // `sweep` marks such an action FAILED with a plain reason.
    for (const k of ACTION_KINDS) {
      expect(hasExecutor(k.key), `${k.key} claims an executor that does not exist`).toBe(false);
    }
  });
});
