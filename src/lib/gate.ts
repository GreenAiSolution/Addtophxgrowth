/**
 * THE GATE.
 *
 * DIRECTION
 *   The upgrade catalogue makes a promise for every automation build, in
 *   writing, on a public price list:
 *
 *     The Job Runner — "Anything that moves money — a quote going out, an
 *     invoice being raised, a chase being sent — waits at a gate until you
 *     release it, and every release is recorded against your name."
 *
 *     The Comeback — "Nothing reaches a past customer without being visible to
 *     you first. You can read the queue before it sends, pull anybody out of
 *     it, and see afterwards exactly who was contacted, when, and what came
 *     back."
 *
 *   This file is that promise, and it is deliberately the first thing built —
 *   before either loop exists. A gate retrofitted onto a running automation is
 *   a gate with a bypass, because the bypass is how it ran for the weeks
 *   before the gate arrived.
 *
 *   The parent publishes the standard we are working to: every loop
 *   "inspectable node by node for as long as we fly together, never a black
 *   box". An automation sold beside that page has to be openable.
 *
 * THE LOAD-BEARING IDEA
 *   The *kind* of action decides the minimum hold, not the caller.
 *
 *   If an agent could choose its own hold, the promise would be worth nothing
 *   the first time a prompt went strange or a refactor passed the wrong
 *   argument — an invoice would go out on a timer because something asked
 *   nicely. `ACTION_KINDS` is a fixed registry, `resolveHold` can only ever
 *   make a hold stricter, and `propose` reads the registry rather than the
 *   argument. A caller asking for a weaker gate than its action kind allows
 *   gets the stricter one and no error, because failing closed silently is
 *   correct here and failing open loudly is not.
 *
 * BLUEPRINTS
 *   Everything that decides *what happens to an action* is pure and tested —
 *   `resolveHold`, `decide`, `canRelease`, `canWithdraw`, `isTerminal`. Only
 *   the four functions at the bottom touch the database, and none of them make
 *   a decision the pure layer has not already made. This is the same split
 *   `night-shift.ts` uses, for the same reason: the interesting logic should be
 *   testable without a Postgres.
 *
 *   There is no model call anywhere in this file. The gate must behave
 *   identically on a day the Anthropic API is down.
 */

import { prisma } from "@/lib/prisma";

export type GateHold = "MANUAL" | "TIMED";
export type GateState =
  | "HELD"
  | "RELEASED"
  | "EXECUTED"
  | "WITHDRAWN"
  | "EXPIRED"
  | "FAILED";

/** Which build proposed an action. */
export type BuildKey = "job-runner" | "comeback";

export interface ActionKind {
  key: string;
  build: BuildKey;
  /** What the queue calls it. */
  label: string;
  /**
   * True when releasing this costs somebody money, bills somebody, or commits
   * a price. These can never be held on a timer.
   */
  movesMoney: boolean;
  /**
   * The weakest hold this kind may ever run under. `resolveHold` will not go
   * below it whatever a caller asks for.
   */
  minimumHold: GateHold;
  /** TIMED kinds only: how long the queue is visible before it sends. */
  reviewWindowMinutes?: number;
  /** How long a proposal stays actionable before it lapses unfired. */
  expiresAfterHours: number;
}

/**
 * Every action either build may ever propose.
 *
 * Deliberately closed. An agent cannot invent a kind at runtime — `propose`
 * rejects an unknown key — because an unregistered kind would be an action
 * with no declared money status and no declared minimum hold, which is exactly
 * the thing this file exists to make impossible.
 */
