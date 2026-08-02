/**
 * THE ROSTER — the employees, what they are hired for, and what they may do.
 *
 * DIRECTION
 *   `agents.ts` holds five specialists, and they are genuinely useful, and
 *   every one of them is a chat window. You open it, you paste something in,
 *   you read the answer, you do the work. The client is still the one doing the
 *   job; the model is doing the typing.
 *
 *   An employee is the other arrangement. It has a role rather than a prompt, a
 *   shift rather than a session, tools rather than advice, a ceiling on what it
 *   may commit the business to, and a record afterwards of everything it did.
 *   Nobody opens it. It works, and what it produces is waiting.
 *
 *   That is the whole difference, and it is four concrete things:
 *
 *     CONTEXT        — it reads the business's own records before it acts
 *                      (`connectors.ts`, tier PROTOCOL, and `context.ts`).
 *     HANDS          — it can propose real actions (`connectors.ts`, WRITE).
 *     AUTHORITY      — a written, enforced limit on which of those it may
 *                      propose and how much it may commit (this file).
 *     ACCOUNTABILITY — every run, tool call and escalation is a row somebody
 *                      can read (`desk.ts`, and the console page).
 *
 * WHY THESE TWO AND NOT A NEW PRODUCT
 *   The catalogue already sells two automation builds — The Job Runner and The
 *   Comeback — and both were sold with a published promise about a gate, which
 *   is why `gate.ts` was built first and deliberately before either loop. What
 *   neither had was anything that *does the work*: seven gated action kinds and
 *   nothing on the other end proposing them.
 *
 *   So the roster is not a new offering. It is the crew that staffs the two
 *   builds a client can already buy, and `employees.test.ts` holds it to that:
 *   every employee names a build the catalogue actually sells, and between them
 *   they cover every action kind, so no gated action exists that nobody is
 *   responsible for.
 *
 * BLUEPRINTS
 *   Pure. Definitions, invariants checked at import, and the two decisions that
 *   matter — `authorityVerdict` (may this be proposed at all?) and `isOnShift`
 *   (is this duty due?) — as tested functions with no database and no model.
 *   `desk.ts` runs them; it does not re-decide them.
 */

import { z } from "zod";
import { ACTION_KINDS, kindByKey, type BuildKey } from "@/lib/gate";
import { operationByKey, gateKindForOperation } from "@/lib/connectors";

// ---------------------------------------------------------------------------
// What a duty reports back
// ---------------------------------------------------------------------------

/**
 * Every duty returns the same report, and it is deliberately small.
 *
 * The *work* leaves through tool calls, which are gated, recorded and
 * inspectable. The report is only what a human needs to read a run at a glance:
 * how much was looked at, what was proposed, how sure the employee was, and
 * whether it wants a person.
 *
 * One shape across every duty means one validator, one repair path, and one
 * thing the console has to know how to render — and it means a new duty cannot
 * invent a private output format that nothing downstream understands.
 */
export const DutyReport = z.object({
  /** How many records were actually examined. Grounds the summary in something. */
  reviewed: z.number().int().min(0),
  /** One line for the owner. No preamble, no flattery. */
  summary: z.string().min(1).max(400),
  /**
   * The employee's own confidence, 0-1. Read by `resilience.ts` against the
   * duty's floor, so a hedging employee routes to a human instead of the gate.
   */
  confidence: z.number().min(0).max(1),
  /**
   * Set when the employee wants a person. Null when it does not.
   *
   * Nullable *and* optional, with no default: a model that writes `"escalate":
   * null` and one that omits the key entirely mean the same thing, and failing
   * a whole run over which of the two it chose would be a validator enforcing a
   * preference rather than a contract.
   */
  escalate: z
    .object({
      why: z.string().min(1).max(600),
      question: z.string().min(1).max(400),
    })
    .nullable()
    .optional(),
});

export type DutyReport = z.infer<typeof DutyReport>;

