/**
 * CONVERSATION INTELLIGENCE — ingestion, extraction, and the loop back.
 *
 * DIRECTION
 *   The pure half is done. This file is the only part that touches the
 *   database or a model, and it exists to do three things in order:
 *
 *     1. Take a conversation in, refusing it if there is no basis to hold it,
 *        and redact it before it lands.
 *     2. Read it, once, and record what happened against a closed vocabulary.
 *     3. Feed that into `memory.ts`, which is the point of the whole
 *        subsystem — the memory engine has been learning from the handful of
 *        outcomes a client remembers to type in, and there are hundreds it
 *        never hears about.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *   The telephony integration. Pulling recordings out of a provider needs
 *   credentials this repository does not have, and every provider's webhook
 *   shape is different. `ingestConversation` is the boundary they all land on:
 *   give it the metadata and the transcript text, and everything downstream is
 *   provider-agnostic and tested.
 *
 *   That boundary is drawn on purpose rather than for want of time. A
 *   provider-shaped ingestion path is how a subsystem ends up unable to accept
 *   the second provider.
 *
 * THE DOUBLE-COUNT RULE
 *   `memoryAppliedAt` is set when a conversation has been folded into system
 *   memory, and the fold is skipped if it is already set. Without it, a re-run
 *   turns one lost deal into three, and `computeCalibration` starts reporting
 *   a close rate built on triple-counted losses — a number that looks like a
 *   business problem and is a software bug.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { anthropic, ANTHROPIC_MODEL } from "@/lib/anthropic";
import { recordOutcome } from "@/lib/memory";
import { redact } from "./redact";
import {
  extractorInstruction,
  isConsentBasis,
  objectionToMemoryText,
  sanitizeExtraction,
  type ConsentBasis,
  type Extraction,
  type Objection,
} from "./taxonomy";
import {
  answerStats,
  findLeaks,
  leakValue,
  type ConversationRecord,
  type Leak,
} from "./analyze";

// ---------------------------------------------------------------------------
// Ingestion
// ---------------------------------------------------------------------------

export interface IngestInput {
  clientId: string;
  contactKey: string;
  contactName?: string | null;
  direction: "INBOUND" | "OUTBOUND";
  channel: "CALL" | "SMS" | "EMAIL" | "CHAT";
  startedAt: Date;
  durationSec?: number | null;
  consentBasis: ConsentBasis;
  /** Null for a missed call — which has no transcript and is still the most valuable row here. */
  transcript?: string | null;
  leadId?: string | null;
}

export type IngestResult =
  | { status: "STORED"; id: string; redacted: boolean }
  | { status: "REFUSED"; reason: string };

/**
 * Store one conversation.
 *
 * Refuses rather than stores-and-flags when there is no consent basis. The
 * flagged version means the transcript is already on our disk, which is
 * exactly the thing that was supposed to require a basis.
 */
