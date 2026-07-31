/**
 * The phone desk — conversation logic, kept pure and tested.
 *
 * DIRECTION
 *   `night-shift.ts` draws the line this file follows: everything that decides
 *   *what happens* is pure and testable without a model or a database; only
 *   `lib/voice-agent.ts` touches Anthropic and Prisma. A phone call is worse to
 *   get wrong than an overnight batch — there's a live person on the line — so
 *   the same discipline applies harder here: business-hours gating, greeting
 *   copy, and turn parsing are all plain functions with no I/O.
 *
 *   The one thing this file deliberately does NOT decide is price. See
 *   lib/estimate.ts — an estimate is arithmetic off a rate card, never
 *   something the conversation model is trusted to state.
 *
 * BLUEPRINTS
 *   `parseAgentTurn` mirrors `parseScore` in night-shift.ts: tolerant, total,
 *   and degrades to "say the raw text, keep listening" rather than losing a
 *   caller because one reply didn't parse.
 */

export type VoiceAction = "CONTINUE" | "ESTIMATE" | "TRANSFER" | "MESSAGE" | "END";

export interface CollectedFields {
  callerName?: string;
  callbackPhone?: string;
  jobType?: string;
  quantity?: number;
  address?: string;
  urgency?: "STANDARD" | "EMERGENCY";
  notes?: string;
}

export interface ParsedTurn {
  /** Spoken back to the caller via TTS. Always non-empty. */
  say: string;
  action: VoiceAction;
  collected: CollectedFields;
  /** Escalate regardless of business hours — a described emergency, a
   * complaint, anything the AI shouldn't be the last word on. */
  urgent: boolean;
}

export interface TranscriptTurn {
  role: "caller" | "assistant";
  text: string;
  at: string;
}

const SAY_FALLBACK_LIMIT = 600;

/**
 * Pull structure out of the model's reply. Tolerant by design, same shape as
 * `parseScore`: fenced JSON → bare JSON → the raw text as something to say
 * while staying in CONTINUE, never a throw that drops the call.
 */
export function parseAgentTurn(text: string): ParsedTurn {
  const trimmed = text.trim();
  const fallback: ParsedTurn = {
    say:
      trimmed.slice(0, SAY_FALLBACK_LIMIT) ||
      "Sorry, could you say that again?",
    action: "CONTINUE",
    collected: {},
    urgent: false,
  };
  if (!trimmed) return fallback;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? trimmed.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return fallback;

  try {
    const obj = JSON.parse(candidate) as Record<string, unknown>;
    const say = typeof obj.say === "string" && obj.say.trim() ? obj.say.trim() : fallback.say;
    const rawAction = typeof obj.action === "string" ? obj.action.toUpperCase() : "";
    const action: VoiceAction = (
      ["CONTINUE", "ESTIMATE", "TRANSFER", "MESSAGE", "END"] as const
    ).includes(rawAction as VoiceAction)
      ? (rawAction as VoiceAction)
      : "CONTINUE";

    const c = (obj.collected ?? {}) as Record<string, unknown>;
    const collected: CollectedFields = {
      callerName: typeof c.callerName === "string" ? c.callerName.slice(0, 200) : undefined,
      callbackPhone: typeof c.callbackPhone === "string" ? c.callbackPhone.slice(0, 60) : undefined,
      jobType: typeof c.jobType === "string" ? c.jobType.slice(0, 200) : undefined,
      quantity:
        typeof c.quantity === "number" && Number.isFinite(c.quantity) && c.quantity > 0
          ? c.quantity
          : undefined,
      address: typeof c.address === "string" ? c.address.slice(0, 300) : undefined,
      urgency: c.urgency === "EMERGENCY" ? "EMERGENCY" : c.urgency === "STANDARD" ? "STANDARD" : undefined,
      notes: typeof c.notes === "string" ? c.notes.slice(0, 1000) : undefined,
    };

    return {
      say: say.slice(0, SAY_FALLBACK_LIMIT),
      action,
      collected,
      urgent: obj.urgent === true,
    };
  } catch {
    return fallback;
  }
}

