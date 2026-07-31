import { describe, expect, it } from "vitest";
import {
  CALL_PLAN,
  TEXT_BACK_WINDOW_MINUTES,
  classifyOutcome,
  formatNumber,
  greeting,
  isQualified,
  missing,
  nextStep,
  normaliseNumber,
  outcomeFromProviderStatus,
  sameNumber,
  shouldTextBack,
  signWebhook,
  textBackMessage,
  verifyWebhook,
  wasUnanswered,
  type CallFacts,
  type TextBackCall,
} from "@/lib/telephony";

const AT = new Date("2026-07-31T14:00:00Z");
const call = (over: Partial<TextBackCall> = {}): TextBackCall => ({
  direction: "INBOUND",
  outcome: "MISSED",
  fromNumber: "+16025550101",
  toNumber: "+16025559999",
  startedAt: new Date(AT.getTime() - 60_000),
  textBackSentAt: null,
  ...over,
});

describe("the plan decides what must be established", () => {
  it("asks for the callback number before anything optional", () => {
    // The ordering property worth pinning: a call that drops after question two
    // is still recoverable, and one that drops before it is not.
    const number = CALL_PLAN.findIndex((s) => s.field === "callbackNumber");
    const firstOptional = CALL_PLAN.findIndex((s) => !s.required);
    expect(number).toBeLessThan(firstOptional);
    expect(CALL_PLAN[number].required).toBe(true);
  });

  it("walks the plan one fact at a time", () => {
    const facts: CallFacts = {};
    expect(nextStep(facts)?.field).toBe("name");
    facts.name = "Marcy Bell";
    expect(nextStep(facts)?.field).toBe("callbackNumber");
    facts.callbackNumber = "602 555 0101";
    expect(nextStep(facts)?.field).toBe("job");
  });

  it("returns nothing left to ask once every fact is in", () => {
    const full: CallFacts = {
      name: "Marcy",
      callbackNumber: "6025550101",
      job: "Storm damage",
      address: "12 Palm",
      urgency: "Today",
    };
    expect(nextStep(full)).toBeNull();
    expect(missing(full)).toEqual([]);
  });

  it("treats whitespace as absent", () => {
    // A provider handing back "  " for an unanswered prompt must not count as
    // an answered question, or the call ends qualified on nothing.
    expect(nextStep({ name: "   " })?.field).toBe("name");
    expect(isQualified({ name: " ", callbackNumber: " ", job: " " })).toBe(false);
  });

  it("qualifies on the required facts and never demands the rest", () => {
    // A caller who will not give an address still deserves a callback. A bar
    // that wanted every field would throw away good leads for a tidier record.
    const enough: CallFacts = { name: "Marcy", callbackNumber: "6025550101", job: "Leak" };
    expect(isQualified(enough)).toBe(true);
    expect(missing(enough).every((s) => !s.required)).toBe(true);
  });

  it("lists what is outstanding with the required ones first", () => {
    const out = missing({ name: "Marcy" });
    const firstOptional = out.findIndex((s) => !s.required);
    expect(out.slice(0, firstOptional).every((s) => s.required)).toBe(true);
  });

  it("gives every step something speakable and a reason", () => {
    // The fallback path says these verbatim when the model is down, so a step
    // with no `ask` is a silent question.
    for (const s of CALL_PLAN) {
      expect(s.ask.length, s.field).toBeGreaterThan(10);
      expect(s.ask.trim().endsWith("?"), `${s.field} is not a question`).toBe(true);
      expect(s.why.length, s.field).toBeGreaterThan(10);
    }
  });
});

