import { describe, expect, it } from "vitest";
import {
  CONNECTORS,
  acceptedEvents,
  bodyFor,
  connectorById,
  flattenEvent,
  newSigningSecret,
  validateEndpoint,
  wantsEvent,
} from "@/lib/connectors";
import { buildEvent, EVENT_CATALOGUE } from "@/lib/events";

const EVENT = buildEvent({
  type: "estimate.sent",
  clientId: "c1",
  key: "est_1",
  businessName: "Desert Shine",
  data: {
    estimateId: "est_1",
    customer: { name: "Dana", phone: "+16025550134" },
    job: "Two-storey exterior",
    totalCents: 125000,
    lines: [
      { label: "House wash", quantity: 1, totalCents: 95000 },
      { label: "Driveway", quantity: 1, totalCents: 30000 },
    ],
  },
});

describe("the registry", () => {
  it("has a unique id, a name and setup steps for every connector", () => {
    const ids = CONNECTORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CONNECTORS) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.does.length).toBeGreaterThan(0);
      expect(c.setup.length).toBeGreaterThan(0);
      expect(c.fields.length).toBeGreaterThan(0);
    }
  });

  it("says why, whenever it says unverified", () => {
    // The honesty rule from the top of connectors.ts, enforced. A connector
    // marked unverified with no explanation renders as a bare warning badge,
    // which is worse than no badge.
    for (const c of CONNECTORS.filter((c) => !c.verified)) {
      expect(c.unverifiedNote && c.unverifiedNote.length > 40).toBe(true);
    }
  });

  it("only ever names event types that exist", () => {
    const known = EVENT_CATALOGUE.map((e) => e.type);
    for (const c of CONNECTORS) {
      for (const t of acceptedEvents(c)) expect(known).toContain(t);
    }
  });

  it("keeps spoken prices out of the books", () => {
    // QuickBooks takes what a person released, never what the operator said on
    // a call. If this flips, the queue's promise is only true of the customer's
    // inbox and false of their ledger.
    const qb = connectorById("quickbooks")!;
    expect(acceptedEvents(qb)).toContain("estimate.sent");
    expect(acceptedEvents(qb)).not.toContain("estimate.created");
  });

  it("resolves an unknown id to nothing rather than guessing", () => {
    expect(connectorById("salesforce")).toBeUndefined();
  });
});

describe("wantsEvent", () => {
  const zapier = connectorById("zapier")!;
  const qb = connectorById("quickbooks")!;

  it("treats an empty subscription as everything, not nothing", () => {
    expect(wantsEvent(zapier, [], "call.completed")).toBe(true);
  });

  it("honours a subscription when there is one", () => {
    expect(wantsEvent(zapier, ["estimate.sent"], "estimate.sent")).toBe(true);
    expect(wantsEvent(zapier, ["estimate.sent"], "call.completed")).toBe(false);
  });

  it("will not send a connector something it cannot accept, subscribed or not", () => {
    expect(wantsEvent(qb, [], "call.completed")).toBe(false);
    expect(wantsEvent(qb, ["call.completed"], "call.completed")).toBe(false);
  });
});

describe("flattenEvent", () => {
  const flat = flattenEvent(EVENT);

  it("lifts the envelope to the top level", () => {
    expect(flat.id).toBe(EVENT.id);
    expect(flat.type).toBe("estimate.sent");
    expect(flat.business).toBe("Desert Shine");
  });

  it("dots nested keys so a field picker can offer them", () => {
    expect(flat["customer.name"]).toBe("Dana");
    expect(flat["customer.phone"]).toBe("+16025550134");
  });

  it("summarises an array to one mappable field plus a count", () => {
    // Not `lines.0.label` … `lines.7.label`: a field picker offering those is
    // one nobody can build a Zap against.
    expect(String(flat.lines)).toContain("House wash");
    expect(String(flat.lines)).toContain("Driveway");
    expect(flat["lines.count"]).toBe(2);
  });

  it("keeps numbers as numbers", () => {
    expect(flat.totalCents).toBe(125000);
  });

  it("emits null rather than dropping an absent field", () => {
    const e = buildEvent({ type: "lead.received", clientId: "c", key: "k", data: { message: null } });
    expect(flattenEvent(e).message).toBeNull();
  });
});

describe("bodyFor", () => {
  it("gives the no-code tools a flat body", () => {
    const body = JSON.parse(bodyFor(connectorById("zapier")!, EVENT));
    expect(body["customer.name"]).toBe("Dana");
    expect(body.data).toBeUndefined();
  });

  it("gives everything else the whole envelope", () => {
    const body = JSON.parse(bodyFor(connectorById("n8n")!, EVENT));
    expect(body.data.customer.name).toBe("Dana");
  });
});

describe("validateEndpoint", () => {
  it("takes an https URL", () => {
    const r = validateEndpoint("  https://hooks.zapier.com/hooks/catch/1/abc  ");
    expect(r.ok).toBe(true);
  });

  it("refuses http, because these payloads carry customer details", () => {
    const r = validateEndpoint("http://example.com/hook");
    expect(r.ok).toBe(false);
  });

  it("refuses anything that is not a URL", () => {
    expect(validateEndpoint("hooks.zapier.com").ok).toBe(false);
    expect(validateEndpoint("").ok).toBe(false);
  });

  it("refuses addresses inside a private network", () => {
    // Otherwise the connections screen is a request forgery tool with a
    // friendly form on the front of it.
    for (const host of [
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://10.0.0.5/x",
      "https://192.168.1.1/x",
      "https://169.254.169.254/latest/meta-data",
      "https://172.16.4.4/x",
      "https://printer.local/x",
    ]) {
      expect(validateEndpoint(host).ok, host).toBe(false);
    }
  });

  it("allows a public address that merely starts with a blocked-looking octet", () => {
    expect(validateEndpoint("https://172.32.1.1/hook").ok).toBe(true);
    expect(validateEndpoint("https://110.0.0.1/hook").ok).toBe(true);
  });
});

describe("newSigningSecret", () => {
  it("is recognisable and does not repeat", () => {
    const a = newSigningSecret();
    const b = newSigningSecret();
    expect(a).toMatch(/^phxwh_[0-9a-f]{48}$/);
    expect(a).not.toBe(b);
  });
});