export interface BusinessHours {
  /** 0-23, UTC. */
  startUtcHour: number;
  /** 0-23, UTC. Less than startUtcHour means the window crosses midnight. */
  endUtcHour: number;
  /** 0=Sunday..6=Saturday. Empty/undefined = every day. */
  days?: number[];
}

/** Parses PhoneLine.businessHours (an untyped Prisma Json column) defensively. */
export function parseBusinessHours(raw: unknown): BusinessHours | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const start = Number(o.startUtcHour);
  const end = Number(o.endUtcHour);
  if (!Number.isInteger(start) || start < 0 || start > 23) return null;
  if (!Number.isInteger(end) || end < 0 || end > 23) return null;
  const days = Array.isArray(o.days) ? o.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6) : undefined;
  return { startUtcHour: start, endUtcHour: end, days };
}

/**
 * Whether a human is available to TRANSFER to right now. The AI answers every
 * call regardless of this — it only gates whether a live hand-off is even
 * attempted versus going straight to taking a message.
 */
export function isWithinBusinessHours(
  hours: BusinessHours | null | undefined,
  now: Date,
): boolean {
  if (!hours) return false;

  const day = now.getUTCDay();
  if (hours.days && hours.days.length > 0 && !hours.days.includes(day)) return false;

  const hour = now.getUTCHours();
  if (hours.startUtcHour === hours.endUtcHour) return true; // 24-hour window
  if (hours.startUtcHour < hours.endUtcHour) {
    return hour >= hours.startUtcHour && hour < hours.endUtcHour;
  }
  // Crosses midnight UTC.
  return hour >= hours.startUtcHour || hour < hours.endUtcHour;
}

export interface GreetingInput {
  businessName: string;
  isWithinHours: boolean;
  customGreeting?: string | null;
  customAfterHoursGreeting?: string | null;
  isOutbound?: boolean;
  leadContext?: string | null;
}

/**
 * What the caller hears the instant the call connects — before the model has
 * run at all. Kept separate from the model so the first thing a caller hears
 * never depends on an API call succeeding.
 */
export function buildGreeting(input: GreetingInput): string {
  if (input.isOutbound) {
    return (
      input.customGreeting?.trim() ||
      `Hi, this is the automated assistant for ${input.businessName}, calling you back` +
        (input.leadContext ? ` about ${input.leadContext}` : "") +
        ". Is now an okay time to talk for a minute?"
    );
  }

  if (!input.isWithinHours && input.customAfterHoursGreeting?.trim()) {
    return input.customAfterHoursGreeting.trim();
  }
  if (input.customGreeting?.trim()) return input.customGreeting.trim();

  return input.isWithinHours
    ? `Thanks for calling ${input.businessName}. I'm the automated assistant — I can help right now, or get you booked in. What can I help with?`
    : `Thanks for calling ${input.businessName}. It's after hours, but I'm still here and I can help right now — what's going on?`;
}

/** Appends one turn, never mutating the input array. */
export function appendTurn(
  transcript: TranscriptTurn[] | null | undefined,
  role: TranscriptTurn["role"],
  text: string,
  at: Date = new Date(),
): TranscriptTurn[] {
  return [...(transcript ?? []), { role, text: text.slice(0, 2000), at: at.toISOString() }];
}

/** Turn a transcript into the one-paragraph summary that lands on Lead.message. */
export function summarizeTranscript(transcript: TranscriptTurn[] | null | undefined): string {
  if (!transcript || transcript.length === 0) return "(call connected, no conversation captured)";
  return transcript
    .map((t) => `${t.role === "caller" ? "Caller" : "Assistant"}: ${t.text}`)
    .join("\n");
}

