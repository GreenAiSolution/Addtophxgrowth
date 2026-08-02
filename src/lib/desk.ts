/**
 * THE DESK — the loop an employee actually works.
 *
 * DIRECTION
 *   Everything else in this feature is a definition: the roster says what an
 *   employee is for, the registry says what it may touch, the gate says what
 *   happens to anything it proposes. This file is the only part that runs, and
 *   it is deliberately the least clever of the five. Every decision it makes
 *   has already been made by a pure function somewhere else — `authorityVerdict`
 *   decides whether a write is allowed, `assemble` decides what the employee
 *   gets to read, `confidenceVerdict` decides whether the run is trustworthy,
 *   `decide` in the gate decides what becomes of a proposal. This file fetches,
 *   calls, dispatches and writes rows.
 *
 *   That split is the reason any of it can be trusted. The interesting logic is
 *   testable without a Postgres, an API key, or a network — and the part that
 *   needs all three contains no judgement worth arguing with.
 *
 * WHY THE ORCHESTRATOR IS HERE AND NOT IN n8n
 *   The obvious build is a workflow tool holding the loop: it is what they are
 *   for, the retries are free, and the diagram is nice to show a client. Three
 *   things made it wrong for this system specifically.
 *
 *   The gate is here. Every proposal an employee makes has to land in the same
 *   table the console reads, under the same tenancy rules, with the same
 *   dedupe constraint — and a loop living in another product reaches that table
 *   through an API that has to re-implement every check this codebase already
 *   makes. The first time those two disagree, the disagreement is an invoice.
 *
 *   The state is here. A run's context, its tool calls, its escalations and its
 *   token cost belong beside the client they were spent on, in rows backed up
 *   with everything else, deleted with the tenant by the same cascade.
 *
 *   And the audit is the product. The catalogue promises loops "inspectable
 *   node by node" — a promise that is much easier to keep when the nodes are
 *   rows in the client's own console rather than an execution log in an account
 *   only the agency can log into.
 *
 *   None of that argues against n8n as *transport*. It is an excellent one, and
 *   `delivery.ts` hands released actions to exactly that kind of endpoint. The
 *   argument is only about where the decisions live.
 *
 * BLUEPRINTS
 *   Impure throughout, and it is the only impure file in the feature. The reads
 *   are in one clearly-marked section, the write path in another, and the run
 *   loop at the bottom.
 */