/**
 * The literal example the model is shown.
 *
 * A JSON Schema dump is the obvious thing to put in a prompt and it is
 * measurably worse than one filled-in example — schemas describe the space of
 * valid documents, and what the model needs is the shape of one.
 */
export const DUTY_REPORT_EXAMPLE = `{
  "reviewed": 14,
  "summary": "Three jobs finished last week with no invoice raised. Proposed all three.",
  "confidence": 0.86,
  "escalate": null
}`;

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------

export interface Shift {
  /** How often this duty comes round. */
  everyHours: number;
  /**
   * Optional earliest UTC hour. A chase that goes out at 4am local reads as
   * automated in the way that costs a business its account.
   */
  notBeforeHourUtc?: number;
  /** Plain English, for the console. Kept beside the numbers so it cannot lie. */
  label: string;
}

/**
 * Is this duty due?
 *
 * Both halves matter and they fail differently. Without the interval a cron
 * firing hourly runs a daily duty twenty-four times; without the hour a duty
 * meant for the working day fires at whatever time the previous run happened to
 * finish and drifts earlier every day.
 */
export function isOnShift(shift: Shift, now: Date, lastRunAt?: Date | null): boolean {
  if (shift.notBeforeHourUtc != null && now.getUTCHours() < shift.notBeforeHourUtc) return false;
  if (!lastRunAt) return true;
  const hours = (now.getTime() - lastRunAt.getTime()) / 3_600_000;
  // A hair under, so a duty scheduled every 24h is not skipped by a cron that
  // fires a few seconds early and pushes the whole thing a day out.
  return hours >= shift.everyHours - 0.05;
}

// ---------------------------------------------------------------------------
// Authority
// ---------------------------------------------------------------------------

export interface Authority {
  /**
   * Gate action kinds this employee may propose. Declared, not derived from the
   * duty tools — the two are cross-checked at import instead. Deriving it would
   * mean adding a tool to a duty silently widens what the employee may commit
   * the business to, which is exactly the change that should be loud.
   */
  mayPropose: string[];
  /**
   * The most this employee may put in front of a customer without a person
   * deciding first, in cents.
   *
   * Note what this is *not*. The gate already holds every money action for a
   * named human, so this is not the approval step — it is the step before it.
   * Above this figure the employee does not get to propose at all: the thing
   * that reaches a human is a question, not a pre-written quote with a number
   * in it that they now have to argue with. The difference matters because
   * approving is easy and disagreeing with something already drafted is not.
   */
  moneyCeilingCents: number;
  /** Written for the client to read, in the console, in their own language. */
  neverWithoutAPerson: string[];
}

export type AuthorityDecision = "propose" | "escalate" | "refuse";

export interface AuthorityVerdict {
  do: AuthorityDecision;
  why: string;
}

/**
 * May this employee propose this, at this amount?
 *
 * Fails closed on every unknown: an unregistered kind, a kind outside the
 * employee's list, a money action with no amount. That last one is worth being
 * blunt about — a money proposal that arrives with `amount_cents` missing is
 * not a small proposal, it is a proposal whose size is unknown, and treating
 * unknown as zero is how a ceiling stops meaning anything.
 */
export function authorityVerdict(
  authority: Authority,
  gateKindKey: string,
  amountCents?: number | null,
): AuthorityVerdict {
  const kind = kindByKey(gateKindKey);
  if (!kind) {
    return { do: "refuse", why: `"${gateKindKey}" is not a registered action kind.` };
  }
  if (!authority.mayPropose.includes(gateKindKey)) {
    return { do: "refuse", why: `This employee has no authority to propose "${kind.label}".` };
  }

  if (kind.movesMoney) {
    if (amountCents == null || !Number.isFinite(amountCents)) {
      return {
        do: "escalate",
        why: `"${kind.label}" moves money and arrived without an amount. A person has to see this.`,
      };
    }
    if (amountCents < 0) {
      return { do: "refuse", why: "A negative amount is a bug, not a proposal." };
    }
    if (amountCents > authority.moneyCeilingCents) {
      return {
        do: "escalate",
        why: `Above this employee's ceiling — it may commit up to ${formatCeiling(
          authority.moneyCeilingCents,
        )} without asking, and this is more.`,
      };
    }
  }

  return { do: "propose", why: `Within authority for "${kind.label}".` };
}

