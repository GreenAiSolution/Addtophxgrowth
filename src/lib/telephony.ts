/**
 * THE WIRE — turning a telephony provider's webhook into a turn, and a turn
 * back into whatever that provider speaks.
 *
 * DIRECTION
 *   The operator is finished; the thing standing between it and a ringing phone
 *   is a payload shape. Every provider posts a different body and expects a
 *   different reply — Twilio wants XML with specific verbs, the AI-voice
 *   platforms want JSON — and none of that belongs anywhere near the call logic.
 *
 * WHAT IS VERIFIED AND WHAT IS NOT
 *   Twilio's TwiML is a published, stable contract and is implemented in full
 *   here: `<Say>`, `<Gather>`, `<Dial>`, `<Hangup>`, with correct XML escaping.
 *   The AI-voice platforms (Vapi, Retell) change their webhook shapes far more
 *   often, so those adapters map only the fields that are common across their
 *   versions and are marked `verified: false`. Check the mapping against the
 *   provider's current docs before going live — `/app/voice` says so on screen
 *   rather than letting a silent mismatch look like a working integration.
 *
 * Everything here is pure. The route does the auth, the state and the writes.
 */

export type Provider = "twilio" | "vapi" | "retell" | "generic";

export const PROVIDERS: {
  key: Provider;
  label: string;
  /** True when this adapter matches a stable, published contract. */
  verified: boolean;
  /** What to paste into the provider's dashboard. */
  hint: string;
}[] = [
  {
    key: "twilio",
    label: "Twilio (Programmable Voice)",
    verified: true,
    hint: "Set the number's A CALL COMES IN webhook to this URL, method POST. The reply is TwiML.",
  },
  {
    key: "vapi",
    label: "Vapi",
    verified: false,
    hint: "Point the assistant's server URL here. Field mapping should be checked against Vapi's current webhook docs.",
  },
  {
    key: "retell",
    label: "Retell",
    verified: false,
    hint: "Point the agent's webhook here. Field mapping should be checked against Retell's current docs.",
  },
  {
    key: "generic",
    label: "Anything else",
    verified: true,
    hint: "POST JSON: callId, from, to, said, ended. The reply is JSON: say, endCall, transferTo.",
  },
];

export function providerByKey(key: string): (typeof PROVIDERS)[number] | undefined {
  return PROVIDERS.find((p) => p.key === key);
}

/** One turn, in the shape the call logic understands. */
export interface InboundTurn {
  callId: string;
  direction: "INBOUND" | "OUTBOUND";
  from?: string;
  to?: string;
  /** What the caller just said. Empty on the opening turn. */
  said: string;
  /** The provider is telling us the call is over. */
  ended: boolean;
  recordingUrl?: string;
  /** Provider-reported call status, when it gives one. */
  status?: string;
}

export interface OutboundReply {
  say: string;
  endCall: boolean;
  transferTo?: string | null;
  /** Where the provider should post the next turn. Twilio needs it explicitly. */
  continueUrl?: string;
}

/**
 * Which provider posted this.
 *
 * Explicit `?provider=` wins, because a URL in a dashboard is the one thing an
 * owner can be sure of. Detection is the fallback and is deliberately
 * conservative: guessing wrong produces a reply the provider cannot read, which
 * is silence on a live call.
 */
export function detectProvider(
  url: URL,
  contentType: string,
  body: Record<string, unknown>,
): Provider {
  const explicit = url.searchParams.get("provider");
  if (explicit && providerByKey(explicit)) return explicit as Provider;

  // Twilio posts form-encoded with CallSid. Nothing else does both.
  if (contentType.includes("application/x-www-form-urlencoded") || "CallSid" in body) {
    return "twilio";
  }
  if ("message" in body || "assistant" in body) return "vapi";
  if ("call_id" in body || "llm_id" in body) return "retell";
  return "generic";
}

const str = (v: unknown): string | undefined => {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return undefined;
};

/**
 * Normalise a provider's body into a turn.
 *
 * Returns null when the body carries no call id, because a turn with no call
 * id cannot be tied to a conversation and would silently start a new one on
 * every request — a call that resets its memory every sentence.
 */