export async function ingestConversation(input: IngestInput): Promise<IngestResult> {
  if (!isConsentBasis(input.consentBasis)) {
    return {
      status: "REFUSED",
      reason:
        "No valid consent basis. A conversation is not stored without a recorded reason we are permitted to hold it.",
    };
  }

  const scrubbed = input.transcript ? redact(input.transcript) : null;

  const row = await prisma.customerConversation.create({
    data: {
      clientId: input.clientId,
      contactKey: input.contactKey,
      contactName: input.contactName ?? null,
      direction: input.direction,
      channel: input.channel,
      startedAt: input.startedAt,
      durationSec: input.durationSec ?? null,
      consentBasis: input.consentBasis,
      transcript: scrubbed?.text ?? null,
      redactions: (scrubbed?.redactions ?? []) as unknown as Prisma.InputJsonValue,
      leadId: input.leadId ?? null,
    },
    select: { id: true },
  });

  return {
    status: "STORED",
    id: row.id,
    redacted: (scrubbed?.redactions.length ?? 0) > 0,
  };
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/** Pure: pull an extraction out of whatever the model replied with. */
export function parseExtraction(text: string): {
  extraction: Extraction;
  problems: ReturnType<typeof sanitizeExtraction>["problems"];
} {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return sanitizeExtraction({});

  try {
    return sanitizeExtraction(JSON.parse(candidate) as Record<string, unknown>);
  } catch {
    // An unparseable reply extracts nothing and lands as UNCLEAR. It must
    // never extract partially: a regex looking for "booked" in prose finds it
    // in "we haven't booked anything" as readily as in an answer.
    return sanitizeExtraction({});
  }
}

/**
 * Read one conversation and record what happened.
 *
 * A conversation with no transcript is not sent to the model at all — a missed
 * call's outcome is known from its metadata, and spending a model call to be
 * told so is how an unattended job quietly becomes expensive.
 */
export async function extractConversation(id: string): Promise<Extraction | null> {
  const convo = await prisma.customerConversation.findUnique({ where: { id } });
  if (!convo) return null;

  if (!convo.transcript) {
    const extraction: Extraction = {
      outcome: "NO_ANSWER",
      objections: [],
      quotedCents: null,
      nextStepAgreed: false,
      summary: null,
    };
    await persistExtraction(id, extraction);
    return extraction;
  }

  const res = await anthropic().messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 800,
    system: extractorInstruction(),
    messages: [{ role: "user", content: convo.transcript }],
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const { extraction } = parseExtraction(text);

  await persistExtraction(id, extraction);
  return extraction;
}

async function persistExtraction(id: string, extraction: Extraction): Promise<void> {
  await prisma.customerConversation.update({
    where: { id },
    data: {
      outcome: extraction.outcome,
      objections: extraction.objections as unknown as Prisma.InputJsonValue,
      quotedCents: extraction.quotedCents,
      nextStepAgreed: extraction.nextStepAgreed,
      summary: extraction.summary,
      extractedAt: new Date(),
    },
  });
}

// ---------------------------------------------------------------------------
// The loop back into system memory
// ---------------------------------------------------------------------------

/**
 * Which extracted outcomes are worth telling the memory engine about.
 *
 * `QUOTED` and `CALLBACK_PROMISED` are deliberately absent: nothing has
 * happened yet, and filing a live opportunity as a loss would teach the
 * qualifier that its best leads fail. `WRONG_FIT` is absent too — it is a
 * targeting problem, and counting it as a lost deal would make the close rate
 * a fact about the media buying rather than about the selling.
 */
const MEMORY_OUTCOMES: Record<string, "WON" | "LOST"> = {
  BOOKED: "WON",
  NOT_INTERESTED: "LOST",
};

export interface FoldResult {
  considered: number;
  applied: number;
  skipped: number;
}

/**
 * Fold everything the extractor has concluded into system memory.
 *
 * This is the payoff. `memory.ts` has always been able to learn a client's
 * real close rate per score band, which objections actually kill deals, and
 * what a won deal is worth — and has been doing it on the handful of outcomes
 * somebody remembered to type into a form. Every answered call is one of those
 * outcomes and nobody was typing them in.
 */
export async function foldIntoMemory(clientId: string): Promise<FoldResult> {
  const pending = await prisma.customerConversation.findMany({
    where: {
      clientId,
      memoryAppliedAt: null,
      extractedAt: { not: null },
      outcome: { in: Object.keys(MEMORY_OUTCOMES) },
    },
    select: {
      id: true,
      outcome: true,
      objections: true,
      quotedCents: true,
      leadId: true,
    },
  });

  let applied = 0;

  for (const convo of pending) {
    const kind = MEMORY_OUTCOMES[convo.outcome ?? ""];
    if (!kind) continue;

    const objections = (convo.objections ?? []) as unknown as Objection[];
    // The first objection is the one recorded. `memory.ts` learns one
    // objection per lost deal, and a call where somebody raised three reasons
    // has one reason that actually killed it — spreading it across all three
    // would make every objection look half as decisive as it is.
    const objection =
      kind === "LOST" && objections.length > 0 ? objectionToMemoryText(objections[0]) : null;

    await recordOutcome({
      clientId,
      leadId: convo.leadId,
      outcome: kind,
      // Only a figure somebody actually said. A won deal with no quote on the
      // call is worth an unknown amount, and zero is the honest placeholder
      // for "not stated" here because `memory.ts` already averages only over
      // deals that carry a value.
      valueCents: convo.quotedCents ?? 0,
      objection,
      notes: "Recorded from a customer conversation.",
    });

    await prisma.customerConversation.update({
      where: { id: convo.id },
      data: { memoryAppliedAt: new Date() },
    });
    applied += 1;
  }

  return { considered: pending.length, applied, skipped: pending.length - applied };
}

// ---------------------------------------------------------------------------
// Reading the leaks
// ---------------------------------------------------------------------------

export interface LeakReport {
  leaks: Leak[];
  knownCents: number;
  unpriced: number;
  answer: ReturnType<typeof answerStats>;
}

/** How far back the leak rules look. Older than this and nobody is calling back. */
const LOOKBACK_DAYS = 30;

/** Everything the leak rules can see for one tenant. */
export async function leakReport(clientId: string, now = new Date()): Promise<LeakReport> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);

  const rows = await prisma.customerConversation.findMany({
    where: { clientId, startedAt: { gte: since } },
    select: {
      id: true,
      contactKey: true,
      direction: true,
      channel: true,
      startedAt: true,
      outcome: true,
      quotedCents: true,
      nextStepAgreed: true,
    },
    orderBy: { startedAt: "asc" },
  });

  const records: ConversationRecord[] = rows.map((r) => ({
    id: r.id,
    contactKey: r.contactKey,
    direction: r.direction as ConversationRecord["direction"],
    channel: r.channel as ConversationRecord["channel"],
    startedAt: r.startedAt,
    // An un-extracted conversation is UNCLEAR, not NO_ANSWER. Defaulting the
    // other way would report every conversation awaiting extraction as a
    // missed call, which is a full inbox of imaginary emergencies.
    outcome: (r.outcome as ConversationRecord["outcome"]) ?? "UNCLEAR",
    quotedCents: r.quotedCents,
    nextStepAgreed: r.nextStepAgreed,
  }));

  const leaks = findLeaks(records, now);
  const { knownCents, unpriced } = leakValue(leaks);

  return { leaks, knownCents, unpriced, answer: answerStats(records, now) };
}

