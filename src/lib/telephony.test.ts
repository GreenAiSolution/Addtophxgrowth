import { describe, expect, it } from "vitest";
import {
  PROVIDERS,
  detectProvider,
  escapeXml,
  formatReply,
  normalize,
  providerByKey,
} from "@/lib/telephony";
import { isStopReply, smsChannel, textBackMessage } from "@/lib/sms";

/**
 * The wire is where an integration fails silently. A malformed reply does not
 * throw — Twilio reads its own error message at the customer and hangs up, and
 * the log says the request was a 200. So these tests are about the shape of
 * what goes back out.
 */

const url = (q = "") => new URL(`https://example.com/api/voice/c1/turn${q}`);

describe("working out who is calling us", () => {
  it("believes the URL over anything it can sniff", () => {
    // A URL pasted into a provider's dashboard is the one thing an owner can be
    // certain of. Guessing wrong is silence on a live call.
    expect(detectProvider(url("?provider=vapi"), "application/json", { CallSid: "CA1" })).toBe("vapi");
  });

  it("ignores a provider name it does not have an adapter for", () => {
    expect(detectProvider(url("?provider=nonsense"), "application/json", {})).toBe("generic");
  });

  it("recognises Twilio by its content type or its call id", () => {
    expect(detectProvider(url(), "application/x-www-form-urlencoded", {})).toBe("twilio");
    expect(detectProvider(url(), "application/json", { CallSid: "CA1" })).toBe("twilio");
  });

  it("falls back to generic rather than guessing", () => {
    expect(detectProvider(url(), "application/json", { hello: "world" })).toBe("generic");
  });
});

describe("reading a turn off the wire", () => {
  it("reads a Twilio speech result", () => {
    const t = normalize("twilio", {
      CallSid: "CA123",
      From: "+16025550134",
      To: "+16025550100",
      Direction: "inbound",
      SpeechResult: "my tap is leaking",
      CallStatus: "in-progress",
    });
    expect(t).toMatchObject({
      callId: "CA123",
      direction: "INBOUND",
      said: "my tap is leaking",
      ended: false,
    });
  });

  it("treats the opening hit, with no speech yet, as an empty turn", () => {
    // Twilio's first POST has no SpeechResult. That is the greeting, not an error.
    const t = normalize("twilio", { CallSid: "CA1", CallStatus: "ringing" });
    expect(t?.said).toBe("");
    expect(t?.ended).toBe(false);
  });

  it("knows which Twilio statuses mean the call is over", () => {
    for (const status of ["completed", "no-answer", "busy", "failed", "canceled"]) {
      expect(normalize("twilio", { CallSid: "CA1", CallStatus: status })?.ended, status).toBe(true);
    }
    expect(normalize("twilio", { CallSid: "CA1", CallStatus: "in-progress" })?.ended).toBe(false);
  });

  it("reads an outbound Twilio call as outbound", () => {
    expect(normalize("twilio", { CallSid: "CA1", Direction: "outbound-api" })?.direction).toBe(
      "OUTBOUND",
    );
  });

  it("refuses a payload with no call id", () => {
    // A turn with no call id would start a fresh conversation every sentence.
    expect(normalize("twilio", { SpeechResult: "hello" })).toBeNull();
    expect(normalize("generic", { said: "hello" })).toBeNull();
    expect(normalize("vapi", { message: { transcript: "hi" } })).toBeNull();
  });

  it("reads the generic shape", () => {
    const t = normalize("generic", {
      callId: "abc",
      from: "+1602",
      said: "hello",
      ended: false,
    });
    expect(t).toMatchObject({ callId: "abc", said: "hello", direction: "INBOUND" });
  });

  it("reads what it can from Vapi and Retell", () => {
    const vapi = normalize("vapi", {
      call: { id: "v1", customer: { number: "+1602" } },
      message: { type: "transcript", transcript: "hello there" },
    });
    expect(vapi).toMatchObject({ callId: "v1", said: "hello there", ended: false });
    expect(normalize("vapi", { call: { id: "v1" }, message: { type: "end-of-call-report" } })?.ended).toBe(true);

    const retell = normalize("retell", {
      call_id: "r1",
      transcript: [
        { role: "agent", content: "how can I help" },
        { role: "user", content: "my roof is leaking" },
      ],
    });
    expect(retell).toMatchObject({ callId: "r1", said: "my roof is leaking" });
  });

  it("is honest about which adapters are verified", () => {
    // Twilio's TwiML is a published, stable contract. The AI-voice platforms
    // move their webhook shapes, and the screen says so rather than letting a
    // mismatch look like a working integration.
    expect(providerByKey("twilio")?.verified).toBe(true);
    expect(providerByKey("generic")?.verified).toBe(true);
    expect(providerByKey("vapi")?.verified).toBe(false);
    expect(PROVIDERS.every((p) => p.hint.length > 20)).toBe(true);
  });
});

