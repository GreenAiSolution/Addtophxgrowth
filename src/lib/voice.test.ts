import { describe, it, expect } from "vitest";
import {
  parseAgentTurn,
  isWithinBusinessHours,
  parseBusinessHours,
  buildGreeting,
  appendTurn,
  summarizeTranscript,
  buildVoiceSystemPrompt,
  selectLeadsForCallback,
  MAX_OUTBOUND_ATTEMPTS,
  OUTBOUND_COOLDOWN_HOURS,
  type TranscriptTurn,
} from "@/lib/voice";

describe("parseAgentTurn", () => {
  it("parses a well-formed fenced JSON turn", () => {
    const raw =
      '```json\n{"say":"Got it, what size is the job?","action":"CONTINUE","collected":{"jobType":"roof replacement","quantity":2000},"urgent":false}\n```';
    const t = parseAgentTurn(raw);
    expect(t.say).toBe("Got it, what size is the job?");
    expect(t.action).toBe("CONTINUE");
    expect(t.collected.jobType).toBe("roof replacement");
    expect(t.collected.quantity).toBe(2000);
    expect(t.urgent).toBe(false);
  });

  it("parses bare JSON with no fence", () => {
    const raw = '{"say":"Transferring you now.","action":"TRANSFER","collected":{},"urgent":true}';
    const t = parseAgentTurn(raw);
    expect(t.action).toBe("TRANSFER");
    expect(t.urgent).toBe(true);
  });

  it("degrades to CONTINUE with the raw text when nothing parses", () => {
    const t = parseAgentTurn("Sure, I can help with that — what's the address?");
    expect(t.action).toBe("CONTINUE");
    expect(t.say).toContain("what's the address");
    expect(t.collected).toEqual({});
    expect(t.urgent).toBe(false);
  });

  it("never throws on empty or garbage input", () => {
    expect(() => parseAgentTurn("")).not.toThrow();
    expect(() => parseAgentTurn("{ not json at all")).not.toThrow();
    expect(parseAgentTurn("").say.length).toBeGreaterThan(0);
  });

  it("rejects an unknown action rather than propagating it", () => {
    const t = parseAgentTurn('{"say":"ok","action":"DELETE_EVERYTHING","collected":{},"urgent":false}');
    expect(t.action).toBe("CONTINUE");
  });

  it("ignores a collected.quantity that isn't a positive number", () => {
    const t = parseAgentTurn('{"say":"ok","action":"CONTINUE","collected":{"quantity":-5},"urgent":false}');
    expect(t.collected.quantity).toBeUndefined();
  });
});

describe("isWithinBusinessHours", () => {
  it("returns false with no hours configured", () => {
    expect(isWithinBusinessHours(null, new Date())).toBe(false);
  });

  it("handles a same-day window", () => {
    const hours = { startUtcHour: 15, endUtcHour: 23 };
    expect(isWithinBusinessHours(hours, new Date("2026-07-31T16:00:00Z"))).toBe(true);
    expect(isWithinBusinessHours(hours, new Date("2026-07-31T05:00:00Z"))).toBe(false);
  });

  it("handles a window that crosses midnight UTC", () => {
    const hours = { startUtcHour: 22, endUtcHour: 4 };
    expect(isWithinBusinessHours(hours, new Date("2026-07-31T23:00:00Z"))).toBe(true);
    expect(isWithinBusinessHours(hours, new Date("2026-07-31T02:00:00Z"))).toBe(true);
    expect(isWithinBusinessHours(hours, new Date("2026-07-31T12:00:00Z"))).toBe(false);
  });

  it("respects a day-of-week restriction", () => {
    // 2026-08-03 is a Monday (day 1).
    const hours = { startUtcHour: 0, endUtcHour: 23, days: [1, 2, 3, 4, 5] };
    expect(isWithinBusinessHours(hours, new Date("2026-08-03T12:00:00Z"))).toBe(true);
    expect(isWithinBusinessHours(hours, new Date("2026-08-02T12:00:00Z"))).toBe(false); // Sunday
  });
});

describe("parseBusinessHours", () => {
  it("returns null for missing or malformed input", () => {
    expect(parseBusinessHours(null)).toBeNull();
    expect(parseBusinessHours(undefined)).toBeNull();
    expect(parseBusinessHours("not an object")).toBeNull();
    expect(parseBusinessHours({ startUtcHour: 30, endUtcHour: 5 })).toBeNull();
    expect(parseBusinessHours({ startUtcHour: 8 })).toBeNull();
  });

  it("parses a well-formed record and drops bad day entries", () => {
    const parsed = parseBusinessHours({ startUtcHour: 15, endUtcHour: 23, days: [1, 2, 9, -1, 3] });
    expect(parsed).toEqual({ startUtcHour: 15, endUtcHour: 23, days: [1, 2, 3] });
  });
});

