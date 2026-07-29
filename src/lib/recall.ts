/**
 * RECALL — what the index is actually for.
 *
 * A vector store with nothing to retrieve is an expensive empty table, so this
 * file is the reason the other two exist. It answers one question, in the
 * owner's words: **have we seen this before, and what happened?**
 *
 * The statistical memory already in this system can say "leads scoring above
 * seventy close at some rate". It cannot say "this reads like the Hargreaves
 * job — same objection, same hesitation about the quote — and that one closed
 * at eleven thousand after a follow-up on day four". That second sentence is
 * the one that changes what somebody does next, and it needs resemblance
 * rather than arithmetic.
 *
 * HONESTY RULES, INHERITED FROM THE REST OF THE CODEBASE
 *   - Never present a recall as evidence when it rests on one match. The
 *     memory engine has MIN_EVIDENCE for exactly this reason and so does this.
 *   - Never present lexical-only results as semantic. When the embedding
 *     provider is the local hash, `semantic` comes back false and every
 *     surface says so rather than implying the system understood anything.
 *   - Outcomes are counted from the rows, never estimated.
 */

import { prisma } from "@/lib/prisma";
import { provider } from "@/lib/embeddings";
import { indexSource, search, type SearchHit } from "@/lib/retrieval";

/** Below this, a pattern is a coincidence. Mirrors memory.ts deliberately. */
export const MIN_PRECEDENTS = 3;

export interface Precedent {
  leadId: string;
  name: string | null;
  company: string | null;
  outcome: "WON" | "LOST" | "OPEN";
  valueCents: number | null;
  content: string;
  score: number;
  via: ("vector" | "lexical")[];
}

export interface RecallResult {
  precedents: Precedent[];
  /** False when the embedding provider is the local hash. Surfaces say so. */
  semantic: boolean;
  /** Counted, never estimated. */
  won: number;
  lost: number;
  open: number;
  /** Average value of the ones that closed, in cents. Null below the floor. */
  averageWonCents: number | null;
  /**
   * One line a person can act on, or null when there is not enough to say
   * anything honest. Null is a valid and common answer.
   */
  verdict: string | null;
}

/**
 * The text an embedding of a lead should actually contain.
 *
 * Kept in one place because it has to be identical at index time and at query
 * time. A lead indexed from one shape and searched with another compares two
 * different documents, and the result is a similarity score that means
 * nothing — the exact failure that has no symptom.
 */
export function leadText(lead: {
  name?: string | null;
  company?: string | null;
  message?: string | null;
  source?: string | null;
}): string {
  return [
    lead.company ? `Company: ${lead.company}` : null,
    lead.name ? `Contact: ${lead.name}` : null,
    lead.source ? `Source: ${lead.source}` : null,
    lead.message?.trim() || null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Index one lead. Safe to call repeatedly — `indexSource` replaces in place. */
export async function indexLead(clientId: string, leadId: string): Promise<number> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, clientId },
    select: { id: true, name: true, company: true, message: true, source: true },
  });
  if (!lead) return 0;

  const text = leadText(lead);
  if (!text.trim()) return 0;

  return indexSource({
    clientId,
    sourceType: "LEAD",
    sourceId: lead.id,
    text,
    meta: { name: lead.name, company: lead.company },
  });
}

/**
 * Turn raw hits into something a person can read, with the outcomes attached.
 *
 * Pure so the counting and the verdict are testable without a database — the
 * numbers on this screen are the ones somebody will make a decision on, and
 * "close enough" is not a standard they should be held to.
 */
export function summarise(
  precedents: Precedent[],
  semantic: boolean,
): Omit<RecallResult, "precedents" | "semantic"> {
  const won = precedents.filter((p) => p.outcome === "WON").length;
  const lost = precedents.filter((p) => p.outcome === "LOST").length;
  const open = precedents.filter((p) => p.outcome === "OPEN").length;

  const wonValues = precedents
    .filter((p) => p.outcome === "WON" && typeof p.valueCents === "number")
    .map((p) => p.valueCents!);

  const averageWonCents =
    wonValues.length > 0
      ? Math.round(wonValues.reduce((a, b) => a + b, 0) / wonValues.length)
      : null;

  const closed = won + lost;

  /*
    The verdict is null far more often than it is a sentence, and that is the
    point. Two similar leads is an anecdote. Stating "these usually close"
    off the back of it would be the same failure as an invented statistic on
    the marketing site — a number that sounds like evidence and is not.
  */
  let verdict: string | null = null;
  if (!semantic) {
    verdict = null;
  } else if (closed < MIN_PRECEDENTS) {
    verdict = null;
  } else if (won > lost) {
    verdict = `${won} of the ${closed} closest matches that closed were won.`;
  } else if (lost > won) {
    verdict = `${lost} of the ${closed} closest matches that closed were lost.`;
  } else {
    verdict = `The ${closed} closest matches that closed split evenly.`;
  }

  return { won, lost, open, averageWonCents, verdict };
}

/**
 * Find the leads that read like this one, and say what they did.
 *
 * `excludeLeadId` matters: a lead is always its own nearest neighbour, and a
 * precedent list whose first entry is the thing you are looking at is a list
 * that has told you nothing.
 */
export async function recallSimilarLeads(
  clientId: string,
  text: string,
  opts: { limit?: number; excludeLeadId?: string } = {},
): Promise<RecallResult> {
  const limit = opts.limit ?? 5;
  const semantic = provider().semantic;

  // Over-fetch, because the lead itself and any stale rows get filtered after.
  const hits: SearchHit[] = await search(clientId, text, {
    limit: limit + 4,
    sourceTypes: ["LEAD"],
  });

  const leadIds = [...new Set(hits.map((h) => h.sourceId))].filter(
    (id) => id !== opts.excludeLeadId,
  );

  if (leadIds.length === 0) {
    return { precedents: [], semantic, ...summarise([], semantic) };
  }

  const leads = await prisma.lead.findMany({
    // Scoped again. The ids came from a scoped search, and this is still the
    // last place a refactor could turn a ranking bug into a tenancy bug.
    where: { id: { in: leadIds }, clientId },
    select: {
      id: true,
      name: true,
      company: true,
      status: true,
      outcomes: { select: { outcome: true, valueCents: true }, take: 1, orderBy: { createdAt: "desc" } },
    },
  });

  const byId = new Map(leads.map((l) => [l.id, l]));

  const precedents: Precedent[] = hits
    .filter((h) => byId.has(h.sourceId) && h.sourceId !== opts.excludeLeadId)
    .slice(0, limit)
    .map((h) => {
      const lead = byId.get(h.sourceId)!;
      const outcome = lead.outcomes[0];
      return {
        leadId: lead.id,
        name: lead.name,
        company: lead.company,
        outcome:
          outcome?.outcome === "WON" ? "WON" : outcome?.outcome === "LOST" ? "LOST" : ("OPEN" as const),
        valueCents: outcome?.valueCents ?? null,
        content: h.content,
        score: h.score,
        via: h.via,
      };
    });

  return { precedents, semantic, ...summarise(precedents, semantic) };
}
