/**
 * THE CREW — three AI employees, and the ring they close.
 *
 * DIRECTION
 *   This site already sells the work. `upgrades.ts` carries The Voice Employee
 *   ("inbound calls answered 24/7 … qualification, quoting rules and calendar
 *   booking handled on the call") and The Job Runner ("quotes out the same day,
 *   priced off your own rate card"). Both are on a public price list. Neither
 *   has a line of code behind it: nothing in this repository answers a
 *   telephone, prices a job, or puts a customer in a diary.
 *
 *   That is the same defect PROGRESS.md phase 11 opened with — capacity add-ons
 *   that were "sold and had no effect" — and it is the worst kind, because the
 *   invoice goes out either way. This file is the first half of closing it: the
 *   three employees named, their duties written down, and each one pinned to
 *   the upgrade whose promise it is answering for.
 *
 * WHY THREE, AND WHY THESE THREE
 *   A business owner does not lose a customer in one place. They lose them at
 *   three, in order, and each one is a different job:
 *
 *     1. The phone rings and nobody picks up.        → Patch
 *     2. The price takes three days to arrive.       → Gauge
 *     3. Nothing ever gets put in the diary.         → Dispatch
 *
 *   Each of the three hands to the next, and the third hands back to the first
 *   — Dispatch's confirmed appointment is what Patch rings out about the day
 *   before. `crewRing()` walks it, and a test asserts it actually closes. That
 *   ring is the difference between three features and an employee crew: any one
 *   of them alone just moves the leak one step downstream.
 *
 * THE CLAIM THIS FILE IS ALLOWED TO MAKE
 *   That more of the people who already tried to become customers do. Not a
 *   percentage, not a multiple — `upgrades.test.ts` bans both and this file is
 *   held to the same bar. The argument is mechanical and checkable: a call that
 *   would have rung out is answered, a price that would have waited for
 *   somebody's evening goes out on the call, an appointment that would have
 *   needed a callback to confirm is already in the diary. Whether that produces
 *   more revenue is the client's data to show, and `scoreboard.ts` computes it
 *   from their own rows rather than asserting it here.
 *
 * BLUEPRINTS
 *   Pure. No database, no model call, no vendor. Deliberately built before any
 *   of the three loops exist, for the reason `gate.ts` gives at the top of
 *   itself: a rule retrofitted onto a running automation is a rule with a
 *   bypass, because the bypass is how it ran for the weeks before the rule
 *   arrived.
 */

import { ACTION_KINDS, kindByKey, type ActionKind } from "@/lib/gate";
import { upgradeByKey, type Upgrade } from "@/lib/upgrades";

export type EmployeeKey = "switchboard" | "estimator" | "booker";

/**
 * What set an action in motion.
 *
 * THE LOAD-BEARING DISTINCTION IN THIS FILE
 *   The catalogue promises a gate on the automation builds, and `gate.ts`
 *   delivers it. Applied naively to an employee crew that gate would make the
 *   product worse than useless: the entire value of answering a phone is that
 *   it happens on the first ring, and the shortest review window the sweep can
 *   honour is five minutes. A missed-call text-back held for five minutes is
 *   not a supervised missed-call text-back, it is a late one.
 *
 *   So the line is drawn by *who started it*, not by how urgent it feels:
 *
 *     Customer-initiated — they rang us, they filled the form, they replied,
 *     they picked a slot on our own booking page. Answering a person who is
 *     currently trying to give us money is not an outbound action and never
 *     enters the queue. Holding it would be the defect.
 *
 *     Business-initiated — we decided to contact somebody who was not, at that
 *     moment, contacting us. Ringing a dormant lead, sending a price, moving an
 *     appointment. Every one of these goes through the gate, exactly like The
 *     Comeback's re-approaches already do.
 *
 *   Stated as a function rather than a convention because a convention is what
 *   it would be until the first time somebody in a hurry called the outbound
 *   path from the inbound handler.
 */
export type Trigger =
  | "customer-called"
  | "customer-submitted"
  | "customer-replied"
  | "customer-booked"
  | "business-initiated";

const CUSTOMER_TRIGGERS: Trigger[] = [
  "customer-called",
  "customer-submitted",
  "customer-replied",
  "customer-booked",
];