import { createHash } from "node:crypto";
import type { MessageParam, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { prisma } from "@/lib/prisma";
import { anthropic, ANTHROPIC_MODEL } from "@/lib/anthropic";
import { search } from "@/lib/retrieval";
import { propose } from "@/lib/gate";
import { sendNotification } from "@/lib/notify";
import {
  operationForToolName,
  operationByKey,
  toolsFor,
  missingParams,
  gateKindForOperation,
  type Operation,
} from "@/lib/connectors";
import {
  DutyReport,
  authorityVerdict,
  dutyBrief,
  employeeBySlug,
  isOnShift,
  type AiEmployee,
  type Authority,
  type Duty,
} from "@/lib/employees";
import { gatherDutyContext } from "@/lib/context";
import {
  MAX_ATTEMPTS,
  backoffMs,
  confidenceVerdict,
  escalationBrief,
  nextStep,
  repairPrompt,
  validate,
  type EscalationReason,
} from "@/lib/resilience";

/** How many times the model may call tools before the run is cut off. */
export const MAX_TOOL_TURNS = 8;

/** Ceiling on proposals from a single run — a runaway loop must not fill a queue. */
export const MAX_PROPOSALS_PER_RUN = 12;

// ---------------------------------------------------------------------------
// Reads. Every one takes clientId first and filters on it. No exceptions, and
// no reader may take a tenant identifier from the model's own arguments.
// ---------------------------------------------------------------------------

type Reader = (clientId: string, input: Record<string, unknown>) => Promise<unknown>;

function cap(v: unknown, fallback: number, max: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(1, Math.min(max, Math.round(n))) : fallback;
}

const READERS: Record<string, Reader> = {
  "desk.leads_recent": async (clientId, input) => {
    const status = typeof input.status === "string" ? input.status.toUpperCase() : null;
    const valid = ["NEW", "SCORED", "WORKING", "WON", "LOST"];
    const rows = await prisma.lead.findMany({
      where: {
        clientId,
        ...(status && valid.includes(status) ? { status: status as never } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: cap(input.limit, 20, 50),
      select: {
        id: true,
        name: true,
        company: true,
        email: true,
        phone: true,
        message: true,
        source: true,
        status: true,
        score: true,
        tier: true,
        nextAction: true,
        createdAt: true,
      },
    });
    return { count: rows.length, leads: rows };
  },

  "desk.recall_search": async (clientId, input) => {
    const query = String(input.query ?? "").trim();
    if (!query) return { count: 0, passages: [], note: "No query given." };
    const hits = await search(clientId, query, { limit: cap(input.limit, 6, 12) });
    return {
      count: hits.length,
      passages: hits.map((h) => ({
        from: h.sourceType,
        text: h.content,
        found_by: h.via.join("+"),
      })),
    };
  },

  "desk.memory_facts": async (clientId) => {
    const rows = await prisma.memoryEntry.findMany({
      where: { clientId, muted: false },
      orderBy: { confidence: "desc" },
      take: 20,
      select: { kind: true, content: true, confidence: true, evidenceCount: true },
    });
    return { count: rows.length, facts: rows };
  },

  "desk.queue_open": async (clientId) => {
    const rows = await prisma.pendingAction.findMany({
      where: { clientId, state: { in: ["HELD", "RELEASED"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        kind: true,
        summary: true,
        subject: true,
        state: true,
        movesMoney: true,
        createdAt: true,
      },
    });
    return {
      count: rows.length,
      waiting: rows,
      note: "These are already proposed. Proposing any of them again is a duplicate.",
    };
  },

  "desk.outcomes_recent": async (clientId, input) => {
    const rows = await prisma.dealOutcome.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      take: cap(input.limit, 20, 50),
      select: {
        outcome: true,
        valueCents: true,
        objection: true,
        source: true,
        notes: true,
        createdAt: true,
      },
    });
    return { count: rows.length, deals: rows };
  },
};

/**
 * Which reads actually exist.
 *
 * Exported so a test can hold this file and the registry to each other in both
 * directions: a LIVE read with no implementation is a tool that fails the first
 * time an employee tries it, and an implementation with no registry entry is
 * code nothing can ever call. Neither shows up in a typecheck.
 */
export const IMPLEMENTED_READS: string[] = Object.keys(READERS);

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export type ToolCallStatus = "OK" | "REFUSED" | "ESCALATED" | "FAILED" | "UNAVAILABLE";

interface ToolOutcome {
  status: ToolCallStatus;
  /** What goes back to the model. Always a plain object, always readable. */
  result: Record<string, unknown>;
  pendingActionId?: string;
  escalation?: { reason: EscalationReason; question: string; detail: string; subject?: string };
}

interface RunContext {
  clientId: string;
  employee: AiEmployee;
  duty: Duty;
  authority: Authority;
  /** TRIAL employment: every proposal is forced to a manual hold. */
  supervised: boolean;
  proposals: number;
}

function normalizeSubject(value: unknown): string {
  return String(value ?? "unknown")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

/**
 * The idempotency key a proposal is queued under.
 *
 * Two shapes, because the two kinds of action repeat differently. A money
 * action for a given customer is the same action forever — a second invoice
 * raised tomorrow for the job invoiced today is the failure this key exists to
 * prevent, so the key ignores time entirely. A message is not: "running late"
 * this morning and "finished" this afternoon are both legitimate and both go to
 * the same person, so the message body is folded in and only a genuinely
 * identical message is caught.
 */
export function dedupeKeyFor(
  employeeSlug: string,
  op: Operation,
  input: Record<string, unknown>,
): string {
  const kind = gateKindForOperation(op.key);
  const subject = normalizeSubject(input.customer);
  if (kind?.movesMoney) return `${employeeSlug}:${op.key}:${subject}`;

  const body = String(input.body ?? input.summary ?? "");
  const digest = createHash("sha1").update(body).digest("hex").slice(0, 10);
  return `${employeeSlug}:${op.key}:${subject}:${digest}`;
}

async function dispatch(
  ctx: RunContext,
  op: Operation,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  if (op.status !== "LIVE") {
    return {
      status: "UNAVAILABLE",
      result: {
        error: `"${op.key}" is declared but not wired up for this business yet. Carry on without it and say in your report that you could not use it.`,
      },
    };
  }

  const missing = missingParams(op, input);
  if (missing.length > 0) {
    return {
      status: "FAILED",
      result: { error: `Missing required parameters: ${missing.join(", ")}. Call it again with them.` },
    };
  }

  if (op.direction === "READ") {
    const reader = READERS[op.key];
    if (!reader) {
      return { status: "UNAVAILABLE", result: { error: `No reader is implemented for "${op.key}".` } };
    }
    try {
      return { status: "OK", result: (await reader(ctx.clientId, input)) as Record<string, unknown> };
    } catch (e) {
      // A failed read is survivable and the model is told so plainly — it can
      // usually finish the duty on what it already has, and a run that dies
      // because one query timed out is a shift nobody worked.
      return {
        status: "FAILED",
        result: { error: `That lookup failed: ${(e as Error).message}. Work with what you have.` },
      };
    }
  }

  // ---- WRITE ----
  const kind = gateKindForOperation(op.key);
  if (!kind) {
    // Unreachable — connectors.ts throws at import for a write with no kind.
    // Kept because "unreachable" is a claim about today's code.
    return { status: "REFUSED", result: { error: `"${op.key}" has no gate kind and cannot be proposed.` } };
  }

  if (ctx.proposals >= MAX_PROPOSALS_PER_RUN) {
    return {
      status: "REFUSED",
      result: {
        error: `You have already proposed ${MAX_PROPOSALS_PER_RUN} actions this run, which is the limit. Stop and write your report.`,
      },
    };
  }

  const amount = typeof input.amount_cents === "number" ? input.amount_cents : undefined;
  const verdict = authorityVerdict(ctx.authority, kind.key, kind.movesMoney ? amount : undefined);

  if (verdict.do === "refuse") {
    return { status: "REFUSED", result: { error: verdict.why, refused: true } };
  }

  if (verdict.do === "escalate") {
    return {
      status: "ESCALATED",
      result: {
        queued: false,
        escalated: true,
        note: `${verdict.why} This has been put in front of a person instead. Do not try again — carry on with the rest of the duty.`,
      },
      escalation: {
        reason: amount == null ? "NO_AUTHORITY" : "OVER_CEILING",
        subject: String(input.customer ?? input.summary ?? ""),
        question: `${ctx.employee.name} wants to ${kind.label.toLowerCase()} for ${
          input.customer ?? "a customer"
        }${amount != null ? ` at ${(amount / 100).toFixed(2)}` : ""}. Should it?`,
        detail: verdict.why,
      },
    };
  }

  try {
    const { action, created } = await propose({
      clientId: ctx.clientId,
      kind: kind.key,
      summary: String(input.summary ?? kind.label),
      subject: input.customer ? String(input.customer) : undefined,
      payload: { ...input, proposedBy: ctx.employee.slug, duty: ctx.duty.key },
      // A supervised employment asks for a stricter hold than the kind
      // requires. `resolveHold` can only ever tighten, so this is honoured for
      // every kind and silently ignored for none.
      hold: ctx.supervised ? "MANUAL" : undefined,
      dedupeKey: dedupeKeyFor(ctx.employee.slug, op, input),
    });

    // Only a new row counts. `proposed` on the run record means "reached the
    // gate", and a dedupe hit reached a row that was already there.
    if (created) ctx.proposals += 1;

    return {
      status: "OK",
      pendingActionId: action.id,
      result: {
        queued: created,
        queue_id: action.id,
        hold: action.hold,
        state: action.state,
        releases_at: action.releaseAt?.toISOString() ?? null,
        note: !created
          ? "Already in the queue — you or an earlier run proposed this exact action. Nothing new was added. Do not try again; move on."
          : action.hold === "MANUAL"
            ? "Waiting for a named person at this business. Nothing has been sent."
            : "Visible to the business now; sends when the review window closes unless somebody pulls it.",
      },
    };
  } catch (e) {
    return { status: "FAILED", result: { error: `The gate refused it: ${(e as Error).message}` } };
  }
}

// ---------------------------------------------------------------------------
// Escalations
// ---------------------------------------------------------------------------

async function raiseEscalation(
  ctx: { clientId: string; employee: AiEmployee; duty: Duty; runId?: string; businessName: string; to?: string | null },
  input: { reason: EscalationReason; question: string; detail: string; subject?: string | null; facts?: string[] },
): Promise<string> {
  const brief = escalationBrief({
    reason: input.reason,
    employee: ctx.employee.name,
    duty: ctx.duty.name,
    subject: input.subject ?? null,
    question: input.question,
    detail: input.detail,
    facts: input.facts,
  });

  const row = await prisma.escalation.create({
    data: {
      clientId: ctx.clientId,
      runId: ctx.runId ?? null,
      employeeSlug: ctx.employee.slug,
      dutyKey: ctx.duty.key,
      reason: brief.reason,
      title: brief.title,
      body: brief.body,
      question: brief.question,
    },
  });

  // Best-effort. An escalation that exists in the console but whose email did
  // not send is still an escalation; a run that failed because SMTP was down
  // would be a shift lost to a mail server.
  await sendNotification({
    kind: "ESCALATION_RAISED",
    to: ctx.to ?? undefined,
    payload: {
      businessName: ctx.businessName,
      title: brief.title,
      detail: brief.question,
      lines: [`${ctx.employee.name} · ${ctx.duty.name}`],
      path: "/app/employees",
    },
  }).catch((e) => console.warn("[desk] escalation notification failed:", (e as Error).message));

  return row.id;
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

export interface RunDutyInput {
  clientId: string;
  employeeSlug: string;
  dutyKey: string;
  now?: Date;
  trigger?: "SHIFT" | "SIGNAL" | "ASKED";
  /** Extra instruction for an ASKED run — what the person wants looked at. */
  ask?: string;
}

export interface RunDutyResult {
  status: "COMPLETE" | "ESCALATED" | "FAILED" | "SKIPPED";
  reason?: string;
  runId?: string;
  proposed?: number;
  escalations?: number;
  summary?: string | null;
}

/** The bucket a run belongs to, so a duty runs once per scheduled interval. */
export function runBucket(duty: Duty, now: Date): number {
  return Math.floor(now.getTime() / 3_600_000 / Math.max(1, duty.shift.everyHours));
}

/**
 * Work one duty, once.
 *
 * Idempotent per (client, employee, duty, interval) through `runKey`. The cron
 * fires hourly and Vercel retries; without the unique constraint a retry would
 * re-run a duty that has already proposed everything it was going to propose,
 * and the dedupe key in the gate would be the only thing standing between the
 * client and a second set of proposals.
 */
export async function runDuty(input: RunDutyInput): Promise<RunDutyResult> {
  const now = input.now ?? new Date();
  const employee = employeeBySlug(input.employeeSlug);
  if (!employee) return { status: "SKIPPED", reason: "No such employee" };

  const duty = employee.duties.find((d) => d.key === input.dutyKey);
  if (!duty) return { status: "SKIPPED", reason: "No such duty" };

  const employment = await prisma.employment.findUnique({
    where: { clientId_employeeSlug: { clientId: input.clientId, employeeSlug: employee.slug } },
  });
  if (!employment) return { status: "SKIPPED", reason: `${employee.name} is not hired here` };
  if (employment.state === "SUSPENDED") return { status: "SKIPPED", reason: "Suspended" };

  const client = await prisma.clientProfile.findUnique({
    where: { id: input.clientId },
    select: {
      businessName: true,
      voiceTone: true,
      approverName: true,
      approverEmail: true,
      user: { select: { email: true } },
    },
  });
  if (!client) return { status: "SKIPPED", reason: "No such client" };

  // Claim the slot before doing any work.
  const runKey = `${employee.slug}:${duty.key}:${runBucket(duty, now)}`;
  const existing = await prisma.employeeRun.findUnique({
    where: { clientId_runKey: { clientId: input.clientId, runKey } },
    select: { id: true, status: true },
  });
  if (existing && existing.status !== "FAILED") {
    return { status: "SKIPPED", reason: "Already run this interval", runId: existing.id };
  }

  const run =
    existing ??
    (await prisma.employeeRun.create({
      data: {
        clientId: input.clientId,
        employmentId: employment.id,
        employeeSlug: employee.slug,
        dutyKey: duty.key,
        trigger: input.trigger ?? "SHIFT",
        status: "RUNNING",
        runKey,
      },
      select: { id: true, status: true },
    }));

  const authority: Authority = {
    ...employee.authority,
    moneyCeilingCents: employment.moneyCeilingCents ?? employee.authority.moneyCeilingCents,
  };

  const ctx: RunContext = {
    clientId: input.clientId,
    employee,
    duty,
    authority,
    supervised: employment.state === "TRIAL",
    proposals: 0,
  };

  const escalationCtx = {
    clientId: input.clientId,
    employee,
    duty,
    runId: run.id,
    businessName: client.businessName,
    to: client.approverEmail ?? client.user.email,
  };

  let escalations = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let attempts = 0;

  try {
    const brief = [
      dutyBrief(employee, duty, { name: client.businessName, approver: client.approverName }),
      client.voiceTone ? `\nTHE BUSINESS'S VOICE — everything a customer reads must sound like this:\n${client.voiceTone}` : "",
      ctx.supervised
        ? "\nYOU ARE IN YOUR SUPERVISED PERIOD. Every single thing you propose waits for a named person, including the ones that would normally send on a timer."
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const context = await gatherDutyContext({
      clientId: input.clientId,
      employee,
      duty,
      brief,
      recallQuery: input.ask ?? duty.outcome,
      history: (
        await prisma.employeeRun.findMany({
          where: { clientId: input.clientId, employeeSlug: employee.slug, status: "COMPLETE" },
          orderBy: { startedAt: "desc" },
          take: 5,
          select: { dutyKey: true, summary: true, startedAt: true },
        })
      ).map((r) => ({ dutyKey: r.dutyKey, summary: r.summary, at: r.startedAt })),
    });

    const tools = toolsFor(duty.tools);
    const messages: MessageParam[] = [
      {
        role: "user",
        content: [
          `Start your ${duty.name.toLowerCase()} run. It is ${now.toISOString()}.`,
          input.ask ? `\nSomebody has asked specifically: ${input.ask}` : "",
          "\nRead before you act. Propose only what the records support. Then write your report.",
        ]
          .filter(Boolean)
          .join(""),
      },
    ];

    let finalText = "";
    let report: DutyReport | null = null;
    let lastFailure: { reason: EscalationReason; detail: string } | null = null;
    /** Model calls that threw. Bounds the retry, and paces the backoff. */
    let modelFailures = 0;
    /** Set when the model errors have run out of road, to leave both loops. */
    let outOfRetries = false;

    // Each report attempt is a full tool loop followed by a report. A bad
    // report costs one more attempt, not one more whole run — the tool calls
    // already made are real and must not be repeated.
    //
    // `attempts` counts every model call the run makes, which is what the run
    // record means by it and what somebody reading a failed run needs to know.
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !report && !outOfRetries; attempt++) {
      let turns = 0;

      while (turns < MAX_TOOL_TURNS) {
        turns++;
        attempts++;
        let res;
        try {
          res = await anthropic().messages.create({
            model: ANTHROPIC_MODEL,
            max_tokens: 2000,
            system: context.text,
            tools,
            messages,
          });
        } catch (e) {
          /*
            Counted separately from `attempts`, and the first version of this
            was wrong in a way only a real run showed.

            `attempts` belongs to the outer loop and does not move inside the
            tool loop, so passing it here meant `nextStep` was always asked
            about attempt 1 and always said retry — the real bound became
            MAX_TOOL_TURNS, and `backoffMs(1)` returned the same 500ms every
            time. Against an API that was down, one duty made eight rapid calls
            and then recorded `attempts: 1`. Bounded, but by the wrong constant,
            with no growing backoff, and reported as something that never
            happened.
          */
          modelFailures++;
          lastFailure = { reason: "MODEL_ERROR", detail: (e as Error).message };
          if (nextStep("MODEL_ERROR", modelFailures) === "escalate") {
            outOfRetries = true;
            break;
          }
          await new Promise((r) => setTimeout(r, backoffMs(modelFailures)));
          continue;
        }

        inputTokens += res.usage.input_tokens;
        outputTokens += res.usage.output_tokens;
        messages.push({ role: "assistant", content: res.content });

        const calls = res.content.filter(
          (b): b is Extract<typeof b, { type: "tool_use" }> => b.type === "tool_use",
        );

        if (calls.length === 0) {
          finalText = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
          break;
        }

        const results: ToolResultBlockParam[] = [];
        for (const call of calls) {
          const op = operationForToolName(call.name);
          const args = (call.input ?? {}) as Record<string, unknown>;
          const startedAt = Date.now();

          const outcome: ToolOutcome = op
            ? await dispatch(ctx, op, args)
            : {
                status: "FAILED",
                result: { error: `No such tool: ${call.name}` },
              };

          if (outcome.escalation) {
            await raiseEscalation(escalationCtx, {
              reason: outcome.escalation.reason,
              question: outcome.escalation.question,
              detail: outcome.escalation.detail,
              subject: outcome.escalation.subject,
            });
            escalations++;
          }

          await prisma.employeeToolCall.create({
            data: {
              runId: run.id,
              clientId: input.clientId,
              operationKey: op?.key ?? call.name,
              direction: op?.direction ?? "READ",
              status: outcome.status,
              input: args as never,
              result: outcome.result as never,
              pendingActionId: outcome.pendingActionId ?? null,
              error: outcome.status === "OK" ? null : String(outcome.result.error ?? outcome.result.note ?? ""),
              tookMs: Date.now() - startedAt,
            },
          });

          results.push({
            type: "tool_result",
            tool_use_id: call.id,
            content: JSON.stringify(outcome.result),
            is_error: outcome.status === "FAILED",
          });
        }

        messages.push({ role: "user", content: results });
      }

      if (!finalText) {
        // Either the model kept calling tools until the turn ceiling, or it
        // errored out of the loop. Both are the same thing from here: no report.
        lastFailure ??= {
          reason: "TOOL_ERROR",
          detail: `Ran out of turns after ${MAX_TOOL_TURNS} without writing a report.`,
        };
        break;
      }

      const parsed = validate(finalText, DutyReport);
      if (parsed.ok) {
        report = parsed.value;
        break;
      }

      lastFailure = { reason: "INVALID_OUTPUT", detail: parsed.error };
      if (nextStep("INVALID_OUTPUT", attempt) === "escalate") break;
      messages.push({ role: "user", content: repairPrompt(parsed.error, finalText) });
      finalText = "";
    }

    // ---- No usable report ----
    if (!report) {
      const failure = lastFailure ?? { reason: "INVALID_OUTPUT" as const, detail: "No report was produced." };
      await raiseEscalation(escalationCtx, {
        reason: failure.reason,
        question: `${employee.name} could not finish its ${duty.name.toLowerCase()} run. Does anything need doing by hand today?`,
        detail: failure.detail,
        facts: ctx.proposals > 0 ? [`${ctx.proposals} action(s) were proposed before it stopped and are in the queue.`] : [],
      });
      escalations++;

      await prisma.employeeRun.update({
        where: { id: run.id },
        data: {
          status: "ESCALATED",
          attempts,
          proposed: ctx.proposals,
          inputTokens,
          outputTokens,
          contextTokens: context.tokens,
          contextDropped: context.dropped as never,
          error: failure.detail.slice(0, 1000),
          completedAt: new Date(),
        },
      });

      return { status: "ESCALATED", runId: run.id, proposed: ctx.proposals, escalations, reason: failure.detail };
    }

    // ---- A report, and the two things that can still stop it ----
    const confidence = confidenceVerdict(report.confidence, duty.confidenceFloor);

    if (report.escalate) {
      await raiseEscalation(escalationCtx, {
        reason: "ASKED",
        question: report.escalate.question,
        detail: report.escalate.why,
        facts: [report.summary],
      });
      escalations++;
    } else if (confidence.do === "escalate") {
      await raiseEscalation(escalationCtx, {
        reason: "LOW_CONFIDENCE",
        question: `${employee.name} was not sure enough about this run to leave it. Worth a look?`,
        detail: confidence.why,
        facts: [report.summary],
      });
      escalations++;
    }

    const status = escalations > 0 ? "ESCALATED" : "COMPLETE";

    await prisma.employeeRun.update({
      where: { id: run.id },
      data: {
        status,
        attempts,
        reviewed: report.reviewed,
        summary: report.summary,
        confidence: report.confidence,
        proposed: ctx.proposals,
        inputTokens,
        outputTokens,
        contextTokens: context.tokens,
        contextDropped: context.dropped as never,
        completedAt: new Date(),
      },
    });

    return {
      status,
      runId: run.id,
      proposed: ctx.proposals,
      escalations,
      summary: report.summary,
    };
  } catch (e) {
    console.error(`[desk] ${employee.slug}/${duty.key} failed:`, e);
    await prisma.employeeRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        attempts: Math.max(1, attempts),
        proposed: ctx.proposals,
        inputTokens,
        outputTokens,
        error: (e as Error).message.slice(0, 1000),
        completedAt: new Date(),
      },
    });
    return { status: "FAILED", runId: run.id, reason: (e as Error).message, proposed: ctx.proposals };
  }
}

// ---------------------------------------------------------------------------
// The shift
// ---------------------------------------------------------------------------

export interface ShiftResult {
  considered: number;
  ran: number;
  escalated: number;
  proposed: number;
  skipped: number;
  failed: number;
}

/**
 * Every duty that is due, for every employee anybody has hired.
 *
 * Sequential on purpose. These are unattended model calls against a shared rate
 * limit, and a shift that fans out across every tenant at once is a shift that
 * gets throttled halfway through and leaves half the roster unworked — with no
 * signal, because each individual failure looks like a quiet day.
 */
export async function runShift(now = new Date()): Promise<ShiftResult> {
  const out: ShiftResult = { considered: 0, ran: 0, escalated: 0, proposed: 0, skipped: 0, failed: 0 };

  const employments = await prisma.employment.findMany({
    where: { state: { in: ["ACTIVE", "TRIAL"] } },
    select: { clientId: true, employeeSlug: true },
  });

  for (const employment of employments) {
    const employee = employeeBySlug(employment.employeeSlug);
    if (!employee) continue;

    for (const duty of employee.duties) {
      if (duty.trigger !== "SHIFT") continue;
      out.considered++;

      const last = await prisma.employeeRun.findFirst({
        where: {
          clientId: employment.clientId,
          employeeSlug: employee.slug,
          dutyKey: duty.key,
          status: { in: ["COMPLETE", "ESCALATED"] },
        },
        orderBy: { startedAt: "desc" },
        select: { startedAt: true },
      });

      if (!isOnShift(duty.shift, now, last?.startedAt)) {
        out.skipped++;
        continue;
      }

      const result = await runDuty({
        clientId: employment.clientId,
        employeeSlug: employee.slug,
        dutyKey: duty.key,
        now,
      });

      if (result.status === "SKIPPED") out.skipped++;
      else if (result.status === "FAILED") out.failed++;
      else {
        out.ran++;
        out.proposed += result.proposed ?? 0;
        if (result.status === "ESCALATED") out.escalated++;
      }
    }
  }

  return out;
}

/** Exported for the console: what an operation is, without importing the registry twice. */
export { operationByKey };