export const ACTION_KINDS: ActionKind[] = [
  // ---- The Job Runner: yes → scheduled → done → invoiced → paid ----
  {
    key: "quote.send",
    build: "job-runner",
    label: "Send a quote",
    // A quote is a price commitment. It is the number the customer holds us to.
    movesMoney: true,
    minimumHold: "MANUAL",
    expiresAfterHours: 72,
  },
  {
    key: "invoice.raise",
    build: "job-runner",
    label: "Raise an invoice",
    movesMoney: true,
    minimumHold: "MANUAL",
    expiresAfterHours: 168,
  },
  {
    key: "payment.chase",
    build: "job-runner",
    label: "Chase a payment",
    // Chasing the wrong customer, or one who already paid, is the fastest way
    // to lose an account. Always a person.
    movesMoney: true,
    minimumHold: "MANUAL",
    expiresAfterHours: 72,
  },
  {
    key: "job.schedule",
    build: "job-runner",
    label: "Put a job on the schedule",
    movesMoney: false,
    minimumHold: "TIMED",
    reviewWindowMinutes: 30,
    expiresAfterHours: 24,
  },
  {
    key: "job.status",
    build: "job-runner",
    label: "Send a status message",
    // "Running late", "on site", "finished". Time-critical — a thirty-minute
    // hold would make it a lie — but still visible before it goes.
    movesMoney: false,
    minimumHold: "TIMED",
    reviewWindowMinutes: 5,
    expiresAfterHours: 6,
  },

  // ---- The Comeback: the re-book loop ----
  {
    key: "comeback.reminder",
    build: "comeback",
    label: "Remind a past customer",
    movesMoney: false,
    minimumHold: "TIMED",
    reviewWindowMinutes: 720,
    expiresAfterHours: 72,
  },
  {
    key: "comeback.reactivate",
    build: "comeback",
    label: "Re-approach a dormant customer",
    movesMoney: false,
    minimumHold: "TIMED",
    reviewWindowMinutes: 720,
    expiresAfterHours: 168,
  },
];

/**
 * How often the sweep runs, from `vercel.json`.
 *
 * This is a real constraint on what a review window can promise, not a
 * deployment detail. A window shorter than the sweep interval says "you have
 * five minutes to pull this" and then does not send for an hour — the queue
 * shows a countdown that is not connected to anything. The invariant below
 * fails a kind that claims a window the infrastructure cannot honour, which is
 * the only way to stop the two drifting apart when somebody edits the cron.
 */
export const SWEEP_INTERVAL_MINUTES = 5;

export function kindByKey(key: string): ActionKind | undefined {
  return ACTION_KINDS.find((k) => k.key === key);
}

/** Fail at import rather than shipping a kind the queue cannot describe. */
for (const k of ACTION_KINDS) {
  if (k.movesMoney && k.minimumHold !== "MANUAL") {
    throw new Error(
      `Action kind "${k.key}" moves money but is not held manually. The catalogue promises otherwise.`,
    );
  }
  if (k.minimumHold === "TIMED" && !k.reviewWindowMinutes) {
    throw new Error(`Action kind "${k.key}" is held on a timer with no review window.`);
  }
  if (k.reviewWindowMinutes && k.reviewWindowMinutes < SWEEP_INTERVAL_MINUTES) {
    throw new Error(
      `Action kind "${k.key}" promises a ${k.reviewWindowMinutes}-minute window, ` +
        `but the sweep only runs every ${SWEEP_INTERVAL_MINUTES}. It would send late.`,
    );
  }
}

/**
 * The effective hold for an action.
 *
 * Only ever equal to or stricter than the kind's minimum. A caller asking for
 * TIMED on a MANUAL kind gets MANUAL; a caller asking for MANUAL on a TIMED
 * kind gets MANUAL, because asking for more supervision is always allowed.
 */
export function resolveHold(kind: ActionKind, requested?: GateHold): GateHold {
  if (kind.minimumHold === "MANUAL") return "MANUAL";
  return requested === "MANUAL" ? "MANUAL" : "TIMED";
}

const TERMINAL: GateState[] = ["EXECUTED", "WITHDRAWN", "EXPIRED", "FAILED"];

/** Nothing revives an action that has already finished, one way or another. */
export function isTerminal(state: GateState): boolean {
  return TERMINAL.includes(state);
}

export interface GateAction {
  id: string;
  kind: string;
  hold: GateHold;
  state: GateState;
  releaseAt: Date | null;
  expiresAt: Date;
}

export type GateVerdict =
  | { do: "wait"; why: string }
  | { do: "release"; why: string }
  | { do: "execute"; why: string }
  | { do: "expire"; why: string };

/**
 * What should happen to this action right now.
 *
 * The whole state machine, pure, so the sweep is a loop over `decide` rather
 * than a pile of conditionals inside a database transaction.
 *
 * Order matters: expiry is checked before release, so an action whose review
 * window closed *after* its expiry never fires. That ordering is the
 * difference between "we held it too long so we dropped it" and "we sent a
 * three-day-old appointment reminder".
 */