describe("what goes back down the wire", () => {
  it("escapes everything that would break TwiML", () => {
    // A caller from "Ben & Sons Roofing" read back inside a <Say> produces
    // malformed XML, and Twilio's answer to malformed XML is an error message
    // played at the customer.
    const out = formatReply("twilio", {
      say: 'Thanks Ben & Sons <Roofing> — "confirmed"',
      endCall: false,
    });
    expect(out.body).toContain("Ben &amp; Sons &lt;Roofing&gt;");
    expect(out.body).not.toMatch(/<Roofing>/);
    expect(out.contentType).toBe("text/xml");
  });

  it("hands the microphone back when the call continues", () => {
    const out = formatReply("twilio", {
      say: "Can I take your name?",
      endCall: false,
      continueUrl: "https://example.com/api/voice/c1/turn?token=abc",
    });
    expect(out.body).toContain("<Gather");
    expect(out.body).toContain('input="speech"');
    expect(out.body).toContain("action=");
    expect(out.body).not.toContain("<Hangup");
  });

  it("speaks before it transfers, never after", () => {
    // A <Dial> ahead of the <Say> moves the caller before they are told what is
    // happening, which turns a warm handover into a cold one.
    const out = formatReply("twilio", {
      say: "Putting you through now.",
      endCall: false,
      transferTo: "+16025550100",
    });
    expect(out.body.indexOf("<Say>")).toBeLessThan(out.body.indexOf("<Dial>"));
    expect(out.body).not.toContain("<Gather");
  });

  it("hangs up when the call is done", () => {
    const out = formatReply("twilio", { say: "Thanks, bye.", endCall: true });
    expect(out.body).toContain("<Hangup/>");
    expect(out.body).not.toContain("<Gather");
  });

  it("always returns a parseable document, even with nothing to say", () => {
    const out = formatReply("twilio", { say: "", endCall: true });
    expect(out.body).toContain("<Response>");
    expect(out.body).toContain("</Response>");
  });

  it("answers JSON to everybody else", () => {
    const out = formatReply("generic", { say: "hello", endCall: false, transferTo: null });
    expect(out.contentType).toBe("application/json");
    expect(JSON.parse(out.body)).toEqual({ say: "hello", endCall: false, transferTo: null });
  });

  it("escapes the five characters XML actually cares about", () => {
    expect(escapeXml(`& < > " '`)).toBe("&amp; &lt; &gt; &quot; &apos;");
  });
});

describe("the missed-call text-back", () => {
  it("names the business in the first four words", () => {
    // An unknown number that opens with "Hi!" gets deleted.
    const msg = textBackMessage({ businessName: "Palm Plumbing" });
    expect(msg.split(/\s+/).slice(0, 4).join(" ")).toContain("Palm Plumbing");
  });

  it("says why they are getting a text and asks one answerable question", () => {
    const msg = textBackMessage({ businessName: "Palm Plumbing", callerName: "Dana Reyes" });
    expect(msg).toMatch(/missed your call/);
    expect(msg).toContain("Dana");
    expect(msg).not.toContain("Reyes"); // first name only — a text is not a letter
    expect(msg).toMatch(/Reply/);
  });

  it("carries the opt-out on every message", () => {
    expect(textBackMessage({ businessName: "X" })).toMatch(/STOP/);
  });

  it("mentions the job when the operator got far enough to know it", () => {
    expect(
      textBackMessage({ businessName: "X", aboutJob: "Blocked kitchen drain" }),
    ).toContain("blocked kitchen drain");
  });

  it("stays inside one message segment for a typical name", () => {
    // Two segments cost twice as much and can arrive out of order.
    expect(textBackMessage({ businessName: "Palm Plumbing", callerName: "Dana" }).length)
      .toBeLessThan(320);
  });
});

describe("honouring STOP", () => {
  it("recognises the words people actually send", () => {
    for (const word of ["STOP", "stop", " Stop ", "unsubscribe", "CANCEL", "quit", "remove me"]) {
      expect(isStopReply(word), word).toBe(true);
    }
  });

  it("does not read a sentence containing the word stop as an opt-out", () => {
    // "Can you stop by tomorrow?" is a booking, not an unsubscribe.
    expect(isStopReply("can you stop by tomorrow?")).toBe(false);
    expect(isStopReply("stop by at 4 please")).toBe(false);
  });

  it("reports honestly when there is no way to send a text at all", () => {
    const channel = smsChannel();
    expect(typeof channel.live).toBe("boolean");
    if (!channel.live) expect(channel.hint).toMatch(/TWILIO_ACCOUNT_SID/);
  });
});