export function normalize(provider: Provider, body: Record<string, unknown>): InboundTurn | null {
  switch (provider) {
    case "twilio": {
      const callId = str(body.CallSid);
      if (!callId) return null;
      const status = str(body.CallStatus);
      return {
        callId,
        direction: str(body.Direction)?.startsWith("outbound") ? "OUTBOUND" : "INBOUND",
        from: str(body.From),
        to: str(body.To),
        // SpeechResult on a <Gather input="speech">. Absent on the first hit.
        said: str(body.SpeechResult) ?? str(body.Digits) ?? "",
        ended: ["completed", "busy", "failed", "no-answer", "canceled"].includes(status ?? ""),
        recordingUrl: str(body.RecordingUrl),
        status,
      };
    }

    case "vapi": {
      const message = (body.message ?? {}) as Record<string, unknown>;
      const call = (body.call ?? message.call ?? {}) as Record<string, unknown>;
      const callId = str(call.id) ?? str(body.callId);
      if (!callId) return null;
      const type = str(message.type) ?? "";
      const customer = (call.customer ?? {}) as Record<string, unknown>;
      return {
        callId,
        direction: str(call.type)?.includes("outbound") ? "OUTBOUND" : "INBOUND",
        from: str(customer.number) ?? str(body.from),
        to: str(call.phoneNumber) ?? str(body.to),
        said: str(message.transcript) ?? str(body.said) ?? "",
        ended: type === "end-of-call-report" || type === "hang" || body.ended === true,
        recordingUrl: str(message.recordingUrl),
        status: type,
      };
    }

    case "retell": {
      const call = (body.call ?? {}) as Record<string, unknown>;
      const callId = str(body.call_id) ?? str(call.call_id);
      if (!callId) return null;
      const event = str(body.event) ?? str(body.interaction_type) ?? "";
      // Retell posts the whole transcript; the last caller turn is what is new.
      const transcript = Array.isArray(body.transcript) ? body.transcript : [];
      const lastUser = [...transcript]
        .reverse()
        .find((t) => (t as Record<string, unknown>)?.role === "user") as
        | Record<string, unknown>
        | undefined;
      return {
        callId,
        direction: str(call.direction) === "outbound" ? "OUTBOUND" : "INBOUND",
        from: str(call.from_number) ?? str(body.from_number),
        to: str(call.to_number) ?? str(body.to_number),
        said: str(body.said) ?? str(lastUser?.content) ?? "",
        ended: event === "call_ended" || event === "call_analyzed" || body.ended === true,
        recordingUrl: str(call.recording_url),
        status: event,
      };
    }

    default: {
      const callId = str(body.callId) ?? str(body.call_id);
      if (!callId) return null;
      return {
        callId,
        direction: str(body.direction) === "OUTBOUND" ? "OUTBOUND" : "INBOUND",
        from: str(body.from),
        to: str(body.to),
        said: str(body.said) ?? "",
        ended: body.ended === true,
        recordingUrl: str(body.recordingUrl),
        status: str(body.status),
      };
    }
  }
}

/**
 * XML escaping.
 *
 * Not a nicety. A caller named "Ben & Sons Roofing" read back inside a `<Say>`
 * produces malformed TwiML, and Twilio's response to malformed TwiML is to play
 * an error message at the customer and hang up. Every value interpolated below
 * goes through this.
 */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface FormattedReply {
  body: string;
  contentType: string;
}

/**
 * Turn a reply into what the provider expects to read.
 *
 * The Twilio branch is the interesting one, and the ordering inside it is the
 * call: speak first, then act. A `<Dial>` before the `<Say>` transfers the
 * caller before they are told what is happening, which is how a warm handover
 * becomes a cold one.
 */
export function formatReply(provider: Provider, reply: OutboundReply): FormattedReply {
  if (provider !== "twilio") {
    return {
      body: JSON.stringify({
        say: reply.say,
        endCall: reply.endCall,
        transferTo: reply.transferTo ?? null,
      }),
      contentType: "application/json",
    };
  }

  const parts: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', "<Response>"];
  if (reply.say) parts.push(`<Say>${escapeXml(reply.say)}</Say>`);

  if (reply.transferTo) {
    parts.push(`<Dial>${escapeXml(reply.transferTo)}</Dial>`);
  } else if (reply.endCall) {
    parts.push("<Hangup/>");
  } else {
    // Hand the microphone back. `speechTimeout="auto"` lets Twilio decide when
    // the caller has stopped talking, which is far better than a fixed number
    // on a line where people pause to think.
    const action = reply.continueUrl ? ` action="${escapeXml(reply.continueUrl)}"` : "";
    parts.push(
      `<Gather input="speech"${action} method="POST" speechTimeout="auto" actionOnEmptyResult="true"/>`,
    );
  }

  parts.push("</Response>");
  return { body: parts.join(""), contentType: "text/xml" };
}

/**
 * Read a request body without caring how it was encoded.
 *
 * Twilio posts form-encoded, everything else posts JSON, and a route that
 * assumes one of those breaks the other with a 400 that a provider will retry
 * forever.
 */
export async function readBody(req: Request): Promise<Record<string, unknown>> {
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await req.text();
      return Object.fromEntries(new URLSearchParams(text));
    }
    const json = await req.json();
    return typeof json === "object" && json !== null ? (json as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