describe("what happened, as one word", () => {
  const facts: CallFacts = { name: "Marcy", callbackNumber: "6025550101", job: "Leak" };

  it("never files a call we broke as one we handled", () => {
    expect(classifyOutcome({ answered: true, facts, failed: true, booked: true })).toBe("FAILED");
  });

  it("counts an unanswered call as missed even when caller id arrived", () => {
    // Whose experience is being recorded matters: the person on the other end
    // heard no answer, and that is the number the scoreboard counts.
    expect(classifyOutcome({ answered: false, facts })).toBe("MISSED");
    expect(classifyOutcome({ answered: false, facts, voicemail: true })).toBe("VOICEMAIL");
  });

  it("ranks the diary above the quote", () => {
    expect(classifyOutcome({ answered: true, facts, booked: true, wantsEstimate: true })).toBe(
      "BOOKED",
    );
    expect(classifyOutcome({ answered: true, facts, wantsEstimate: true })).toBe(
      "ESTIMATE_REQUESTED",
    );
  });

  it("puts a human hand-off above everything it could have done itself", () => {
    expect(
      classifyOutcome({ answered: true, facts, transferred: true, booked: true }),
    ).toBe("TRANSFERRED");
  });

  it("falls back to a message when too little was established", () => {
    expect(classifyOutcome({ answered: true, facts: { name: "Marcy" } })).toBe("MESSAGE");
    expect(classifyOutcome({ answered: true, facts })).toBe("QUALIFIED");
  });

  it("knows which outcomes mean nobody reached anybody", () => {
    expect(wasUnanswered("MISSED")).toBe(true);
    expect(wasUnanswered("VOICEMAIL")).toBe(true);
    expect(wasUnanswered("QUALIFIED")).toBe(false);
  });
});

describe("the recovery text", () => {
  it("sends on a fresh missed inbound call", () => {
    expect(shouldTextBack(call(), AT)).toEqual({ send: true });
  });

  it("never texts twice, however often the webhook retries", () => {
    // Providers retry status callbacks. Without this the customer gets the same
    // apology three times.
    const v = shouldTextBack(call({ textBackSentAt: new Date() }), AT);
    expect(v).toEqual({ send: false, why: "already sent" });
  });

  it("goes quiet once the call is stale", () => {
    const old = call({ startedAt: new Date(AT.getTime() - 60 * 60_000) });
    const v = shouldTextBack(old, AT);
    expect(v.send).toBe(false);
    expect(v.send === false && v.why).toMatch(/minutes old/);
  });

  it("sends right up to the edge of the window and not past it", () => {
    const inside = call({
      startedAt: new Date(AT.getTime() - (TEXT_BACK_WINDOW_MINUTES - 0.5) * 60_000),
    });
    const outside = call({
      startedAt: new Date(AT.getTime() - (TEXT_BACK_WINDOW_MINUTES + 0.5) * 60_000),
    });
    expect(shouldTextBack(inside, AT).send).toBe(true);
    expect(shouldTextBack(outside, AT).send).toBe(false);
  });

  it("refuses to act on a clock skewed into the future", () => {
    const v = shouldTextBack(call({ startedAt: new Date(AT.getTime() + 60_000) }), AT);
    expect(v.send).toBe(false);
    expect(v.send === false && v.why).toMatch(/future/);
  });

  it("does not apologise for a call we placed", () => {
    expect(shouldTextBack(call({ direction: "OUTBOUND" }), AT).send).toBe(false);
  });

  it("does not text somebody whose call was answered", () => {
    expect(shouldTextBack(call({ outcome: "QUALIFIED" }), AT).send).toBe(false);
    expect(shouldTextBack(call({ outcome: "BOOKED" }), AT).send).toBe(false);
  });

  it("cannot text a withheld number", () => {
    expect(shouldTextBack(call({ fromNumber: "anonymous" }), AT).send).toBe(false);
  });

  it("never texts the business its own number", () => {
    // A forwarded or looped line calling itself would otherwise text the owner
    // an apology for missing themselves.
    const v = shouldTextBack(call({ fromNumber: "(602) 555-9999" }), AT);
    expect(v.send).toBe(false);
    expect(v.send === false && v.why).toMatch(/own number/);
  });

  it("explains every refusal", () => {
    // "No text was sent" is a thing a client rings up about. A shrug is not an
    // answer, so every branch carries a reason.
    for (const c of [
      call({ direction: "OUTBOUND" }),
      call({ outcome: "QUALIFIED" }),
      call({ textBackSentAt: new Date() }),
      call({ fromNumber: "unknown" }),
    ]) {
      const v = shouldTextBack(c, AT);
      expect(v.send).toBe(false);
      expect(v.send === false && v.why.length).toBeGreaterThan(5);
    }
  });
});