function formatCeiling(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

// ---------------------------------------------------------------------------
// Duties
// ---------------------------------------------------------------------------

/**
 * SHIFT  — comes round on the clock, unprompted. Most of the work.
 * SIGNAL — something in the records changed and this duty is the response.
 * ASKED  — a person pressed the button. Same code path, different trigger.
 */
export type DutyTrigger = "SHIFT" | "SIGNAL" | "ASKED";

export interface Duty {
  key: string;
  name: string;
  /** What this duty is for, in the owner's language. One line. */
  outcome: string;
  trigger: DutyTrigger;
  shift: Shift;
  /**
   * The operation keys this duty may use — and nothing else is even shown to
   * the model. See `context.ts`: a duty holding every tool in the registry is
   * a duty whose attention is spent reading a menu.
   */
  tools: string[];
  /** The job brief. Written as instructions to somebody doing a job. */
  brief: string;
  /**
   * Below this confidence the run goes to a human instead of the gate. Set per
   * duty because the cost of being wrong is not the same in each: a status
   * message sent in error is an apology, an invoice sent in error is a phone
   * call from somebody's accountant.
   */
  confidenceFloor: number;
  /** Token ceiling for everything assembled beneath the brief. */
  contextBudget: number;
}

export interface AiEmployee {
  slug: string;
  name: string;
  /** Which sold build this employee staffs. Checked against the catalogue. */
  build: BuildKey;
  /** The one-line job, in the owner's language — an outcome, not a feature. */
  hiredFor: string;
  /**
   * What this employee is judged on. Deliberately a number a client could
   * check, because "improves efficiency" is how software avoids being measured.
   */
  accountableFor: string;
  authority: Authority;
  duties: Duty[];
}

// ---------------------------------------------------------------------------
// The Foreman — staffs The Job Runner
// ---------------------------------------------------------------------------

const HOUSE_RULES = [
  "You are not writing advice for somebody else to act on. You are doing the job.",
  "Read the queue before you propose anything. If an action for this customer and this purpose is already waiting, do not propose it again — that is the single most damaging mistake available to you.",
  "Never invent a date, a price, a measurement or a name. Every figure you use must come from a record you actually read, and you must say which one.",
  "If the records do not support an action, propose nothing and say so. A quiet run is a correct outcome. Filling the queue to look busy is not.",
  "When you are unsure, escalate. A question answered in ten seconds by the owner costs less than a wrong action they have to unwind with a customer.",
].join("\n");

const FOREMAN: AiEmployee = {
  slug: "foreman",
  name: "The Foreman",
  build: "job-runner",
  hiredFor: "Takes a yes and runs it all the way to paid, without anybody remembering to.",
  accountableFor:
    "Won work that reaches an invoice: quoted the same day, scheduled, the customer told, invoiced on completion, chased until it clears.",
  authority: {
    mayPropose: ["quote.send", "job.schedule", "job.status", "invoice.raise", "payment.chase"],
    // Two thousand dollars. Big enough to cover the ordinary run of jobs in the
    // trades this is built for, small enough that the unusual one reaches a
    // person as a question rather than as a drafted number.
    moneyCeilingCents: 200_000,
    neverWithoutAPerson: [
      "Any quote, invoice or chase — all three wait for you by name, whatever the amount",
      "Anything over $2,000 comes to you as a question before it is even drafted",
      "A chase where the records do not clearly show the invoice is unpaid",
      "Anything for a customer with an open complaint",
    ],
  },
  duties: [
    {
      key: "quote-out",
      name: "Quote the work that was won",
      outcome: "Nobody who said yes waits a day for a price.",
      trigger: "SHIFT",
      shift: { everyHours: 4, notBeforeHourUtc: 13, label: "Every four hours, from 6am Phoenix" },
      tools: [
        "desk.leads_recent",
        "desk.queue_open",
        "desk.recall_search",
        "desk.memory_facts",
        "quotes.send",
      ],
      brief: [
        "Find work that has been won or agreed and has no quote out yet, and quote it.",
        "",
        "For each candidate: read what the customer actually asked for, search the records for the closest past job you can find, and price from that. State the basis — the past job, the rate card line, the measured quantity. A price with no basis is a guess wearing a number.",
        "",
        "Do not quote where the scope is unclear. An unclear scope is the most expensive thing you can put a price on, and it is exactly the case to escalate.",
      ].join("\n"),
      confidenceFloor: 0.7,
      contextBudget: 12_000,
    },
    {
      key: "run-the-day",
      name: "Schedule it and keep the customer posted",
      outcome: "The work is in a slot, and the customer knows who is coming and when.",
      trigger: "SHIFT",
      shift: { everyHours: 2, notBeforeHourUtc: 13, label: "Every two hours through the day" },
      tools: [
        "desk.leads_recent",
        "desk.queue_open",
        "desk.recall_search",
        "scheduler.book",
        "messaging.job_status",
      ],
      brief: [
        "Two jobs, in this order.",
        "",
        "First: accepted work that is not on the schedule. Put it in a slot that fits the working hours and service area in the records, and assign it if the records say who.",
        "",
        "Second: work already scheduled where the customer has not been told anything. Send the short status message a person would send — who is coming, when, what to expect. Under 320 characters, in the business's voice, no exclamation marks.",
        "",
        "Never tell a customer something you cannot see in a record. 'On the way' is a claim about the physical world.",
      ].join("\n"),
      confidenceFloor: 0.65,
      contextBudget: 10_000,
    },
    {
      key: "get-paid",
      name: "Invoice on completion, then chase",
      outcome: "Finished work is invoiced the same day, and unpaid invoices are chased.",
      trigger: "SHIFT",
      shift: { everyHours: 24, notBeforeHourUtc: 15, label: "Once a day, mid-morning" },
      tools: [
        "desk.leads_recent",
        "desk.outcomes_recent",
        "desk.queue_open",
        "desk.recall_search",
        "ledger.raise_invoice",
        "ledger.chase_payment",
      ],
      brief: [
        "Two jobs, in this order.",
        "",
        "First: completed work with no invoice raised. Invoice what the records say was done at the price the records say was agreed. If the agreed price is not in a record, do not infer it — escalate.",
        "",
        "Second: invoices that are overdue. Before proposing a chase, look for any sign of payment and say what you checked. Chasing somebody who has already paid costs the account. If you are not sure, do not chase.",
        "",
        "A chase assumes an oversight, not a refusal. Firm, short, never threatening, and it makes paying easy.",
      ].join("\n"),
      confidenceFloor: 0.8,
      contextBudget: 12_000,
    },
  ],
};

// ---------------------------------------------------------------------------
// The Diary — staffs The Comeback
// ---------------------------------------------------------------------------

const DIARY: AiEmployee = {
  slug: "diary",
  name: "The Diary",
  build: "comeback",
  hiredFor: "Knows when every past customer is due back, and asks them before somebody else does.",
  accountableFor:
    "Past customers contacted on the date their own record makes due — and nobody contacted twice, out of season, or after a job that went badly.",
  authority: {
    mayPropose: ["comeback.reminder", "comeback.reactivate"],
    // This employee never proposes anything that moves money. The ceiling is
    // zero rather than absent so that if a money kind is ever added to its
    // authority by mistake, the ceiling check catches it on the first run
    // instead of the list quietly growing.
    moneyCeilingCents: 0,
    neverWithoutAPerson: [
      "The whole run is visible for twelve hours before any of it sends",
      "Anyone whose last job had a complaint against it",
      "Any re-approach to a customer who has asked not to be contacted",
      "More than one message to the same person in a run",
    ],
  },
  duties: [
    {
      key: "due-back",
      name: "Remind whoever is due",
      outcome: "The next job falls due on a date in the records, not on somebody's memory.",
      trigger: "SHIFT",
      shift: { everyHours: 24, notBeforeHourUtc: 15, label: "Once a day, mid-morning" },
      tools: [
        "desk.outcomes_recent",
        "desk.recall_search",
        "desk.memory_facts",
        "desk.queue_open",
        "messaging.comeback_reminder",
      ],
      brief: [
        "Find past customers whose next job is genuinely due, and remind them.",
        "",
        "Due means a date in the records makes it due — a service interval elapsed, a warranty window closing, a season arriving. Quote that date in the proposal. If you cannot name the dated fact, the customer is not due and this is not your duty.",
        "",
        "One message per person per run. Warm, short, and it reads like the business remembering them rather than a system noticing them.",
      ].join("\n"),
      confidenceFloor: 0.75,
      contextBudget: 10_000,
    },
    {
      key: "dormant",
      name: "Re-approach the ones who went quiet",
      outcome: "Customers who bought once and drifted get asked back on a schedule.",
      trigger: "SHIFT",
      shift: { everyHours: 168, notBeforeHourUtc: 15, label: "Once a week" },
      tools: [
        "desk.outcomes_recent",
        "desk.recall_search",
        "desk.memory_facts",
        "desk.queue_open",
        "messaging.comeback_reactivate",
      ],
      brief: [
        "Find customers who have bought before, have gone quiet, and are worth asking back.",
        "",
        "Nothing makes these due, so each one has to earn its place: what they bought, how it went, and what has changed since that makes the ask reasonable now. Say all three in the proposal.",
        "",
        "Skip anyone whose last job went badly — search the records before you decide it did not. A re-approach landing on an unresolved complaint is worse than no contact at all.",
        "",
        "Small runs. Ten good re-approaches beat a hundred that read as a mailshot, and the queue is read by a person who will judge the whole run by its worst message.",
      ].join("\n"),
      confidenceFloor: 0.75,
      contextBudget: 10_000,
    },
  ],
};

export const EMPLOYEES: AiEmployee[] = [FOREMAN, DIARY];

// ---------------------------------------------------------------------------
// Invariants
// ---------------------------------------------------------------------------

const seenSlug = new Set<string>();
const seenDuty = new Set<string>();

for (const e of EMPLOYEES) {
  if (seenSlug.has(e.slug)) throw new Error(`Duplicate employee slug "${e.slug}"`);
  seenSlug.add(e.slug);

  for (const k of e.authority.mayPropose) {
    if (!kindByKey(k)) {
      throw new Error(`${e.name} claims authority over unknown action kind "${k}"`);
    }
  }

  for (const d of e.duties) {
    const dutyId = `${e.slug}:${d.key}`;
    if (seenDuty.has(dutyId)) throw new Error(`Duplicate duty "${dutyId}"`);
    seenDuty.add(dutyId);

    if (d.confidenceFloor <= 0 || d.confidenceFloor > 1) {
      throw new Error(`Duty "${dutyId}" has a confidence floor outside (0, 1]`);
    }

    for (const t of d.tools) {
      const op = operationByKey(t);
      if (!op) throw new Error(`Duty "${dutyId}" names unknown operation "${t}"`);

      if (op.direction === "WRITE") {
        const kind = gateKindForOperation(t)!;
        // The cross-check that makes a declared authority worth declaring.
        if (!e.authority.mayPropose.includes(kind.key)) {
          throw new Error(
            `Duty "${dutyId}" can call "${t}", which proposes "${kind.key}" — outside ${e.name}'s authority.`,
          );
        }
        // An employee whose build does not own the action would be proposing
        // work the client bought from a different product.
        if (kind.build !== e.build) {
          throw new Error(
            `Duty "${dutyId}" proposes "${kind.key}", which belongs to build "${kind.build}", but ${e.name} staffs "${e.build}".`,
          );
        }
      }
    }

    // A duty that can read everything and change nothing is a report, and
    // reports are what this whole file exists to stop shipping instead of work.
    const writes = d.tools.filter((t) => operationByKey(t)?.direction === "WRITE");
    if (writes.length === 0) {
      throw new Error(`Duty "${dutyId}" has no write tool. It cannot do anything.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function employeeBySlug(slug: string): AiEmployee | undefined {
  return EMPLOYEES.find((e) => e.slug === slug);
}

export function dutyByKey(slug: string, dutyKey: string): Duty | undefined {
  return employeeBySlug(slug)?.duties.find((d) => d.key === dutyKey);
}

/** Which employee staffs a build. Used when a client's entitlement is checked. */
export function employeesForBuild(build: BuildKey): AiEmployee[] {
  return EMPLOYEES.filter((e) => e.build === build);
}

/** Every (employee, duty) pair, for the shift runner to walk. */
export function allDuties(): { employee: AiEmployee; duty: Duty }[] {
  return EMPLOYEES.flatMap((employee) => employee.duties.map((duty) => ({ employee, duty })));
}

/** Every action kind, with the duty responsible for it. Read by the console. */
export function staffing(): { kind: string; label: string; employee: string; duty: string }[] {
  return ACTION_KINDS.map((k) => {
    const found = allDuties().find(({ duty }) =>
      duty.tools.some((t) => gateKindForOperation(t)?.key === k.key),
    );
    return {
      kind: k.key,
      label: k.label,
      employee: found?.employee.name ?? "—",
      duty: found?.duty.name ?? "unstaffed",
    };
  });
}

// ---------------------------------------------------------------------------
// The brief
// ---------------------------------------------------------------------------

/**
 * The part of the prompt that is the *job*, composed from the role, the
 * authority and the duty.
 *
 * Kept separate from everything the tenant supplies (`context.ts`) for one
 * reason: this block is never evicted. When the context budget runs short it is
 * the client's records that get trimmed, never the description of what this
 * employee is and is not allowed to do — an employee that forgot its ceiling
 * because a long day produced too many leads is the worst failure this system
 * has available to it.
 */
export function dutyBrief(employee: AiEmployee, duty: Duty, business: { name: string; approver?: string | null }): string {
  const kinds = employee.authority.mayPropose
    .map((k) => kindByKey(k))
    .filter(Boolean)
    .map((k) => `- ${k!.label}${k!.movesMoney ? " (moves money — always waits for a named person)" : ""}`);

  return [
    `You are ${employee.name}, working for ${business.name}. You are not an assistant and this is not a conversation — nobody is reading this as you write it.`,
    `Your job: ${employee.hiredFor}`,
    `You are judged on: ${employee.accountableFor}`,
    "",
    `TODAY'S DUTY — ${duty.name}`,
    duty.brief,
    "",
    "HOW YOU WORK",
    HOUSE_RULES,
    "",
    "WHAT YOU MAY PROPOSE",
    ...kinds,
    `Nothing you do reaches a customer directly. Every action above is a proposal that waits at a gate where ${
      business.approver?.trim() || "somebody at this business"
    } can read it, release it, or pull it.`,
    `You may commit up to ${formatCeiling(
      employee.authority.moneyCeilingCents,
    )} without asking. Above that, do not draft it — escalate and ask.`,
    "",
    "WHEN YOU ARE DONE",
    "Reply with ONLY a fenced ```json block in exactly this shape, and nothing before or after it:",
    DUTY_REPORT_EXAMPLE,
    "`confidence` is your own honest read of whether this run should be acted on. Set `escalate` when you want a person — with the reason and the specific question you need answered.",
  ].join("\n");
}