/** True when the customer is the one who made contact. */
export function isCustomerInitiated(trigger: Trigger): boolean {
  return CUSTOMER_TRIGGERS.includes(trigger);
}

/**
 * Whether an action has to wait for a human before it happens.
 *
 * Note what this is not: it is not "is this risky". A quote is risky and a
 * status text is not, and both are decided by their action kind over in
 * `gate.ts`, which is where the money question belongs. This decides only
 * whether the gate is consulted at all.
 */
export function needsRelease(trigger: Trigger): boolean {
  return !isCustomerInitiated(trigger);
}

export interface Employee {
  key: EmployeeKey;
  /** What the client calls it. */
  name: string;
  role: string;
  /** The eyebrow, matching the parent roster's shape. */
  domain: string;
  chip: string;
  /**
   * The exact moment a would-be customer is lost today, in the owner's words.
   * One sentence, describing a thing that happens — not a statistic about how
   * often it happens, which we would be making up.
   */
  leak: string;
  /**
   * How this employee turns that moment into a customer instead. A mechanism,
   * checkable against the duties below, never a promised result.
   */
  winsBy: string;
  /** Concretely what it does. */
  duties: string[];
  /**
   * The upgrade on the public price list whose promise this employee is
   * answering for. A test asserts the key still resolves — rename an upgrade
   * and this breaks loudly rather than leaving an employee delivering
   * something nobody sells.
   */
  delivers: string;
  /**
   * Gate action kinds this employee may propose. Every one is checked against
   * `ACTION_KINDS` at import, so an employee cannot claim an action the gate
   * has never heard of.
   */
  actions: string[];
  /** Who picks up the customer next. The last one points back at the first. */
  handsTo: EmployeeKey;
}

/**
 * Three, and deliberately not four.
 *
 * The temptation is to add a fourth for follow-up, and it is already sold: The
 * Comeback re-approaches past customers, and Closer — the parent's own
 * operator — "runs a persistent follow-up cadence across email, SMS and DM
 * until the deal is booked or dead". An employee here doing that would be the
 * duplication `upgrades.test.ts` exists to prevent, one layer down where no
 * test was watching. The crew stops where Closer starts.
 */
export const EMPLOYEES: Employee[] = [
  {
    key: "switchboard",
    name: "Patch",
    role: "Voice Operator",
    domain: "The phone",
    chip: "First Ring",
    leak: "The phone rings while you are under a sink, on a roof, or asleep, and the person calling dials the next number on the list instead.",
    winsBy:
      "It answers on the first ring, at three in the morning and during your own lunch, and it never puts anybody on hold. A caller who would have reached voicemail reaches a conversation instead, and that conversation ends with a name, a job and a reason they called rather than a beep.",
    duties: [
      "Answers every inbound call in your business's voice, around the clock",
      "Qualifies the caller — what the job is, where it is, how soon they need it",
      "Texts back within seconds when a call is missed anyway, so the lead is not lost to a rung-out phone",
      "Places outbound calls to leads who went quiet, held at the gate until you release them",
      "Writes the transcript, the summary and the next action onto the lead before you wake up",
    ],
    delivers: "voice-employee",
    actions: ["call.outbound"],
    handsTo: "estimator",
  },
  {
    key: "estimator",
    name: "Gauge",
    role: "Estimator",
    domain: "The price",
    chip: "Rate Card",
    leak: "The quote waits for the evening you have the energy to write it, and by the time it lands the customer has already read two others.",
    winsBy:
      "It prices the job off your own rate card while the caller is still on the line, so the number arrives the same day rather than the same week. Every line is arithmetic you can point at and every send waits for you, so speed is bought without handing a stranger the right to name your prices.",
    duties: [
      "Prices the job from your rate card — your labour rates, your materials, your minimums",
      "Itemises every line, so the customer can see what they are paying for and you can see what you quoted",
      "Holds the finished estimate at the gate until you release it, because a price is a commitment",
      "Sends it, then records what happened to it — read, accepted, declined, ignored",
      "Never invents a number it was not given a rate for; it asks you instead",
    ],
    delivers: "job-runner",
    actions: ["quote.send"],
    handsTo: "booker",
  },
  {
    key: "booker",
    name: "Dispatch",
    role: "Booking Dispatcher",
    domain: "The diary",
    chip: "The Slot",
    leak: "The customer says yes, somebody promises to ring back about a time, and the ringing back is what never happens.",
    winsBy:
      "It offers real slots out of your actual working hours while the customer is still engaged, takes the booking there and then, and holds it against double-booking. A yes becomes a date in the diary in the same conversation it was said in, which is the only moment it is reliably still a yes.",
    duties: [
      "Offers only slots that are genuinely free, out of the hours you actually work",
      "Books the appointment on the call, on the website, or off the back of an accepted estimate",
      "Refuses to double-book, including against jobs that were put in the diary by hand",
      "Reminds the customer before the day, so the slot is not quietly lost to a forgotten appointment",
      "Reschedules rather than cancels when something moves, and tells the customer which it was",
    ],
    delivers: "job-runner",
    actions: ["booking.remind", "booking.reschedule"],
    // Closes the ring: tomorrow's diary is what Patch rings out about tonight.
    handsTo: "switchboard",
  },
];

