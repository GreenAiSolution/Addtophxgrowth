import { describe, expect, it } from "vitest";
import {
  buildEvent,
  EVENT_CATALOGUE,
  EVENT_VERSION,
  isRetryable,
  MAX_ATTEMPTS,
  nextAttemptAt,
  scrub,
  signPayload,
  verifySignature,
} from "@/lib/events";

/**
 * The event contract is the one thing in this repo that ends up inside somebody
 * else's database. These tests exist because every property asserted here is a
 * promise printed on the connections screen: idempotent ids, nothing sensitive,
 * a verifiable signature, six retries over about a day.
 */

const AT = new Date("2026-03-05T15:00:00Z");

describe("buildEvent", () => {
  it("gives the same occurrence the same id, every time", () => {
    const a = buildEvent({ type: "estimate.sent", clientId: "c1", key: "est_9", data: {} });
    const b = buildEvent({
      type: "estimate.sent",
      clientId: "c1",
      key: "est_9",
      data: { different: true },
      at: new Date("2030-01-01"),
    });
    // The id is the receiver's deduplication key. It must not move because a
    // retry happened later or carried more fields.
    expect(a.id).toBe(b.id);
  });

  it("separates two different events about the same row", () => {
    const created = buildEvent({ type: "estimate.created", clientId: "c1", key: "est_9", data: {} });
    const sent = buildEvent({ type: "estimate.sent", clientId: "c1", key: "est_9", data: {} });
    expect(created.id).not.toBe(sent.id);
  });

  it("separates the same key across two tenants", () => {
    const one = buildEvent({ type: "call.completed", clientId: "c1", key: "k", data: {} });
    const two = buildEvent({ type: "call.completed", clientId: "c2", key: "k", data: {} });
    expect(one.id).not.toBe(two.id);
  });

  it("stamps the version and the time", () => {
    const e = buildEvent({ type: "lead.received", clientId: "c1", key: "l1", data: {}, at: AT });
    expect(e.version).toBe(EVENT_VERSION);
    expect(e.occurredAt).toBe("2026-03-05T15:00:00.000Z");
  });

  it("scrubs on the way out, without the caller asking", () => {
    const e = buildEvent({
      type: "call.completed",
      clientId: "c1",
      key: "call_1",
      data: { note: "he read out 4111 1111 1111 1111", api_key: "sk-live-abc" },
    });
    expect(JSON.stringify(e)).not.toContain("4111");
    expect(JSON.stringify(e)).not.toContain("sk-live-abc");
  });

  it("omits the business name rather than sending an empty one", () => {
    const e = buildEvent({ type: "lead.received", clientId: "c1", key: "l", data: {} });
    expect("businessName" in e).toBe(false);
  });
});

describe("scrub", () => {
  it("redacts card-shaped runs of digits, spaced or hyphenated", () => {
    expect(scrub("card 4111-1111-1111-1111 ok")).toBe("card [redacted] ok");
    expect(scrub("4111 1111 1111 1111")).toBe("[redacted]");
  });

  it("redacts social security numbers", () => {
    expect(scrub("ssn is 123-45-6789")).toBe("ssn is [redacted]");
  });

  it("leaves a phone number alone", () => {
    // Ten digits is not a card, and a stream that eats phone numbers is a
    // stream nobody can build a CRM integration against.
    expect(scrub("call me on 602-555-0134")).toBe("call me on 602-555-0134");
  });

  it("leaves a price alone", () => {
    expect(scrub("that comes to $1,250")).toBe("that comes to $1,250");
  });

  it("redacts by key name whatever the value is", () => {
    expect(scrub({ authorization: "hello", note: "hello" })).toEqual({
      authorization: "[redacted]",
      note: "hello",
    });
  });

  it("reaches into nested objects and arrays", () => {
    const out = scrub({
      lines: [{ label: "wash", secret: "nope" }],
      customer: { card_number: "x", name: "Dana" },
    }) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toContain("nope");
    expect(JSON.stringify(out)).toContain("Dana");
  });

  it("stops rather than recursing forever on a cyclic-looking depth", () => {
    let deep: unknown = "bottom";
    for (let i = 0; i < 12; i++) deep = { next: deep };
    expect(JSON.stringify(scrub(deep))).toContain("[too deep]");
  });

  it("passes numbers, booleans and null through untouched", () => {
    expect(scrub({ n: 12, b: false, z: null })).toEqual({ n: 12, b: false, z: null });
  });
});