export function decide(action: GateAction, now: Date): GateVerdict {
  if (isTerminal(action.state)) {
    return { do: "wait", why: `already ${action.state.toLowerCase()}` };
  }

  if (now >= action.expiresAt) {
    return {
      do: "expire",
      why:
        action.state === "RELEASED"
          ? "released but not executed before it lapsed"
          : "nobody released it in time",
    };
  }

  if (action.state === "RELEASED") {
    return { do: "execute", why: "released and still in date" };
  }

  // HELD.
  if (action.hold === "MANUAL") {
    return { do: "wait", why: "waiting for a named release" };
  }
  if (action.releaseAt && now >= action.releaseAt) {
    return { do: "release", why: "review window closed with nobody pulling it" };
  }
  return { do: "wait", why: "inside the review window" };
}

/** A human may only release something still held and still in date. */
export function canRelease(action: GateAction, now: Date): boolean {
  return action.state === "HELD" && now < action.expiresAt;
}

/**
 * A human may pull anything that has not already gone out.
 *
 * Deliberately wider than `canRelease`: a RELEASED action that has not yet
 * executed is still stoppable, and the moment somebody wants to stop something
 * is exactly the moment the rules should not be clever.
 */
export function canWithdraw(action: GateAction): boolean {
  return action.state === "HELD" || action.state === "RELEASED";
}

/** When a TIMED action will go if nobody touches it. Null for manual holds. */
export function autoReleaseAt(kind: ActionKind, hold: GateHold, from: Date): Date | null {
  if (hold !== "TIMED" || !kind.reviewWindowMinutes) return null;
  return new Date(from.getTime() + kind.reviewWindowMinutes * 60_000);
}

export function expiryFor(kind: ActionKind, from: Date): Date {
  return new Date(from.getTime() + kind.expiresAfterHours * 3_600_000);
}

/** Skimmable countdown for the queue. Pure so it can be tested and reused. */
export function describeWait(action: GateAction, now: Date): string {
  if (isTerminal(action.state)) return action.state.toLowerCase();
  if (action.hold === "MANUAL") return "waiting for you";
  if (!action.releaseAt) return "waiting";
  const mins = Math.round((action.releaseAt.getTime() - now.getTime()) / 60_000);
  if (mins <= 0) return "sending now";
  if (mins < 60) return `sends in ${mins} min`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `sends in ${hours}h` : `sends in ${Math.round(hours / 24)}d`;
}

// ---------------------------------------------------------------------------
// Everything below here touches the database. Nothing below here decides
// anything the pure layer has not already decided.
// ---------------------------------------------------------------------------

/**
 * An executor actually performs a released action — sends the SMS, raises the
 * invoice. Registered by the build that owns the kind.
 *
 * Nothing is registered yet, because neither loop is built. That is deliberate
 * and it is why `runReleased` records FAILED with a plain reason rather than
 * quietly reporting success: an action nobody can perform must never look like
 * one that was performed.
 */
export type Executor = (payload: unknown) => Promise<Record<string, unknown>>;

const EXECUTORS = new Map<string, Executor>();

export function registerExecutor(kindKey: string, fn: Executor): void {
  if (!kindByKey(kindKey)) {
    throw new Error(`Cannot register an executor for unknown action kind "${kindKey}"`);
  }
  EXECUTORS.set(kindKey, fn);
}

/** Exposed for tests and for the queue, which warns when a kind is unwired. */
export function hasExecutor(kindKey: string): boolean {
  return EXECUTORS.has(kindKey);
}

export interface ProposeInput {
  clientId: string;
  kind: string;
  summary: string;
  subject?: string;
  payload: Record<string, unknown>;
  /** Only ever honoured when it is stricter than the kind's minimum. */
  hold?: GateHold;
  /**
   * Idempotency key, unique per client. A loop waking twice on the same due
   * job must produce the same key both times.
   */
  dedupeKey: string;
  now?: Date;
}

/**
 * Queue an action. Returns the existing row if this client has already
 * proposed the same `dedupeKey`, so a re-running agent is safe by
 * construction rather than by remembering to check.
 */
