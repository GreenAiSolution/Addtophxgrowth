import { describe, expect, it } from "vitest";
import { redact, describeRedactions } from "./redact";
import {
  CALLBACK_WINDOW_MINUTES,
  PROMISE_WINDOW_HOURS,
  QUOTE_FOLLOWUP_HOURS,
  answerStats,
  findLeaks,
  leakValue,
  talkStats,
  type ConversationRecord,
} from "./analyze";
import {
  CALL_OUTCOMES,
  OBJECTIONS,
  extractorInstruction,
  isConsentBasis,
  objectionToMemoryText,
  sanitizeExtraction,
} from "./taxonomy";

/**
 * Three things are being protected here.
 *
 *   The redactor, because its failure mode is a card number sitting in a
 *   search index forever, and because an over-eager pattern that eats ordinary
 *   words destroys the transcript instead.
 *
 *   The leak rules, because they are the output an owner will act on before
 *   coffee, and a list that inflates one lost customer into three tasks is a
 *   list people stop working.
 *
 *   The vocabulary boundary, because an extraction is a model's output and
 *   everything downstream counts it.
 */

const NOW = new Date("2026-08-03T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

const rec = (over: Partial<ConversationRecord> & Pick<ConversationRecord, "id">): ConversationRecord => ({
  contactKey: "+14805550134",
  direction: "INBOUND",
  channel: "CALL",
  startedAt: hoursAgo(4),
  outcome: "NO_ANSWER",
  quotedCents: null,
  nextStepAgreed: false,
  ...over,
});

describe("redact", () => {
  it("removes a card number read aloud", () => {
    const { text, redactions } = redact("He gave me 4111 1111 1111 1111 over the phone.");
    expect(text).toContain("[card removed]");
    expect(text).not.toMatch(/4111/);
    expect(redactions.find((r) => r.kind === "CARD")?.count).toBe(1);
  });

  it("removes emails, phone numbers and street addresses", () => {
    const { text } = redact(
      "Email marcy@example.com or call 480-555-0134. We're at 1420 East Baseline Road.",
    );
    expect(text).not.toContain("marcy@example.com");
    expect(text).not.toContain("480-555-0134");
    expect(text).not.toContain("1420 East Baseline Road");
  });

  it("does NOT eat the word 'claim' in a storm-damage call", () => {
    // The exact false positive that made the first version of the account rule
    // unusable in this trade — "claim" is in almost every roofing transcript.
    const { text } = redact("The insurance claim is being processed this week.");
    expect(text).toBe("The insurance claim is being processed this week.");
  });

  it("still removes a labelled account reference that has digits", () => {
    const { text } = redact("Policy number AZ4471X is on the paperwork.");
    expect(text).toContain("[account removed]");
    expect(text).not.toContain("AZ4471X");
  });

  it("leaves ordinary numbers alone", () => {
    const original = "It's a 14 year old roof, about 2400 square feet, 3 dogs in the yard.";
    expect(redact(original).text).toBe(original);
  });

  it("keeps names, and says so rather than implying otherwise", () => {
    // Names have no shape. A redactor confident enough to strip them would
    // either destroy transcripts or miss most of them, and pretending
    // otherwise is the dangerous option.
    const { text, redactions } = redact("Marcy Bell said the roof was leaking.");
    expect(text).toContain("Marcy Bell");
    expect(describeRedactions(redactions)).toContain("Nothing sensitive");
    expect(describeRedactions([{ kind: "CARD", count: 1 }])).toContain("Names are kept");
  });

  it("is idempotent — redacting twice changes nothing further", () => {
    const once = redact("Card 4111 1111 1111 1111, email a@b.com, call 480-555-0134.");
    const twice = redact(once.text);
    expect(twice.text).toBe(once.text);
  });
});

describe("findLeaks", () => {
  it("reports a missed inbound call nobody returned", () => {
    const leaks = findLeaks([rec({ id: "c1", startedAt: hoursAgo(4) })], NOW);
    expect(leaks).toHaveLength(1);
    expect(leaks[0].kind).toBe("MISSED_NO_CALLBACK");
    expect(leaks[0].severity).toBe("CRITICAL");
    expect(leaks[0].valueCents).toBeNull();
  });

  it("says nothing while the callback window is still open", () => {
    const fresh = new Date(NOW.getTime() - (CALLBACK_WINDOW_MINUTES - 10) * 60_000);
    expect(findLeaks([rec({ id: "c1", startedAt: fresh })], NOW)).toEqual([]);
  });

  it("goes quiet once somebody actually rang back", () => {
    const leaks = findLeaks(
      [
        rec({ id: "c1", startedAt: hoursAgo(5) }),
        rec({ id: "c2", startedAt: hoursAgo(4), direction: "OUTBOUND", outcome: "BOOKED" }),
      ],
      NOW,
    );
    expect(leaks).toEqual([]);
  });

  it("escalates somebody who has rung repeatedly and never got through", () => {
    // Actively trying to give this business money.
    const leaks = findLeaks(
      [
        rec({ id: "c1", startedAt: hoursAgo(30) }),
        rec({ id: "c2", startedAt: hoursAgo(20) }),
        rec({ id: "c3", startedAt: hoursAgo(6) }),
      ],
      NOW,
    );
    expect(leaks).toHaveLength(1);
    expect(leaks[0].kind).toBe("REPEAT_MISSED");
    expect(leaks[0].detail).toContain("3 times");
  });

  it("reports a promised callback that never happened", () => {
    const leaks = findLeaks(
      [
        rec({
          id: "c1",
          startedAt: hoursAgo(PROMISE_WINDOW_HOURS + 5),
          outcome: "CALLBACK_PROMISED",
        }),
      ],
      NOW,
    );
    expect(leaks[0].kind).toBe("PROMISE_BROKEN");
  });

  it("reports a cold quote and carries the figure that was actually said", () => {
    const leaks = findLeaks(
      [
        rec({
          id: "c1",
          startedAt: hoursAgo(QUOTE_FOLLOWUP_HOURS + 24),
          outcome: "QUOTED",
          quotedCents: 1_420_000,
        }),
      ],
      NOW,
    );
    expect(leaks[0].kind).toBe("QUOTE_COLD");
    expect(leaks[0].severity).toBe("WARNING");
    expect(leaks[0].valueCents).toBe(1_420_000);
  });

  it("never invents a value for a leak nobody priced", () => {
    // The temptation is to multiply a missed call by an average job value and
    // print a big number. `leak.ts` refuses to do that on the marketing side
    // and this refuses on the operations side.
    const leaks = findLeaks(
      [
        rec({ id: "c1", startedAt: hoursAgo(6) }),
        rec({ id: "c2", contactKey: "+14805550999", startedAt: hoursAgo(8) }),
      ],
      NOW,
    );
    for (const l of leaks) expect(l.valueCents).toBeNull();
  });

  it("produces at most one leak per customer", () => {
    // One lost customer must not become three tasks.
    const leaks = findLeaks(
      [
        rec({ id: "c1", startedAt: hoursAgo(200) }),
        rec({ id: "c2", startedAt: hoursAgo(150), outcome: "CALLBACK_PROMISED" }),
        rec({ id: "c3", startedAt: hoursAgo(100), outcome: "QUOTED", quotedCents: 900_000 }),
      ],
      NOW,
    );
    expect(leaks).toHaveLength(1);
    expect(leaks[0].kind).toBe("QUOTE_COLD");
  });

  it("puts critical above warning, then oldest first", () => {
    const leaks = findLeaks(
      [
        rec({ id: "q", contactKey: "a", startedAt: hoursAgo(300), outcome: "QUOTED" }),
        rec({ id: "m1", contactKey: "b", startedAt: hoursAgo(5) }),
        rec({ id: "m2", contactKey: "c", startedAt: hoursAgo(50) }),
      ],
      NOW,
    );
    expect(leaks.map((l) => l.conversationId)).toEqual(["m2", "m1", "q"]);
  });

  it("is empty on an empty book rather than throwing", () => {
    expect(findLeaks([], NOW)).toEqual([]);
  });

  it("does not report a closed conversation as a leak", () => {
    const settled: ConversationRecord[] = [
      rec({ id: "c1", startedAt: hoursAgo(500), outcome: "BOOKED" }),
      rec({ id: "c2", contactKey: "b", startedAt: hoursAgo(500), outcome: "NOT_INTERESTED" }),
      rec({ id: "c3", contactKey: "c", startedAt: hoursAgo(500), outcome: "WRONG_FIT" }),
    ];
    expect(findLeaks(settled, NOW)).toEqual([]);
  });
});

describe("leakValue", () => {
  it("sums only what was quoted and counts the rest separately", () => {
    // So the sentence reads "$14,200 across 3 quotes, plus 9 we cannot price"
    // rather than one total pretending the unpriced ones are worth nothing.
    const leaks = findLeaks(
      [
        rec({ id: "a", contactKey: "a", startedAt: hoursAgo(200), outcome: "QUOTED", quotedCents: 1_420_000 }),
        rec({ id: "b", contactKey: "b", startedAt: hoursAgo(6) }),
        rec({ id: "c", contactKey: "c", startedAt: hoursAgo(6) }),
      ],
      NOW,
    );
    const { knownCents, unpriced } = leakValue(leaks);
    expect(knownCents).toBe(1_420_000);
    expect(unpriced).toBe(2);
  });
});

describe("answerStats", () => {
  it("measures how often the phone actually gets picked up", () => {
    const stats = answerStats(
      [
        rec({ id: "1", contactKey: "a", outcome: "BOOKED" }),
        rec({ id: "2", contactKey: "b", outcome: "QUOTED" }),
        rec({ id: "3", contactKey: "c", outcome: "NO_ANSWER" }),
        rec({ id: "4", contactKey: "d", outcome: "NO_ANSWER" }),
      ],
      NOW,
    );
    expect(stats.inbound).toBe(4);
    expect(stats.answered).toBe(2);
    expect(stats.rate).toBe(0.5);
    expect(stats.unreturned).toBe(2);
  });

  it("returns null rather than zero when there is nothing to measure", () => {
    // A brand new account has not failed to answer anything.
    expect(answerStats([], NOW).rate).toBeNull();
  });

  it("ignores outbound calls when measuring the answer rate", () => {
    const stats = answerStats(
      [
        rec({ id: "1", contactKey: "a", outcome: "BOOKED" }),
        rec({ id: "2", contactKey: "b", direction: "OUTBOUND", outcome: "NO_ANSWER" }),
      ],
      NOW,
    );
    expect(stats.inbound).toBe(1);
    expect(stats.rate).toBe(1);
  });
});

describe("talkStats", () => {
  it("measures who did the talking", () => {
    const s = talkStats([
      { speaker: "BUSINESS", text: "What seems to be the problem?" },
      { speaker: "CUSTOMER", text: "Water is coming through the ceiling in the hallway" },
    ]);
    expect(s.turns).toBe(2);
    expect(s.questionsAsked).toBe(1);
    expect(s.businessShare).toBeLessThan(0.5);
  });

  it("returns null share for an empty transcript", () => {
    expect(talkStats([]).businessShare).toBeNull();
  });
});

describe("the extraction boundary", () => {
  it("keeps a well-formed extraction intact", () => {
    const { extraction, problems } = sanitizeExtraction({
      outcome: "QUOTED",
      objections: [{ key: "price", verbatim: "that's more than I was expecting" }],
      quotedCents: 1_420_000,
      nextStepAgreed: true,
      summary: "Quoted a full replacement; they want to think about it.",
    });
    expect(problems).toEqual([]);
    expect(extraction.outcome).toBe("QUOTED");
    expect(extraction.objections[0].key).toBe("price");
    expect(extraction.quotedCents).toBe(1_420_000);
  });

  it("falls back to UNCLEAR rather than dropping an invented outcome", () => {
    // The conversation definitely had an outcome. A missing field would fall
    // out of every count; UNCLEAR stays visible.
    const { extraction, problems } = sanitizeExtraction({ outcome: "VIBES_GOOD" });
    expect(extraction.outcome).toBe("UNCLEAR");
    expect(problems[0].field).toBe("outcome");
  });

  it("drops an invented objection instead of counting it", () => {
    const { extraction, problems } = sanitizeExtraction({
      outcome: "NOT_INTERESTED",
      objections: [{ key: "price" }, { key: "mercury_retrograde" }],
    });
    expect(extraction.objections.map((o) => o.key)).toEqual(["price"]);
    expect(problems).toHaveLength(1);
  });

  it("deduplicates an objection raised three times in one call", () => {
    // A talkative customer must not read as a trend.
    const { extraction } = sanitizeExtraction({
      outcome: "NOT_INTERESTED",
      objections: [{ key: "price" }, { key: "price" }, { key: "price" }],
    });
    expect(extraction.objections).toHaveLength(1);
  });

  it("treats a zero quote as no quote", () => {
    // Zero is a real price in no trade this business serves.
    expect(sanitizeExtraction({ outcome: "QUOTED", quotedCents: 0 }).extraction.quotedCents).toBeNull();
    expect(sanitizeExtraction({ outcome: "QUOTED", quotedCents: -50 }).extraction.quotedCents).toBeNull();
  });

  it("never guesses nextStepAgreed from a truthy value", () => {
    expect(sanitizeExtraction({ outcome: "BOOKED", nextStepAgreed: "yes" }).extraction.nextStepAgreed).toBe(false);
    expect(sanitizeExtraction({ outcome: "BOOKED", nextStepAgreed: true }).extraction.nextStepAgreed).toBe(true);
  });

  it("survives an empty object", () => {
    const { extraction } = sanitizeExtraction({});
    expect(extraction.outcome).toBe("UNCLEAR");
    expect(extraction.objections).toEqual([]);
  });
});

describe("the extractor instruction", () => {
  const text = extractorInstruction();

  it("offers exactly the values the sanitizer accepts", () => {
    for (const o of CALL_OUTCOMES) expect(text).toContain(`${o.key}:`);
    for (const o of OBJECTIONS) expect(text).toContain(`${o.key}:`);
  });

  it("forbids inferring a price that was never said", () => {
    expect(text).toContain("do not guess a price that was never said");
  });
});

describe("consent", () => {
  it("accepts only the recorded bases", () => {
    expect(isConsentBasis("TWO_PARTY_ANNOUNCED")).toBe(true);
    expect(isConsentBasis("they probably knew")).toBe(false);
    expect(isConsentBasis(undefined)).toBe(false);
  });
});

describe("feeding system memory", () => {
  it("hands memory a stable label so counts merge across calls", () => {
    expect(objectionToMemoryText({ key: "price" })).toBe("Price");
    expect(objectionToMemoryText({ key: "price", verbatim: "too pricey" })).toBe("Price");
  });

  it("keeps the verbatim phrase when nothing in the list fits", () => {
    // An objection that keeps landing in `other` is the signal the vocabulary
    // needs a new entry, and the verbatim text is what says which.
    expect(objectionToMemoryText({ key: "other", verbatim: "wants a metal roof" })).toBe(
      "wants a metal roof",
    );
  });
});
