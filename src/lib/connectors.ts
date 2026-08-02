/**
 * THE CONNECTOR REGISTRY — what an employee can see, and what it can touch.
 *
 * DIRECTION
 *   Everything in this repo up to now gives a model *words*. It reads a prompt,
 *   a brand voice, a digest of what the client's closed deals taught it, and it
 *   writes an answer back into a chat window. That is a good assistant and it is
 *   not an employee, for one reason: a person you hire does not hand you a
 *   paragraph about the invoice. They raise the invoice.
 *
 *   The distance between those two things is this file. An employee needs eyes
 *   (read the records) and hands (change something outside itself), and both
 *   have to be enumerable, because "what can this thing actually do" is the
 *   first question anybody sensible asks before letting software near their
 *   customers. A registry answers it in one screen. A pile of ad-hoc API calls
 *   scattered through prompt strings never answers it at all.
 *
 * THE LOAD-BEARING RULE
 *   Every WRITE names a gate action kind, and the file refuses to load if one
 *   does not.
 *
 *   This is the whole safety argument, and it is structural rather than
 *   remembered. There is no code path in this system by which an employee
 *   changes something in the world directly — a write operation is not a call,
 *   it is a *proposal*, and `gate.ts` decides what happens to it. The registry
 *   cannot express the other thing. An engineer adding a Twilio connector in a
 *   hurry cannot accidentally give it a send button, because a write with no
 *   gate kind throws at import and takes the build down with it.
 *
 *   That is deliberately more annoying than a runtime check. A runtime check
 *   fails on the day it matters, in production, to a customer.
 *
 * WHY THE READ TIER IS IN-PROCESS AND NOT AN MCP SERVER
 *   The obvious build is an MCP server per data source, which is what the
 *   protocol is for and what it is good at. It is the wrong shape *here*, for a
 *   reason specific to this product rather than to MCP: every row in this
 *   database belongs to a tenant, and the tenancy is enforced by `clientId`
 *   appearing in the query — see `retrieval.ts`, which says so at length and
 *   filters twice.
 *
 *   A separate server process has to be *told* which tenant is asking. That
 *   turns the boundary between two clients' data into a string passed across a
 *   process edge by whichever caller happens to be running — which is precisely
 *   the class of mistake that produces the worst possible bug in this product:
 *   another business's leads, rendered plausibly, with nothing erroring.
 *
 *   So the read tier lives in-process, takes `clientId` as a non-optional first
 *   argument, and every implementation goes through Prisma with the same tenant
 *   filter as the rest of the codebase. When an external MCP server is worth
 *   adding — a client's own Snowflake, say — it arrives as a `PROTOCOL`
 *   connector here with its credentials scoped to that one tenant, and nothing
 *   about the tenancy model changes.
 *
 * BLUEPRINTS
 *   This file is pure. It declares, it validates itself at import, and it
 *   converts an operation into the tool definition Claude is given. It performs
 *   nothing — `desk.ts` holds the implementations, so the registry can be read
 *   and tested without a database, an API key, or a network.
 */

import { kindByKey, type ActionKind } from "@/lib/gate";

/**
 * PROTOCOL — the records themselves: this database today, a client's own
 *            warehouse or MCP server later. Reads only, always tenant-scoped.
 * BUSINESS — the systems the work actually happens in: quoting, scheduling,
 *            messaging, the ledger. Where every write lives.
 * BROWSER  — the last resort. A system with no API that a person operates by
 *            clicking, driven by a headless browser.
 */
export type ConnectorTier = "PROTOCOL" | "BUSINESS" | "BROWSER";

export type Direction = "READ" | "WRITE";

/**
 * LIVE    — implemented, dispatchable today.
 * PLANNED — declared so the architecture is legible and the gap is countable,
 *           and refused at dispatch. Never silently treated as working.
 */
export type OperationStatus = "LIVE" | "PLANNED";

export interface OperationParam {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
  required?: boolean;
}