export async function propose(input: ProposeInput) {
  const kind = kindByKey(input.kind);
  if (!kind) throw new Error(`Unknown action kind "${input.kind}"`);

  const now = input.now ?? new Date();
  const hold = resolveHold(kind, input.hold);

  const existing = await prisma.pendingAction.findUnique({
    where: { clientId_dedupeKey: { clientId: input.clientId, dedupeKey: input.dedupeKey } },
  });
  if (existing) return existing;

  return prisma.pendingAction.create({
    data: {
      clientId: input.clientId,
      build: kind.build,
      kind: kind.key,
      hold,
      state: "HELD",
      movesMoney: kind.movesMoney,
      summary: input.summary,
      subject: input.subject ?? null,
      payload: input.payload as never,
      releaseAt: autoReleaseAt(kind, hold, now),
      expiresAt: expiryFor(kind, now),
      dedupeKey: input.dedupeKey,
    },
  });
}

/**
 * Release, against a name.
 *
 * `releasedBy` is required and not defaulted. The catalogue says "recorded
 * against your name", and a nullable actor would let an anonymous release
 * through the first time a caller forgot to pass one.
 */
export async function release(
  id: string,
  by: { name: string; userId?: string },
  now = new Date(),
) {
  if (!by.name?.trim()) throw new Error("A release has to be recorded against a name.");

  const action = await prisma.pendingAction.findUnique({ where: { id } });
  if (!action) throw new Error("No such action");
  if (!canRelease(action as GateAction, now)) {
    throw new Error(`Cannot release an action that is ${action.state.toLowerCase()}`);
  }

  return prisma.pendingAction.update({
    where: { id },
    data: {
      state: "RELEASED",
      releasedAt: now,
      releasedBy: by.name.trim(),
      releasedByUserId: by.userId ?? null,
      autoReleased: false,
    },
  });
}

/** Pull something out of the queue. Always allowed while it has not gone. */
export async function withdraw(
  id: string,
  by: { name: string; reason?: string },
  now = new Date(),
) {
  const action = await prisma.pendingAction.findUnique({ where: { id } });
  if (!action) throw new Error("No such action");
  if (!canWithdraw(action as GateAction)) {
    throw new Error(`Cannot pull an action that is ${action.state.toLowerCase()}`);
  }

  return prisma.pendingAction.update({
    where: { id },
    data: {
      state: "WITHDRAWN",
      withdrawnAt: now,
      withdrawnBy: by.name,
      withdrawnReason: by.reason ?? null,
    },
  });
}

export interface SweepResult {
  autoReleased: number;
  executed: number;
  expired: number;
  failed: number;
}

/**
 * The unattended pass: close review windows, run what is released, lapse what
 * nobody got to. Driven by the cron, and safe to fire repeatedly — every
 * transition is guarded by the state it moves from.
 */
export async function sweep(now = new Date()): Promise<SweepResult> {
  const out: SweepResult = { autoReleased: 0, executed: 0, expired: 0, failed: 0 };

  const open = await prisma.pendingAction.findMany({
    where: { state: { in: ["HELD", "RELEASED"] } },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  for (const action of open) {
    const verdict = decide(action as GateAction, now);

    if (verdict.do === "expire") {
      await prisma.pendingAction.update({
        where: { id: action.id },
        data: { state: "EXPIRED", error: verdict.why },
      });
      out.expired++;
      continue;
    }

    if (verdict.do === "release") {
      await prisma.pendingAction.update({
        where: { id: action.id },
        data: {
          state: "RELEASED",
          releasedAt: now,
          releasedBy: "review window closed",
          autoReleased: true,
        },
      });
      out.autoReleased++;
      // Fall through and run it on the same pass; holding it for another tick
      // would make the review window longer than it says it is.
      action.state = "RELEASED";
    }

    if (decide(action as GateAction, now).do !== "execute") continue;

    const run = EXECUTORS.get(action.kind);
    if (!run) {
      await prisma.pendingAction.update({
        where: { id: action.id },
        data: {
          state: "FAILED",
          error: `No executor is wired for "${action.kind}". Nothing was sent.`,
        },
      });
      out.failed++;
      continue;
    }

    try {
      const result = await run(action.payload);
      await prisma.pendingAction.update({
        where: { id: action.id },
        data: { state: "EXECUTED", executedAt: now, result: result as never, error: null },
      });
      out.executed++;
    } catch (e) {
      await prisma.pendingAction.update({
        where: { id: action.id },
        data: { state: "FAILED", error: e instanceof Error ? e.message : String(e) },
      });
      out.failed++;
    }
  }

  return out;
}