describe("signing", () => {
  const secret = "phxwh_test";
  const body = JSON.stringify({ hello: "world" });

  it("round-trips", () => {
    const header = signPayload(secret, body, AT);
    expect(verifySignature(secret, body, header, { now: AT })).toEqual({ ok: true });
  });

  it("rejects a changed body", () => {
    const header = signPayload(secret, body, AT);
    const r = verifySignature(secret, `${body} `, header, { now: AT });
    expect(r).toEqual({ ok: false, why: "signature mismatch" });
  });

  it("rejects the wrong secret", () => {
    const header = signPayload(secret, body, AT);
    expect(verifySignature("other", body, header, { now: AT }).ok).toBe(false);
  });

  it("rejects a replay outside the tolerance", () => {
    const header = signPayload(secret, body, AT);
    const later = new Date(AT.getTime() + 10 * 60 * 1000);
    const r = verifySignature(secret, body, header, { now: later });
    expect(r).toEqual({ ok: false, why: "timestamp outside tolerance" });
  });

  it("accepts a replay inside the tolerance", () => {
    const header = signPayload(secret, body, AT);
    const soon = new Date(AT.getTime() + 60 * 1000);
    expect(verifySignature(secret, body, header, { now: soon }).ok).toBe(true);
  });

  it("rejects a malformed header rather than throwing", () => {
    expect(verifySignature(secret, body, "garbage", { now: AT })).toEqual({
      ok: false,
      why: "malformed signature header",
    });
    expect(verifySignature(secret, body, "", { now: AT }).ok).toBe(false);
  });

  it("rejects a signature of the wrong length without throwing", () => {
    // timingSafeEqual throws on a length mismatch. The guard in front of it is
    // load-bearing: a receiver sending a short v1 must get false, not a 500.
    const header = `t=${Math.floor(AT.getTime() / 1000)},v1=abc`;
    expect(verifySignature(secret, body, header, { now: AT }).ok).toBe(false);
  });

  it("uses the Stripe header shape", () => {
    expect(signPayload(secret, body, AT)).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
  });
});

describe("retries", () => {
  it("schedules six attempts and then stops", () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      expect(nextAttemptAt(i, AT)).not.toBeNull();
    }
    expect(nextAttemptAt(MAX_ATTEMPTS, AT)).toBeNull();
  });

  it("gets the first attempt out immediately", () => {
    expect(nextAttemptAt(0, AT)!.getTime()).toBe(AT.getTime());
  });

  it("backs off, and covers about a day in total", () => {
    // The connections screen tells clients "six times over about a day". This
    // is the assertion that keeps that sentence true.
    const gaps = [0, 1, 2, 3, 4, 5].map((n) => nextAttemptAt(n, AT)!.getTime() - AT.getTime());
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]!).toBeGreaterThan(gaps[i - 1]!);
    const hours = gaps.slice(1).reduce((a, b) => a + b, 0) / 3_600_000;
    expect(hours).toBeGreaterThan(20);
    expect(hours).toBeLessThan(30);
  });

  it("retries what means later and refuses what means no", () => {
    expect(isRetryable(500)).toBe(true);
    expect(isRetryable(502)).toBe(true);
    expect(isRetryable(429)).toBe(true);
    expect(isRetryable(408)).toBe(true);
    expect(isRetryable(400)).toBe(false);
    expect(isRetryable(401)).toBe(false);
    expect(isRetryable(404)).toBe(false);
    expect(isRetryable(422)).toBe(false);
  });
});

describe("the catalogue", () => {
  it("documents every field the screen promises, with no duplicates", () => {
    const types = EVENT_CATALOGUE.map((e) => e.type);
    expect(new Set(types).size).toBe(types.length);
    for (const e of EVENT_CATALOGUE) {
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.when.length).toBeGreaterThan(0);
      expect(e.fields.length).toBeGreaterThan(0);
    }
  });
});