export interface Operation {
  /** Globally unique, and always `<connector>.<op>`. Checked at import. */
  key: string;
  name: string;
  direction: Direction;
  /** What it does, in the words the employee reads. Written for the model. */
  description: string;
  params: OperationParam[];
  /**
   * WRITE only, and required for it: the `ACTION_KINDS` key this write becomes
   * when it is proposed. This is the field that makes the file safe.
   */
  gateKind?: string;
  status: OperationStatus;
}

export interface Connector {
  key: string;
  tier: ConnectorTier;
  name: string;
  /** The system on the other side, named plainly. */
  system: string;
  /** Why an employee needs it — one line, for the console. */
  purpose: string;
  /**
   * Credential *field names* this needs per tenant. Never values, and never
   * read from here: values live in `ConnectorAccount` rows, one per client.
   * An empty list means the connector needs nothing beyond the tenant itself,
   * which is true only of the platform's own records.
   */
  credentials: string[];
  operations: Operation[];
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

/**
 * Tier PROTOCOL — the client's own records.
 *
 * These five are LIVE because they are backed by tables this repo already owns
 * and already tests. Nothing here is aspirational, which matters: an employee
 * that cannot see anything is a language model guessing about a business it has
 * never been shown, and the failure mode of a guessing employee is confident
 * nonsense proposed at a gate a tired human waves through.
 */
const DESK: Connector = {
  key: "desk",
  tier: "PROTOCOL",
  name: "The client's own records",
  system: "PHX Growth Plus (Postgres, tenant-scoped)",
  purpose: "Everything the platform already holds about this business, read-only.",
  credentials: [],
  operations: [
    {
      key: "desk.leads_recent",
      name: "Recent leads",
      direction: "READ",
      status: "LIVE",
      description:
        "The most recent leads for this business, with their qualification score, tier, status and the next action the qualifier suggested. Use this to find work that has been won, stalled, or never followed up.",
      params: [
        {
          name: "status",
          type: "string",
          description:
            "Optional filter: NEW, SCORED, WORKING, WON or LOST. Omit for all statuses.",
        },
        { name: "limit", type: "number", description: "How many to return, 1-50. Defaults to 20." },
      ],
    },
    {
      key: "desk.recall_search",
      name: "Search everything this business owns",
      direction: "READ",
      status: "LIVE",
      description:
        "Hybrid semantic + keyword search across this client's leads, conversations, documents and learned facts. Use it to answer 'have we seen this before?' — a similar job, the same objection, this customer's history.",
      params: [
        {
          name: "query",
          type: "string",
          description: "What you are looking for, in plain language.",
          required: true,
        },
        { name: "limit", type: "number", description: "How many passages to return, 1-12. Defaults to 6." },
      ],
    },
    {
      key: "desk.memory_facts",
      name: "What this business has taught the desk",
      direction: "READ",
      status: "LIVE",
      description:
        "Facts derived from this client's own closed deals — which score bands actually close, what they lose to, what a customer is worth. Every fact carries the evidence count behind it. Prefer these over generic best practice.",
      params: [],
    },
    {
      key: "desk.queue_open",
      name: "What is already waiting at the gate",
      direction: "READ",
      status: "LIVE",
      description:
        "Actions already proposed and not yet finished, for this client. ALWAYS read this before proposing anything: proposing a second invoice for a job that already has one waiting is the single most damaging mistake you can make.",
      params: [],
    },
    {
      key: "desk.outcomes_recent",
      name: "Closed deals",
      direction: "READ",
      status: "LIVE",
      description:
        "Recently closed deals, won and lost, with value and the objection recorded against the loss. Use it to judge how hard a piece of work is worth chasing.",
      params: [
        { name: "limit", type: "number", description: "How many to return, 1-50. Defaults to 20." },
      ],
    },
  ],
};

/**
 * Tier BUSINESS — the four systems the operating business actually runs on.
 *
 * Every write in this system is one of these seven operations, because there
 * are exactly seven gated action kinds and each one appears here once. That
 * correspondence is not tidiness. It means the question "what can an employee
 * do to my business?" has an answer with a known length, and the answer is the
 * same list the client already read on the price list before they bought.
 *
 * All seven are LIVE, and LIVE here means precisely one thing: the employee can
 * *propose* it and the client will see it in the queue. Whether a released
 * proposal then reaches the outside world depends on the delivery endpoint in
 * `delivery.ts`, which reports its own absence rather than pretending. The two
 * are separate on purpose — an employee whose proposals silently vanish because
 * an integration is missing is worse than one that cannot propose at all.
 */
const QUOTES: Connector = {
  key: "quotes",
  tier: "BUSINESS",
  name: "Quoting & e-signature",
  system: "The client's quoting tool, reached through their automation endpoint",
  purpose: "Gets a price in front of somebody who said yes.",
  credentials: ["endpoint_url", "signing_secret"],
  operations: [
    {
      key: "quotes.send",
      name: "Send a quote",
      direction: "WRITE",
      status: "LIVE",
      gateKind: "quote.send",
      description:
        "Propose sending a priced quote. This does NOT send anything: a quote commits the business to a number, so it waits at the gate until a named human releases it. Price from the client's own rate card and say where each figure came from.",
      params: [
        { name: "customer", type: "string", description: "Who the quote is for.", required: true },
        {
          name: "summary",
          type: "string",
          description: "One line the owner can read in a queue and understand without opening it.",
          required: true,
        },
        {
          name: "amount_cents",
          type: "number",
          description: "The total quoted, in cents. Required — a quote with no number is not a quote.",
          required: true,
        },
        {
          name: "body",
          type: "string",
          description: "The quote itself, in full, as the customer will read it.",
          required: true,
        },
        {
          name: "basis",
          type: "string",
          description: "Where the price came from: the rate card line, the similar past job, the measured quantity.",
          required: true,
        },
      ],
    },
  ],
};

const SCHEDULER: Connector = {
  key: "scheduler",
  tier: "BUSINESS",
  name: "Scheduling",
  system: "The client's calendar or job-management tool",
  purpose: "Puts won work in a slot and tells the customer who is coming.",
  credentials: ["endpoint_url", "calendar_id"],
  operations: [
    {
      key: "scheduler.book",
      name: "Put a job on the schedule",
      direction: "WRITE",
      status: "LIVE",
      gateKind: "job.schedule",
      description:
        "Propose putting a job on the schedule and assigning it. Held on a short review window so the owner can move it before anybody is told. Never book outside the working hours or service area in the client's own records.",
      params: [
        { name: "customer", type: "string", description: "Who the job is for.", required: true },
        { name: "summary", type: "string", description: "One line: what work, for whom, when.", required: true },
        {
          name: "starts_at",
          type: "string",
          description: "ISO 8601 start time, with a timezone offset. Never a bare date.",
          required: true,
        },
        { name: "duration_minutes", type: "number", description: "How long to hold.", required: true },
        { name: "assignee", type: "string", description: "Who is going, if the records say." },
      ],
    },
  ],
};

const MESSAGING: Connector = {
  key: "messaging",
  tier: "BUSINESS",
  name: "Customer messaging",
  system: "SMS and email, reached through the client's automation endpoint",
  purpose: "Everything the customer actually hears from the business.",
  credentials: ["endpoint_url", "from_number", "from_email"],
  operations: [
    {
      key: "messaging.job_status",
      name: "Send a status message",
      direction: "WRITE",
      status: "LIVE",
      gateKind: "job.status",
      description:
        "Propose telling a customer where their job stands — running late, on the way, finished. Short review window, because a 'running late' message held for an hour is a lie. Keep it under 320 characters and in the client's voice.",
      params: [
        { name: "customer", type: "string", description: "Who is being told.", required: true },
        { name: "channel", type: "string", description: "sms or email.", required: true },
        { name: "summary", type: "string", description: "One line for the queue.", required: true },
        { name: "body", type: "string", description: "The message exactly as it will be received.", required: true },
      ],
    },
    {
      key: "messaging.comeback_reminder",
      name: "Remind a past customer something is due",
      direction: "WRITE",
      status: "LIVE",
      gateKind: "comeback.reminder",
      description:
        "Propose reminding a past customer that work is due again — a service interval, a warranty check, a season. Only ever propose this when a real date in the records makes it true. Held for a long review window so the whole run can be read before any of it sends.",
      params: [
        { name: "customer", type: "string", description: "Who is being contacted.", required: true },
        { name: "channel", type: "string", description: "sms or email.", required: true },
        {
          name: "due_reason",
          type: "string",
          description:
            "The dated fact that makes this due — 'last serviced 2025-08-14, 12-month interval'. Not a guess.",
          required: true,
        },
        { name: "summary", type: "string", description: "One line for the queue.", required: true },
        { name: "body", type: "string", description: "The message exactly as it will be received.", required: true },
      ],
    },
    {
      key: "messaging.comeback_reactivate",
      name: "Re-approach a dormant customer",
      direction: "WRITE",
      status: "LIVE",
      gateKind: "comeback.reactivate",
      description:
        "Propose re-approaching somebody who has bought before and has gone quiet. No interval makes this due, so it has to earn its place on the strength of the relationship. Never propose it for a customer whose last job went badly.",
      params: [
        { name: "customer", type: "string", description: "Who is being contacted.", required: true },
        { name: "channel", type: "string", description: "sms or email.", required: true },
        { name: "last_seen", type: "string", description: "When they last bought, from the records.", required: true },
        { name: "summary", type: "string", description: "One line for the queue.", required: true },
        { name: "body", type: "string", description: "The message exactly as it will be received.", required: true },
      ],
    },
  ],
};

const LEDGER: Connector = {
  key: "ledger",
  tier: "BUSINESS",
  name: "Invoicing & the ledger",
  system: "The client's accounting package",
  purpose: "Raises what is owed and chases it until it clears.",
  credentials: ["endpoint_url", "ledger_account"],
  operations: [
    {
      key: "ledger.raise_invoice",
      name: "Raise an invoice",
      direction: "WRITE",
      status: "LIVE",
      gateKind: "invoice.raise",
      description:
        "Propose raising an invoice against completed work. Moves money, so it always waits for a named human. Invoice what the records say was done, at the price the records say was agreed — never a figure you inferred.",
      params: [
        { name: "customer", type: "string", description: "Who is being invoiced.", required: true },
        { name: "summary", type: "string", description: "One line for the queue.", required: true },
        { name: "amount_cents", type: "number", description: "The amount, in cents.", required: true },
        {
          name: "basis",
          type: "string",
          description: "The accepted quote, job record or agreed rate this figure comes from.",
          required: true,
        },
        { name: "due_date", type: "string", description: "ISO date the payment is due." },
      ],
    },
    {
      key: "ledger.chase_payment",
      name: "Chase a payment",
      direction: "WRITE",
      status: "LIVE",
      gateKind: "payment.chase",
      description:
        "Propose chasing an unpaid invoice. Always waits for a named human, because chasing somebody who has already paid loses the account faster than anything else you can do. Check the records for payment before proposing, and say what you checked.",
      params: [
        { name: "customer", type: "string", description: "Who is being chased.", required: true },
        { name: "summary", type: "string", description: "One line for the queue.", required: true },
        { name: "amount_cents", type: "number", description: "What is outstanding, in cents.", required: true },
        { name: "days_overdue", type: "number", description: "How long it has been outstanding.", required: true },
        {
          name: "body",
          type: "string",
          description: "The chase message. Firm, never threatening, and it assumes an oversight rather than a refusal.",
          required: true,
        },
      ],
    },
  ],
};

/**
 * Tier BUSINESS, planned — the CRM.
 *
 * Read-only, and that is not a phasing decision. A CRM write has no gate kind
 * and will not be given one: the gate's registry exists to enumerate things
 * that reach a *customer* or move money, and quietly rewriting a client's own
 * pipeline is a different kind of risk that wants a different mechanism
 * (reversibility, not review). Until that mechanism exists, an employee reads
 * the CRM and proposes customer-facing actions; the CRM row is updated by the
 * client's automation endpoint when the action executes, where they can see it.
 */
const CRM: Connector = {
  key: "crm",
  tier: "BUSINESS",
  name: "CRM history",
  system: "HubSpot, Salesforce, or whatever the client actually uses",
  purpose: "The last three conversations, so an employee is not the only one starting fresh.",
  credentials: ["provider", "access_token", "portal_id"],
  operations: [
    {
      key: "crm.contact_history",
      name: "Read a contact's history",
      direction: "READ",
      status: "PLANNED",
      description:
        "Recent interactions with one contact, from the client's CRM: deals, notes, the last few emails.",
      params: [
        { name: "contact", type: "string", description: "Email, phone or full name.", required: true },
      ],
    },
  ],
};

/**
 * Tier BROWSER — the ugly, necessary one.
 *
 * Plenty of the systems this work lives in have no API worth the name: a local
 * job-management package, a supplier portal, a council booking site. Computer
 * use is how an employee reaches them at all.
 *
 * Reads only, and deliberately so. A browser write cannot be dry-run, cannot be
 * reliably undone, and cannot be described precisely enough in a queue for a
 * human to review it — "clicks the button that looks like Submit" is not a
 * proposal anybody can sensibly approve. Every write worth making through a
 * portal is already available as a gated operation above, where it is legible.
 */
const BROWSER: Connector = {
  key: "browser",
  tier: "BROWSER",
  name: "Legacy portal reader",
  system: "Headless Chromium",
  purpose: "Reads the systems that never got an API.",
  credentials: ["portal_url", "username", "password"],
  operations: [
    {
      key: "browser.read_portal",
      name: "Read a page in a legacy portal",
      direction: "READ",
      status: "PLANNED",
      description:
        "Log into a system with no API and read one page — a job list, an invoice status, a booking calendar — returning it as text.",
      params: [
        { name: "target", type: "string", description: "Which saved portal page to read.", required: true },
      ],
    },
  ],
};

export const CONNECTORS: Connector[] = [DESK, QUOTES, SCHEDULER, MESSAGING, LEDGER, CRM, BROWSER];

// ---------------------------------------------------------------------------
// Invariants. These run at import, and they are the reason the rest of the
// system can make a flat claim about what an employee is able to do.
// ---------------------------------------------------------------------------

const seenConnector = new Set<string>();
const seenOperation = new Set<string>();

for (const c of CONNECTORS) {
  if (seenConnector.has(c.key)) throw new Error(`Duplicate connector key "${c.key}"`);
  seenConnector.add(c.key);

  for (const op of c.operations) {
    if (seenOperation.has(op.key)) throw new Error(`Duplicate operation key "${op.key}"`);
    seenOperation.add(op.key);

    // Namespacing is not cosmetic: the tool name the model sees is derived from
    // this key, and a bare `send` on two connectors is a tool call nobody can
    // attribute after the fact.
    if (!op.key.startsWith(`${c.key}.`)) {
      throw new Error(`Operation "${op.key}" must be namespaced under connector "${c.key}"`);
    }

    if (op.direction === "WRITE") {
      if (!op.gateKind) {
        throw new Error(
          `Operation "${op.key}" writes to the world with no gate. Every write is a proposal — give it a gate kind or make it a read.`,
        );
      }
      if (!kindByKey(op.gateKind)) {
        throw new Error(
          `Operation "${op.key}" names gate kind "${op.gateKind}", which is not in ACTION_KINDS.`,
        );
      }
    } else if (op.gateKind) {
      // A read with a gate kind is a write somebody mislabelled, and it would
      // sail straight past the rule above.
      throw new Error(`Operation "${op.key}" is a READ but names a gate kind.`);
    }

    const names = op.params.map((p) => p.name);
    if (new Set(names).size !== names.length) {
      throw new Error(`Operation "${op.key}" has duplicate parameter names.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function connectorByKey(key: string): Connector | undefined {
  return CONNECTORS.find((c) => c.key === key);
}

export const OPERATIONS: Operation[] = CONNECTORS.flatMap((c) => c.operations);

export function operationByKey(key: string): Operation | undefined {
  return OPERATIONS.find((o) => o.key === key);
}

export function connectorForOperation(key: string): Connector | undefined {
  return CONNECTORS.find((c) => c.operations.some((o) => o.key === key));
}

/** The action kind a write becomes. Undefined for reads and unknown keys. */
export function gateKindForOperation(key: string): ActionKind | undefined {
  const op = operationByKey(key);
  return op?.gateKind ? kindByKey(op.gateKind) : undefined;
}

/** A connector is live when anything on it is. Used by the console's stack view. */
export function connectorStatus(c: Connector): OperationStatus {
  return c.operations.some((o) => o.status === "LIVE") ? "LIVE" : "PLANNED";
}

// ---------------------------------------------------------------------------
// Tool definitions — the registry as Claude sees it
// ---------------------------------------------------------------------------

/**
 * Anthropic tool names allow `[a-zA-Z0-9_-]`, and the dots this file uses for
 * namespacing are not in that set. Both directions are needed and both are
 * pure, so a tool call coming back can always be resolved to exactly one
 * operation — a lookup that guesses would be a lookup that eventually
 * dispatches the wrong write.
 */
export function toolName(operationKey: string): string {
  return operationKey.replace(/\./g, "__");
}

export function operationForToolName(name: string): Operation | undefined {
  return operationByKey(name.replace(/__/g, "."));
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

/**
 * One operation, rendered as a tool.
 *
 * The description a write gets is not the one written above it — the gate's
 * terms are appended, verbatim, from the action kind. A model told "send the
 * invoice" and then quietly gated behaves worse than one told the truth: it
 * writes as though the message is going out this second, hedges nothing, and
 * leaves the human at the gate reviewing copy that assumes it has already been
 * approved. Telling it what actually happens costs a sentence and changes what
 * it proposes.
 */
export function toolDefinition(op: Operation): ToolDefinition {
  const kind = op.gateKind ? kindByKey(op.gateKind) : undefined;

  const gateNote = kind
    ? kind.minimumHold === "MANUAL"
      ? ` PROPOSAL ONLY. Nothing is sent by this call. It is queued as "${kind.label}" and waits until a named human at this business releases it, or it lapses after ${kind.expiresAfterHours} hours. Write it so a busy owner can approve it in one read.`
      : ` PROPOSAL ONLY. Nothing is sent by this call. It is queued as "${kind.label}", visible to the business for ${kind.reviewWindowMinutes} minutes, and sends when that window closes unless somebody pulls it.`
    : "";

  return {
    name: toolName(op.key),
    description: op.description + gateNote,
    input_schema: {
      type: "object",
      properties: Object.fromEntries(
        op.params.map((p) => [p.name, { type: p.type, description: p.description }]),
      ),
      required: op.params.filter((p) => p.required).map((p) => p.name),
    },
  };
}

/**
 * The tools for one duty, in the order given.
 *
 * Unknown keys throw rather than being skipped. A duty that quietly loses its
 * only write tool still runs, still reads everything, still produces a
 * confident answer, and proposes nothing — a silent no-op that looks from the
 * outside exactly like a quiet week.
 */
export function toolsFor(operationKeys: string[]): ToolDefinition[] {
  return operationKeys.map((key) => {
    const op = operationByKey(key);
    if (!op) throw new Error(`Unknown operation "${key}"`);
    return toolDefinition(op);
  });
}

/**
 * Required-parameter check, before anything is proposed.
 *
 * Cheap, and it earns its place at the boundary: a tool call missing its
 * `amount_cents` should come back to the model as a correctable error on the
 * same turn, not reach the queue as an invoice for nothing that a human has to
 * work out how to reject.
 */
export function missingParams(op: Operation, input: Record<string, unknown>): string[] {
  return op.params
    .filter((p) => p.required)
    .filter((p) => {
      const v = input[p.name];
      return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
    })
    .map((p) => p.name);
}