const JSON_TURN_INSTRUCTION = [
  "You are on a live phone call. Respond with ONLY a fenced ```json block, nothing before or after it:",
  '{ "say": "<what to say next, one or two short sentences, natural spoken English>",',
  '  "action": "CONTINUE"|"ESTIMATE"|"TRANSFER"|"MESSAGE"|"END",',
  '  "collected": { "callerName"?: string, "callbackPhone"?: string, "jobType"?: string, "quantity"?: number, "address"?: string, "urgency"?: "STANDARD"|"EMERGENCY", "notes"?: string },',
  '  "urgent": boolean }',
  "Use ESTIMATE only once you have at minimum a jobType and enough detail to size the job — never invent a price yourself, a pricing engine handles that.",
  "Use TRANSFER when the caller explicitly asks for a human, is upset, or the request is outside what you can help with on the phone.",
  "Use MESSAGE when nobody is available to transfer to right now.",
  "Use END only once the caller is done and has nothing else to ask.",
  "Set urgent=true for anything that sounds like an emergency, a safety issue, or a complaint — regardless of which action you chose.",
  "Never quote a specific price yourself. If asked for a number before you have enough detail, ask the one question you need next.",
].join(" ");

/**
 * Fallback outbound-calling window when a client hasn't set business hours —
 * roughly 7am-8pm US Mountain time. Deliberately conservative: with nothing
 * configured, the safe default is "don't call anyone before breakfast",
 * separate from `businessHours`, which governs whether a human is available
 * to TRANSFER to, not whether it's a reasonable hour to dial out.
 */
export const DEFAULT_OUTBOUND_HOURS: BusinessHours = { startUtcHour: 14, endUtcHour: 3 };

export const MAX_OUTBOUND_ATTEMPTS = 3;
export const OUTBOUND_COOLDOWN_HOURS = 20;
export const OUTBOUND_LOOKBACK_DAYS = 7;

export interface CallbackCandidate {
  id: string;
  createdAt: Date;
  outboundAttempts: number;
  lastOutboundAt?: Date | null;
}

/**
 * Pure: which leads are due an outbound callback right now, oldest first,
 * capped. Never re-dials a lead more than `MAX_OUTBOUND_ATTEMPTS` times, never
 * calls the same lead twice inside the cooldown window, and never reaches back
 * further than `OUTBOUND_LOOKBACK_DAYS` — a lead from three months ago getting
 * a cold call out of nowhere is worse than not calling at all.
 */
export function selectLeadsForCallback<T extends CallbackCandidate>(
  leads: T[],
  now: Date,
  cap = 10,
): T[] {
  return [...leads]
    .filter((l) => l.outboundAttempts < MAX_OUTBOUND_ATTEMPTS)
    .filter((l) => (now.getTime() - l.createdAt.getTime()) / 3_600_000 <= OUTBOUND_LOOKBACK_DAYS * 24)
    .filter(
      (l) =>
        !l.lastOutboundAt ||
        (now.getTime() - l.lastOutboundAt.getTime()) / 3_600_000 >= OUTBOUND_COOLDOWN_HOURS,
    )
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, cap);
}

export interface VoiceSystemPromptInput {
  businessName: string;
  brandVoice?: string | null;
  verticalName?: string | null;
  isOutbound?: boolean;
  leadContext?: string | null;
}

/**
 * The phone desk's system prompt for one tenant, one call. Deliberately
 * separate from `qualifierSystemPrompt` in night-shift.ts — that one writes a
 * scoring memo nobody hears; this one is read aloud in real time and has to
 * stay short enough that TTS doesn't ramble.
 */
export function buildVoiceSystemPrompt(input: VoiceSystemPromptInput): string {
  return [
    `You are the phone receptionist for ${input.businessName}${
      input.verticalName ? `, a ${input.verticalName.toLowerCase()}` : ""
    }. You answer calls 24 hours a day. Be warm, brief, and useful — nobody wants a long speech on the phone.`,
    input.brandVoice ? `Brand voice to honor: ${input.brandVoice}` : "",
    input.isOutbound
      ? `You placed this call to follow up${input.leadContext ? ` on: ${input.leadContext}` : ""}. If they say now is a bad time, apologize briefly and end the call.`
      : "",
    JSON_TURN_INSTRUCTION,
  ]
    .filter(Boolean)
    .join(" ");
}