export function employeeByKey(key: string): Employee | undefined {
  return EMPLOYEES.find((e) => e.key === key);
}

/** The upgrade an employee is answering for. Undefined only if one is renamed. */
export function upgradeFor(employee: Employee): Upgrade | undefined {
  return upgradeByKey(employee.delivers);
}

/** The gate kinds an employee may propose, resolved. */
export function actionsFor(employee: Employee): ActionKind[] {
  return employee.actions
    .map((k) => kindByKey(k))
    .filter((k): k is ActionKind => Boolean(k));
}

/**
 * The handoff order, starting anywhere, walked until it repeats.
 *
 * Returns the cycle. A test asserts it contains all three and closes — if
 * somebody points two employees at the same successor the ring degenerates
 * into a chain with an orphan, and the crew silently becomes three features
 * again.
 */
export function crewRing(from: EmployeeKey = "switchboard"): EmployeeKey[] {
  const ring: EmployeeKey[] = [];
  let at = from;
  while (!ring.includes(at)) {
    ring.push(at);
    const next = employeeByKey(at)?.handsTo;
    if (!next) break;
    at = next;
  }
  return ring;
}

/**
 * Which employee owns a given gate action. Used by the queue to say "Patch
 * wants to ring somebody" rather than "an action of kind call.outbound".
 */
export function employeeForAction(kindKey: string): Employee | undefined {
  return EMPLOYEES.find((e) => e.actions.includes(kindKey));
}

/**
 * The crew's pitch, in one place so the hub page, the marketing section and the
 * notification copy cannot say three different things.
 *
 * Read the second sentence carefully before editing it. It claims recovery of
 * demand the business already has, and says so — it does not claim to create
 * demand, which is what the ad account next door is for and would be both a
 * duplication and a promise this crew cannot keep.
 */
export const CREW = {
  eyebrow: "The Crew",
  headline: "Three employees who never miss the moment a customer shows up.",
  body:
    "Every business already turns away work it never sees. The call that rang out, the quote that went out on Thursday for a job somebody needed on Monday, the yes that nobody put in the diary. These three answer, price and book — on the call, at three in the morning, without you.",
  // Stated plainly because the alternative is letting a reader assume it.
  boundary:
    "They work the demand you already have. Creating more of it is the ad account's job, and PHX/GROWTH already flies that.",
} as const;

// ---------------------------------------------------------------------------
// Invariants. Checked at import, so a broken crew fails the build rather than
// the shift.
// ---------------------------------------------------------------------------

for (const e of EMPLOYEES) {
  if (!upgradeByKey(e.delivers)) {
    throw new Error(
      `Employee "${e.key}" delivers unknown upgrade "${e.delivers}". ` +
        `An employee answering for something nobody sells is a feature with an invoice attached.`,
    );
  }
  for (const a of e.actions) {
    if (!ACTION_KINDS.some((k) => k.key === a)) {
      throw new Error(
        `Employee "${e.key}" claims unknown gate action "${a}". ` +
          `Register it in ACTION_KINDS or the gate will refuse it at runtime.`,
      );
    }
  }
}
