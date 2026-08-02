import { describe, expect, it } from "vitest";
import {
  CONNECTORS,
  OPERATIONS,
  operationByKey,
  operationForToolName,
  gateKindForOperation,
  connectorStatus,
  toolName,
  toolDefinition,
  toolsFor,
  missingParams,
} from "@/lib/connectors";
import { ACTION_KINDS, kindByKey } from "@/lib/gate";

/**
 * The registry is the answer to "what can this thing do to my business?", and
 * the answer is only worth anything if it is complete. These tests are about
 * the two claims the rest of the system makes on this file's behalf:
 *
 *   1. Nothing writes without a gate. Not by convention — by construction.
 *   2. What the model is shown matches what will actually happen to the call.
 *
 * A failure here does not produce a bad answer. It produces an action nobody
 * agreed to.
 */

describe("nothing reaches the world without passing the gate", () => {
  it("gives every write a registered action kind", () => {
    const writes = OPERATIONS.filter((o) => o.direction === "WRITE");
    expect(writes.length).toBeGreaterThan(0);

    for (const op of writes) {
      expect(op.gateKind, `${op.key} writes with no gate kind`).toBeTruthy();
      expect(kindByKey(op.gateKind!), `${op.key} names unknown kind "${op.gateKind}"`).toBeDefined();
    }
  });

  it("gives no read a gate kind, so a mislabelled write cannot hide as one", () => {
    for (const op of OPERATIONS.filter((o) => o.direction === "READ")) {
      expect(op.gateKind, `${op.key} is a READ carrying a gate kind`).toBeUndefined();
    }
  });

  it("covers every gated action kind with exactly one operation", () => {
    // A kind with no operation is an action the gate is prepared to hold and
    // nothing can ever propose; a kind with two is an action whose provenance
    // cannot be read off the queue row.
    for (const kind of ACTION_KINDS) {
      const ops = OPERATIONS.filter((o) => o.gateKind === kind.key);
      expect(ops.length, `${kind.key} is proposed by ${ops.length} operations`).toBe(1);
    }
  });

  it("keeps the browser tier read-only", () => {
    // A browser write cannot be described precisely enough in a queue for a
    // human to review it, which makes it unreviewable rather than merely risky.
    const browser = CONNECTORS.filter((c) => c.tier === "BROWSER");
    expect(browser.length).toBeGreaterThan(0);
    for (const c of browser) {
      for (const op of c.operations) {
        expect(op.direction, `${op.key} is a browser write`).toBe("READ");
      }
    }
  });
});

describe("the registry can be read without ambiguity", () => {
  it("namespaces every operation under its connector", () => {
    for (const c of CONNECTORS) {
      for (const op of c.operations) {
        expect(op.key.startsWith(`${c.key}.`), `${op.key} is not under ${c.key}`).toBe(true);
      }
    }
  });

  it("has unique operation keys", () => {
    const keys = OPERATIONS.map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("resolves a tool name back to exactly one operation", () => {
    for (const op of OPERATIONS) {
      const name = toolName(op.key);
      // Anthropic's constraint on tool names. A dot would be rejected at the
      // API boundary, which is a failure that only appears on a live call.
      expect(name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
      expect(operationForToolName(name)?.key).toBe(op.key);
    }
  });

  it("reports a connector as wired only when something on it is", () => {
    const desk = CONNECTORS.find((c) => c.key === "desk")!;
    const browser = CONNECTORS.find((c) => c.key === "browser")!;
    expect(connectorStatus(desk)).toBe("LIVE");
    expect(connectorStatus(browser)).toBe("PLANNED");
  });

  it("stores no credential values anywhere", () => {
    // Field names only. A registry that carried a token would put it in every
    // bundle that imported the roster.
    for (const c of CONNECTORS) {
      for (const field of c.credentials) {
        expect(field).toMatch(/^[a-z0-9_]+$/);
      }
    }
  });
});

describe("what the model is told matches what happens", () => {
  it("tells a write that it is a proposal, and names the hold", () => {
    for (const op of OPERATIONS.filter((o) => o.direction === "WRITE")) {
      const def = toolDefinition(op);
      const kind = gateKindForOperation(op.key)!;

      expect(def.description, `${op.key} does not say it only proposes`).toContain("PROPOSAL ONLY");
      expect(def.description).toContain(kind.label);

      if (kind.movesMoney) {
        // The distinction the client was sold: money waits for a person.
        expect(def.description).toContain("named human");
      } else {
        expect(def.description).toContain(`${kind.reviewWindowMinutes} minutes`);
      }
    }
  });

  it("says nothing about proposals on a read", () => {
    for (const op of OPERATIONS.filter((o) => o.direction === "READ")) {
      expect(toolDefinition(op).description).not.toContain("PROPOSAL ONLY");
    }
  });

  it("marks required parameters as required", () => {
    const quote = operationByKey("quotes.send")!;
    const def = toolDefinition(quote);
    expect(def.input_schema.required).toContain("amount_cents");
    expect(Object.keys(def.input_schema.properties)).toEqual(quote.params.map((p) => p.name));
  });

  it("refuses to build a toolset from an unknown key", () => {
    // Skipping it silently would leave a duty that reads everything, proposes
    // nothing, and looks from outside exactly like a quiet week.
    expect(() => toolsFor(["desk.leads_recent", "nope.nope"])).toThrow(/nope\.nope/);
  });
});

describe("a proposal missing its number never reaches the queue", () => {
  const invoice = operationByKey("ledger.raise_invoice")!;

  it("catches an absent required field", () => {
    expect(missingParams(invoice, { customer: "Acme" })).toContain("amount_cents");
  });

  it("treats whitespace as absent", () => {
    expect(missingParams(invoice, { customer: "   ", summary: "x", amount_cents: 1, basis: "y" })).toEqual([
      "customer",
    ]);
  });

  it("passes a complete call", () => {
    expect(
      missingParams(invoice, {
        customer: "Acme",
        summary: "Invoice for the Tuesday job",
        amount_cents: 42000,
        basis: "accepted quote #113",
      }),
    ).toEqual([]);
  });
});