describe("buildGreeting", () => {
  it("uses a default in-hours greeting", () => {
    const g = buildGreeting({ businessName: "Acme Roofing", isWithinHours: true });
    expect(g).toContain("Acme Roofing");
  });

  it("uses the after-hours greeting outside business hours when one is set", () => {
    const g = buildGreeting({
      businessName: "Acme Roofing",
      isWithinHours: false,
      customAfterHoursGreeting: "Thanks for calling — it's late, but I'm here.",
    });
    expect(g).toBe("Thanks for calling — it's late, but I'm here.");
  });

  it("still answers with something useful after hours with no custom greeting", () => {
    const g = buildGreeting({ businessName: "Acme Roofing", isWithinHours: false });
    expect(g.length).toBeGreaterThan(0);
    expect(g).toContain("Acme Roofing");
  });

  it("builds an outbound opening line naming the callback reason", () => {
    const g = buildGreeting({
      businessName: "Acme Roofing",
      isWithinHours: true,
      isOutbound: true,
      leadContext: "your roof inspection request",
    });
    expect(g).toContain("your roof inspection request");
  });
});

describe("appendTurn / summarizeTranscript", () => {
  it("appends without mutating the original array", () => {
    const original: TranscriptTurn[] = [];
    const next = appendTurn(original, "caller", "Hi, I need a quote.");
    expect(original).toHaveLength(0);
    expect(next).toHaveLength(1);
    expect(next[0].role).toBe("caller");
  });

  it("summarizes an empty transcript without throwing", () => {
    expect(summarizeTranscript(null)).toContain("no conversation");
    expect(summarizeTranscript([])).toContain("no conversation");
  });

  it("summarizes turns in order", () => {
    let t = appendTurn(null, "caller", "My roof is leaking.");
    t = appendTurn(t, "assistant", "Sorry to hear that — is it actively leaking right now?");
    const s = summarizeTranscript(t);
    expect(s.indexOf("Caller:")).toBeLessThan(s.indexOf("Assistant:"));
  });
});

describe("selectLeadsForCallback", () => {
  const now = new Date("2026-07-31T18:00:00Z");
  const base = { id: "1", createdAt: now, outboundAttempts: 0, lastOutboundAt: null };

  it("selects a fresh, never-called lead", () => {
    const out = selectLeadsForCallback([base], now);
    expect(out).toHaveLength(1);
  });

  it("excludes a lead already at the attempt cap", () => {
    const maxed = { ...base, outboundAttempts: MAX_OUTBOUND_ATTEMPTS };
    expect(selectLeadsForCallback([maxed], now)).toHaveLength(0);
  });

  it("excludes a lead still inside the cooldown window", () => {
    const recent = { ...base, lastOutboundAt: new Date(now.getTime() - (OUTBOUND_COOLDOWN_HOURS - 1) * 3_600_000) };
    expect(selectLeadsForCallback([recent], now)).toHaveLength(0);
  });

  it("includes a lead once the cooldown has passed", () => {
    const cooled = { ...base, lastOutboundAt: new Date(now.getTime() - (OUTBOUND_COOLDOWN_HOURS + 1) * 3_600_000) };
    expect(selectLeadsForCallback([cooled], now)).toHaveLength(1);
  });

  it("excludes a lead older than the lookback window", () => {
    const stale = { ...base, createdAt: new Date(now.getTime() - 30 * 24 * 3_600_000) };
    expect(selectLeadsForCallback([stale], now)).toHaveLength(0);
  });

  it("orders oldest first and respects the cap", () => {
    const leads = [
      { ...base, id: "new", createdAt: new Date(now.getTime() - 1 * 3_600_000) },
      { ...base, id: "old", createdAt: new Date(now.getTime() - 5 * 3_600_000) },
    ];
    const out = selectLeadsForCallback(leads, now, 1);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("old");
  });
});

describe("buildVoiceSystemPrompt", () => {
  it("names the business and includes the JSON turn contract", () => {
    const p = buildVoiceSystemPrompt({ businessName: "Acme Roofing", verticalName: "Roofing contractors" });
    expect(p).toContain("Acme Roofing");
    expect(p).toContain("json");
    expect(p).toContain("ESTIMATE");
  });

  it("marks an outbound call and its context", () => {
    const p = buildVoiceSystemPrompt({
      businessName: "Acme Roofing",
      isOutbound: true,
      leadContext: "a missed call yesterday",
    });
    expect(p).toContain("a missed call yesterday");
  });
});