describe("numbers", () => {
  it("normalises the shapes a form and a carrier actually produce", () => {
    for (const raw of ["6025550101", "(602) 555-0101", "602-555-0101", "+1 602 555 0101", "16025550101"]) {
      expect(normaliseNumber(raw), raw).toBe("+16025550101");
    }
  });

  it("refuses rather than guessing", () => {
    // A mangled number is worse than none: it looks like a number and texts a
    // stranger.
    for (const raw of ["", "   ", "12345", "abc", null, undefined, "anonymous", "Private"]) {
      expect(normaliseNumber(raw as string), String(raw)).toBeNull();
    }
  });

  it("leaves an international number alone rather than forcing +1 onto it", () => {
    expect(normaliseNumber("+442071838750")).toBe("+442071838750");
  });

  it("compares on the normalised form, so formatting cannot lie", () => {
    expect(sameNumber("(602) 555-0101", "+16025550101")).toBe(true);
    expect(sameNumber("6025550101", "6025550102")).toBe(false);
    expect(sameNumber(null, null)).toBe(false);
    expect(sameNumber("anonymous", "anonymous")).toBe(false);
  });

  it("shows a withheld number as withheld rather than blank", () => {
    expect(formatNumber("6025550101")).toBe("(602) 555-0101");
    expect(formatNumber(null)).toBe("withheld");
  });
});

describe("the provider boundary", () => {
  it("maps the statuses that mean nobody was reached", () => {
    // The list a future carrier adapter has to get right for the missed-call
    // promise to hold.
    for (const s of ["no-answer", "busy", "failed", "canceled", "cancelled", "NO-ANSWER"]) {
      expect(outcomeFromProviderStatus(s), s).toBe("MISSED");
    }
    expect(outcomeFromProviderStatus("in-progress")).toBe("IN_PROGRESS");
    expect(outcomeFromProviderStatus("completed")).toBeNull();
    expect(outcomeFromProviderStatus(undefined)).toBeNull();
  });

  it("verifies a signature it produced", () => {
    const params = { From: "+16025550101", To: "+16025559999", CallSid: "CA123" };
    const url = "https://example.com/api/voice/abc";
    const sig = signWebhook("tok", url, params);
    expect(verifyWebhook("tok", url, params, sig)).toBe(true);
  });

  it("is order-independent across params but not across values", () => {
    const url = "https://example.com/api/voice/abc";
    const a = signWebhook("tok", url, { B: "2", A: "1" });
    const b = signWebhook("tok", url, { A: "1", B: "2" });
    expect(a).toBe(b);
    expect(signWebhook("tok", url, { A: "1", B: "3" })).not.toBe(a);
  });

  it("rejects a wrong token, a wrong url, a tampered param and a missing signature", () => {
    const params = { From: "+16025550101" };
    const url = "https://example.com/api/voice/abc";
    const sig = signWebhook("tok", url, params);
    expect(verifyWebhook("wrong", url, params, sig)).toBe(false);
    expect(verifyWebhook("tok", "https://example.com/api/voice/other", params, sig)).toBe(false);
    expect(verifyWebhook("tok", url, { From: "+16025550102" }, sig)).toBe(false);
    expect(verifyWebhook("tok", url, params, null)).toBe(false);
    expect(verifyWebhook("", url, params, sig)).toBe(false);
  });
});

describe("what the caller hears", () => {
  it("always has something to say", () => {
    // The failure mode of a missing greeting is a caller hearing silence, which
    // is the entire defect this product exists to fix.
    expect(greeting({ businessName: "Bell Roofing" })).toContain("Bell Roofing");
    expect(greeting({ businessName: "Bell Roofing", custom: null }).length).toBeGreaterThan(20);
    expect(greeting({ businessName: "Bell Roofing", custom: "  " }).length).toBeGreaterThan(20);
  });

  it("prefers the client's own words", () => {
    expect(greeting({ businessName: "Bell", custom: "Bell here, what's up?" })).toBe(
      "Bell here, what's up?",
    );
    expect(textBackMessage({ businessName: "Bell", custom: "Missed you — Bell" })).toBe(
      "Missed you — Bell",
    );
  });

  it("invites a reply in the recovery text", () => {
    const msg = textBackMessage({ businessName: "Bell Roofing" });
    expect(msg).toContain("Bell Roofing");
    expect(msg.toLowerCase()).toMatch(/reply|ring you/);
  });
});