/**
 * Clients with extracted conversations that have not yet reached memory.
 *
 * A dedicated roster rather than piggybacking on the night-shift roster,
 * deliberately. The night shift rosters off tier — Command nightly, Scale
 * weekly, Launch never — and conversations arrive for every client regardless
 * of what they pay. Reusing that roster would mean a Launch client's calls
 * were extracted, stored, and silently never folded into anything, which is
 * exactly the shape of the bug that let a Launch client's leads land in a
 * table with no screen.
 */
export async function conversationRoster(): Promise<string[]> {
  const rows = await prisma.customerConversation.findMany({
    where: {
      memoryAppliedAt: null,
      extractedAt: { not: null },
      outcome: { in: Object.keys(MEMORY_OUTCOMES) },
    },
    select: { clientId: true },
    distinct: ["clientId"],
  });
  return rows.map((r) => r.clientId);
}

/** Conversations ingested but never read. The extractor's own backlog. */
export async function extractionBacklog(): Promise<string[]> {
  const rows = await prisma.customerConversation.findMany({
    where: { extractedAt: null },
    select: { id: true },
    orderBy: { startedAt: "asc" },
    take: MAX_EXTRACTIONS_PER_RUN,
  });
  return rows.map((r) => r.id);
}

/**
 * Cap per tick. An unattended job that will happily make five hundred model
 * calls because a telephony backfill landed overnight is how a month's budget
 * disappears before anybody is awake to see it. The backlog drains over
 * several ticks instead.
 */
export const MAX_EXTRACTIONS_PER_RUN = 40;
