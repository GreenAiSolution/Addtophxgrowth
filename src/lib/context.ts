/**
 * CONTEXT ASSEMBLY — deciding what the employee is allowed to know.
 *
 * DIRECTION
 *   The instinct with a large context window is to fill it. Everything the
 *   client owns, every tool the platform has, the whole knowledge base, and let
 *   the model sort it out. It is the wrong instinct, and not for the reason
 *   people usually give.
 *
 *   Cost is the least of it. The real price is attention: a model reading
 *   forty thousand tokens of mostly-irrelevant records to find the three that
 *   matter does that job worse than one handed the three, and it does it worse
 *   in a way nothing surfaces — no error, no warning, just a slightly worse
 *   proposal at the gate every day. The failure is invisible, which is what
 *   makes it expensive.
 *
 *   So: a budget, a priority order, and a written record of what was left out.
 *
 * WHAT IS NEVER EVICTED
 *   The brief and the authority. Everything else — records, learned facts,
 *   retrieved passages, the history of previous runs — can be trimmed under
 *   pressure, and the two blocks that say what this employee is and what it may
 *   not do cannot. An employee that dropped its ceiling because it was a busy
 *   Tuesday is a different, worse employee, and nothing about the run would say
 *   so.
 *
 *   `assemble` enforces that structurally: PINNED parts are never candidates
 *   for eviction, and if they alone exceed the budget it says so loudly rather
 *   than quietly cutting them.
 *
 * WHAT THE DROPPED LIST IS FOR
 *   `assemble` returns what it left out, and `desk.ts` writes it onto the run.
 *   When somebody asks why an employee missed the obvious job, the answer is
 *   either "it saw it and judged badly" or "it never saw it" — and those need
 *   completely different fixes. Without this list every investigation starts by
 *   guessing which one happened.
 *
 * BLUEPRINTS
 *   `estimateTokens` and `assemble` are pure and tested. `gatherDutyContext` is
 *   the only thing here that touches a database.
 */

import { memoryDigest } from "@/lib/memory";
import { search } from "@/lib/retrieval";
import type { AiEmployee, Duty } from "@/lib/employees";

/**
 * PINNED   — the job and the limits. Never dropped.
 * RECORDS  — what the business's own rows say right now.
 * LEARNED  — what its closed deals have taught the desk.
 * RECALLED — passages retrieved for this specific duty.
 * HISTORY  — what this employee did on previous runs.
 */
export type ContextKind = "PINNED" | "RECORDS" | "LEARNED" | "RECALLED" | "HISTORY";

export interface ContextPart {
  key: string;
  kind: ContextKind;
  /** Higher survives longer. Compared only within the evictable kinds. */
  priority: number;
  text: string;
}

export interface AssembledContext {
  text: string;
  tokens: number;
  included: string[];
  /** Keys left out, with why. Written onto the run record. */
  dropped: { key: string; reason: string }[];
  /**
   * True when the pinned parts alone do not fit. The run still proceeds — a
   * brief slightly over budget is not a reason to skip a shift — but it is a
   * loud fact rather than a silent truncation, and the console shows it.
   */
  overBudget: boolean;
}

/**
 * Tokens, estimated at four characters each.
 *
 * Deliberately an estimate. The exact count needs the tokenizer and a round
 * trip, and this is used to decide what to include *before* the call — a
 * budgeter that needs the API to answer is a budgeter that has already spent
 * the money. Four is close enough for English prose and slightly pessimistic
 * for JSON, which is the direction to be wrong in.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const SEPARATOR = "\n\n";

/**
 * Fit the parts into the budget.
 *
 * Order out is pinned first, then by priority — because the model reads in
 * order and the strongest position in a long prompt is the start. Eviction is
 * from the weakest priority upward, and a part is either wholly in or wholly
 * out: half a retrieved passage is a passage that says something its source
 * did not.
 */
export function assemble(parts: ContextPart[], budgetTokens: number): AssembledContext {
  const pinned = parts.filter((p) => p.kind === "PINNED");
  const evictable = parts
    .filter((p) => p.kind !== "PINNED")
    .sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key));

  const cost = (p: ContextPart) => estimateTokens(p.text) + 1;

  let spent = pinned.reduce((sum, p) => sum + cost(p), 0);
  const overBudget = spent > budgetTokens;

  const kept: ContextPart[] = [...pinned];
  const dropped: { key: string; reason: string }[] = [];

  for (const part of evictable) {
    const c = cost(part);
    if (spent + c <= budgetTokens) {
      kept.push(part);
      spent += c;
    } else {
      dropped.push({
        key: part.key,
        reason: `no room — ${c} tokens with ${Math.max(0, budgetTokens - spent)} left`,
      });
    }
  }

  return {
    text: kept.map((p) => p.text).join(SEPARATOR),
    tokens: spent,
    included: kept.map((p) => p.key),
    dropped,
    overBudget,
  };
}

// ---------------------------------------------------------------------------
// Rendering helpers — pure, so the console can show exactly what was sent
// ---------------------------------------------------------------------------

export function renderRecall(hits: { content: string; sourceType: string }[]): string {
  if (hits.length === 0) return "";
  return [
    "FROM THIS BUSINESS'S OWN HISTORY (retrieved for this duty — quote it rather than paraphrasing when it carries a date or a figure):",
    ...hits.map((h) => `• [${h.sourceType.toLowerCase()}] ${h.content}`),
  ].join("\n");
}

export function renderHistory(runs: { dutyKey: string; summary: string | null; at: Date }[]): string {
  if (runs.length === 0) return "";
  return [
    "WHAT YOU DID ON YOUR LAST FEW RUNS (do not repeat work that is already done):",
    ...runs.map((r) => `• ${r.at.toISOString().slice(0, 16).replace("T", " ")} — ${r.summary ?? "no summary"}`),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// The impure gather
// ---------------------------------------------------------------------------

export interface GatherInput {
  clientId: string;
  employee: AiEmployee;
  duty: Duty;
  /** The pinned brief, already composed by `dutyBrief`. */
  brief: string;
  /** Recent runs by this employee, newest first. */
  history?: { dutyKey: string; summary: string | null; at: Date }[];
  /** What to search the client's own index for. Defaults to the duty's outcome. */
  recallQuery?: string;
}

/**
 * Assemble everything this duty gets to see, for one tenant.
 *
 * Retrieval failing is survivable and is treated that way: the employee runs
 * with fewer passages and the run record says the recall was unavailable. The
 * alternative — a shift that skips because a vector index was slow — trades a
 * slightly less informed run for no run at all.
 */
export async function gatherDutyContext(input: GatherInput): Promise<AssembledContext> {
  const { clientId, duty, brief } = input;

  const parts: ContextPart[] = [{ key: "brief", kind: "PINNED", priority: 100, text: brief }];

  const [digest, hits] = await Promise.all([
    memoryDigest(clientId).catch(() => ""),
    search(clientId, input.recallQuery ?? duty.outcome, { limit: 6 }).catch(() => []),
  ]);

  if (digest.trim()) {
    parts.push({ key: "learned", kind: "LEARNED", priority: 80, text: digest.trim() });
  }

  const recall = renderRecall(hits);
  if (recall) {
    parts.push({ key: "recall", kind: "RECALLED", priority: 60, text: recall });
  }

  const history = renderHistory(input.history ?? []);
  if (history) {
    parts.push({ key: "history", kind: "HISTORY", priority: 40, text: history });
  }

  return assemble(parts, duty.contextBudget);
}
