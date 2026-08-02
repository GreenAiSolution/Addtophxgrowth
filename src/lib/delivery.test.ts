import { describe, expect, it } from "vitest";
import { deliveryBody, signPayload, verifySignature, registerDeliveryExecutors } from "@/lib/delivery";
import { ACTION_KINDS, hasExecutor } from "@/lib/gate";

/**
 * Delivery is the last thing that happens to an action a human released, and
 * the endpoint on the other end is being told to invoice and message that
 * business's customers. Two properties matter: the receiver can prove the
 * request came from us, and a captured request cannot be replayed tomorrow.
 */

const action = {
  id: "act_1",
  clientId: "cli_1",
  kind: "invoice.raise",
  summary: "Invoice Marsh Bros for the re-pipe",
  subject: "Marsh Bros",
  movesMoney: true,
  payload: { amount_cents: 420000, proposedBy: "foreman" },
  releasedBy: "dana@example.com",
  releasedAt: new Date("2026-08-02T16:00:00Z"),
};

describe("the signed body", () => {
  it("carries the action id, so a replayed body cannot be a different action", () => {
    const body = deliveryBody(action);
    expect(body.actionId).toBe("act_1");
    expect(body.event).toBe("gate.action.released");
  });

  it("names the kind and its human label, so the receiving workflow can branch", () => {
    const body = deliveryBody(action);
    expect(body.kind).toBe("invoice.raise");
    expect(body.label).toBe("Raise an invoice");
    expect(body.movesMoney).toBe(true);
  });

  it("says who released it", () => {
    expect(deliveryBody(action).releasedBy).toBe("dana@example.com");
  });

  it("passes the proposal through field by field", () => {
    expect(deliveryBody(action).payload).toEqual({ amount_cents: 420000, proposedBy: "foreman" });
  });
});

describe("the signature", () => {
  const body = JSON.stringify(deliveryBody(action));

  it("verifies against the same secret, timestamp and body", () => {
    const sig = signPayload("shh", "1750000000", body);
    expect(verifySignature("shh", "1750000000", body, sig)).toBe(true);
  });

  it("fails on a different secret", () => {
    const sig = signPayload("shh", "1750000000", body);
    expect(verifySignature("other", "1750000000", body, sig)).toBe(false);
  });

  it("fails when the body is edited", () => {
    const sig = signPayload("shh", "1750000000", body);
    expect(verifySignature("shh", "1750000000", body.replace("420000", "42"), sig)).toBe(false);
  });

  it("covers the timestamp, so an old request cannot be replayed as a new one", () => {
    // The timestamp is inside the signed material rather than beside it — a
    // header the receiver merely reads can be edited by whoever captured it.
    const sig = signPayload("shh", "1750000000", body);
    expect(verifySignature("shh", "1750009999", body, sig)).toBe(false);
  });

  it("does not leak length information through a throw", () => {
    expect(verifySignature("shh", "1750000000", body, "short")).toBe(false);
  });
});

describe("wiring", () => {
  it("ships unwired, then wires every kind at once", () => {
    // Nothing is registered by importing the gate: a process that has not asked
    // for delivery cannot send. And once it has asked, no kind is left behind —
    // a half-wired gate is a queue where some released actions silently fail.
    for (const k of ACTION_KINDS) expect(hasExecutor(k.key)).toBe(false);

    registerDeliveryExecutors();
    for (const k of ACTION_KINDS) expect(hasExecutor(k.key)).toBe(true);

    // Idempotent — the cron calls it on every invocation.
    expect(() => registerDeliveryExecutors()).not.toThrow();
  });
});
