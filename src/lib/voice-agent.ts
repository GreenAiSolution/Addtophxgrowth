/**
 * The phone desk's run loop — the impure half of lib/voice.ts.
 *
 * Same split as night-shift.ts: everything that decides what happens is pure
 * and lives in lib/voice.ts / lib/estimate.ts; this file is only the wiring —
 * one model call per turn, persistence, and (for ESTIMATE) creating the
 * DRAFT row and proposing it through the gate rather than sending it.
 */

import { prisma } from "@/lib/prisma";
import { anthropic, ANTHROPIC_MODEL } from "@/lib/anthropic";
import {
  appendTurn,
  buildVoiceSystemPrompt,
  parseAgentTurn,
  summarizeTranscript,
  type ParsedTurn,
  type TranscriptTurn,
} from "@/lib/voice";
import { computeEstimate } from "@/lib/estimate";
import { resolveVertical } from "@/lib/verticals";
import { propose } from "@/lib/gate";
import { sendNotification, agencyAddress } from "@/lib/notify";
import type { CallLog } from "@prisma/client";

const MAX_TURNS = 12;

export interface CallClientContext {
  id: string;
  businessName: string;
  voiceTone: string | null;
  verticalKey: string | null;
  industry: string | null;
}

/**
 * Run one turn of a live call: append the caller's speech, ask the model what
 * to say and do next, persist it, and act on ESTIMATE / urgency as needed.
 * Never throws — a call in progress cannot be allowed to error into dead air.
 */
export async function runVoiceTurn(
  call: CallLog,
  client: CallClientContext,
  speechText: string,
  isOutbound: boolean,
  leadContext?: string | null,
): Promise<ParsedTurn> {
  const existing = ((call.transcript as unknown as TranscriptTurn[] | null) ?? []) as TranscriptTurn[];

  if (existing.filter((t) => t.role === "caller").length >= MAX_TURNS) {
    return {
      say: "I want to make sure this gets to a person — I'll pass along everything you've told me and someone will call you back shortly.",
      action: "MESSAGE",
      collected: {},
      urgent: false,
    };
  }

  const pack = resolveVertical(client);
  const systemPrompt = buildVoiceSystemPrompt({
    businessName: client.businessName,
    brandVoice: client.voiceTone,
    verticalName: pack?.trade,
    isOutbound,
    leadContext,
  });

  const withCaller = appendTurn(existing, "caller", speechText);

  let parsed: ParsedTurn;
  try {
    const res = await anthropic().messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 400,
      system: systemPrompt,
      messages: withCaller.map((t) => ({
        role: t.role === "caller" ? ("user" as const) : ("assistant" as const),
        content: t.text,
      })),
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    parsed = parseAgentTurn(text);
  } catch (err) {
    console.error("[voice-agent] model call failed, degrading to a message:", err);
    parsed = {
      say: "Sorry — I'm having trouble right now. Let me take your name and number and have someone call you back.",
      action: "MESSAGE",
      collected: {},
      urgent: false,
    };
  }

  const withAssistant = appendTurn(withCaller, "assistant", parsed.say);

  await prisma.callLog.update({
    where: { id: call.id },
    data: { transcript: withAssistant as unknown as object },
  });

  if (parsed.action === "ESTIMATE") {
    await handleEstimate(call, client, parsed, withAssistant);
  }

  return parsed;
}

/**
 * Price the job deterministically, create a DRAFT estimate, and propose it
 * through the gate — reusing the "quote.send" action kind that already exists
 * in lib/gate.ts. Nothing is sent to the customer from here; the call ends
 * with "you'll get a written number", not a promise the AI can't keep, and
 * lib/executors/estimate-send.ts is what actually delivers it once released.
 */
async function handleEstimate(
  call: CallLog,
  client: CallClientContext,
  parsed: ParsedTurn,
  transcript: TranscriptTurn[],
): Promise<void> {
  const jobType = parsed.collected.jobType ?? "unspecified job";
  const result = computeEstimate({
    verticalKey: client.verticalKey,
    jobType,
    quantity: parsed.collected.quantity,
    urgency: parsed.collected.urgency,
  });

  const estimate = await prisma.estimate.create({
    data: {
      clientId: client.id,
      callLogId: call.id,
      leadId: call.leadId,
      jobType,
      details: {
        quantity: result.quantity,
        unit: result.unit,
        address: parsed.collected.address ?? null,
        notes: parsed.collected.notes ?? null,
        urgency: parsed.collected.urgency ?? "STANDARD",
        confidence: result.confidence,
      },
      priceLowCents: result.priceLowCents,
      priceHighCents: result.priceHighCents,
      basis: result.basis,
    },
  });

  await prisma.callLog.update({
    where: { id: call.id },
    data: { outcome: "ESTIMATE_GIVEN", estimate: { connect: { id: estimate.id } } },
  });

  const callerName = parsed.collected.callerName ?? "the caller";
  const callbackPhone = parsed.collected.callbackPhone ?? call.fromNumber;

  await propose({
    clientId: client.id,
    kind: "quote.send",
    summary: `Send ${callerName} the phone estimate for ${jobType} — ${result.unit === "job" ? "" : `${result.quantity} ${result.unit}, `}${(result.priceLowCents / 100).toLocaleString("en-US")}–${(result.priceHighCents / 100).toLocaleString("en-US")}`,
    subject: callerName,
    payload: {
      estimateId: estimate.id,
      clientId: client.id,
      leadId: call.leadId,
      callLogId: call.id,
      callerName,
      callbackPhone,
      jobType,
      priceLowCents: result.priceLowCents,
      priceHighCents: result.priceHighCents,
      basis: result.basis,
      confidence: result.confidence,
      transcript: summarizeTranscript(transcript),
    },
    dedupeKey: `estimate:${estimate.id}`,
  });

  if (result.confidence === "FALLBACK") {
    // A placeholder range went to a real customer's file — worth a heads-up
    // even before the gate sweep runs, since it means either the rate card or
    // the model's job-type extraction needs attention.
    await sendNotification({
      kind: "ESTIMATE_FALLBACK_USED",
      to: agencyAddress(),
      payload: {
        businessName: client.businessName,
        title: jobType,
        detail: `A caller asked about "${jobType}" and no rate-card line matched.`,
        path: "/app/gate",
      },
    });
  }
}
