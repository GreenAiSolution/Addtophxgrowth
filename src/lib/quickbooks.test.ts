import { describe, expect, it } from "vitest";
import {
  accessTokenIsFresh,
  apiBase,
  customerName,
  customerPayload,
  estimateLines,
  estimatePayload,
} from "@/lib/quickbooks";

/**
 * The mapping, tested without an Intuit account — which is the whole reason it
 * was written as pure functions. What is *not* tested here is the network path,
 * because there is no live company file to run it against, and the connections
 * screen says so next to the button.
 */

describe("estimateLines", () => {
  it("converts integer cents to dollars exactly", () => {
    const lines = estimateLines({
      lines: [{ label: "House wash", quantity: 1, totalCents: 95000, unitCents: 95000 }],
    });
    expect(lines).toEqual([
      {
        DetailType: "SalesItemLineDetail",
        Amount: 950,
        Description: "House wash",
        SalesItemLineDetail: { Qty: 1, UnitPrice: 950 },
      },
    ]);
  });

  it("does not round a price that is not round", () => {
    // 1234 cents is $12.34 in the books, because the customer holds a document
    // that says $12.34.
    const [line] = estimateLines({ lines: [{ label: "x", totalCents: 1234 }] });
    expect(line!.Amount).toBe(12.34);
  });

  it("never invents an ItemRef", () => {
    // Guessing at the client's chart of items puts revenue against the wrong
    // account — a problem they find in April rather than today.
    const [line] = estimateLines({ lines: [{ label: "x", totalCents: 100 }] });
    expect(JSON.stringify(line)).not.toContain("ItemRef");
  });

  it("falls back to a single line when only a total reached us", () => {
    const lines = estimateLines({ totalCents: 125000, job: "Two-storey exterior" });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.Amount).toBe(1250);
    expect(lines[0]!.Description).toBe("Two-storey exterior");
  });

  it("returns nothing when there is neither a breakdown nor a total", () => {
    expect(estimateLines({ customer: { name: "Dana" } })).toEqual([]);
  });

  it("drops a line with no money on it rather than writing a zero", () => {
    const lines = estimateLines({
      lines: [{ label: "priced" , totalCents: 500 }, { label: "no price" }],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.Description).toBe("priced");
  });

  it("accepts numeric strings, because JSON round-trips are not fussy", () => {
    const [line] = estimateLines({ lines: [{ label: "x", totalCents: "2500", quantity: "2" }] });
    expect(line!.Amount).toBe(25);
    expect(line!.SalesItemLineDetail.Qty).toBe(2);
  });

  it("ignores a lines field that is not an array", () => {
    expect(estimateLines({ lines: "two things", totalCents: 100 })).toHaveLength(1);
  });
});

describe("customerName", () => {
  it("prefers the name", () => {
    expect(customerName({ customer: { name: "Dana Reyes", phone: "+16025550134" } })).toBe("Dana Reyes");
  });

  it("falls back to the phone number, labelled", () => {
    expect(customerName({ customer: { phone: "+16025550134" } })).toBe("Caller +16025550134");
  });

  it("reads the flat fields too", () => {
    expect(customerName({ customerName: "Dana" })).toBe("Dana");
  });

  it("ends up with something deliberate rather than blank", () => {
    expect(customerName({})).toBe("Unnamed caller");
    expect(customerName({ customer: { name: "   " } })).toBe("Unnamed caller");
  });

  it("stays inside the DisplayName limit", () => {
    expect(customerName({ customer: { name: "x".repeat(300) } })).toHaveLength(100);
  });
});

describe("customerPayload", () => {
  it("carries what it has and omits what it does not", () => {
    expect(customerPayload({ customer: { name: "Dana", phone: "+16025550134" } })).toEqual({
      DisplayName: "Dana",
      PrimaryPhone: { FreeFormNumber: "+16025550134" },
    });
  });

  it("includes an address when one was captured", () => {
    const p = customerPayload({ customer: { name: "Dana", address: "12 Palm Ave" } });
    expect(p.BillAddr).toEqual({ Line1: "12 Palm Ave" });
  });
});

describe("estimatePayload", () => {
  const data = {
    customer: { name: "Dana" },
    job: "Two-storey exterior",
    releasedBy: "Marco",
    lines: [{ label: "House wash", totalCents: 95000 }],
  };

  it("references the customer we resolved", () => {
    expect(estimatePayload(data, "42").CustomerRef).toEqual({ value: "42" });
  });

  it("records the job and who released it, on the document", () => {
    const memo = (estimatePayload(data, "42").CustomerMemo as { value: string }).value;
    expect(memo).toContain("Two-storey exterior");
    expect(memo).toContain("Released by Marco");
  });

  it("never sets DocNumber", () => {
    // QuickBooks assigns it, and a duplicate is a permanent 400 for a reason
    // that has nothing to do with us.
    expect(estimatePayload(data, "42").DocNumber).toBeUndefined();
  });
});

describe("environment and tokens", () => {
  it("points at the right host", () => {
    expect(apiBase("production")).toBe("https://quickbooks.api.intuit.com");
    expect(apiBase("sandbox")).toBe("https://sandbox-quickbooks.api.intuit.com");
  });

  it("treats a missing or expired access token as stale", () => {
    const base = { realmId: "1", refreshToken: "r", environment: "sandbox" } as const;
    expect(accessTokenIsFresh(base)).toBe(false);
    expect(
      accessTokenIsFresh({
        ...base,
        accessToken: "a",
        accessTokenExpiresAt: "2020-01-01T00:00:00Z",
      }),
    ).toBe(false);
  });

  it("treats an unexpired one as fresh", () => {
    const now = new Date("2026-03-05T15:00:00Z");
    expect(
      accessTokenIsFresh(
        {
          realmId: "1",
          refreshToken: "r",
          environment: "sandbox",
          accessToken: "a",
          accessTokenExpiresAt: "2026-03-05T15:30:00Z",
        },
        now,
      ),
    ).toBe(true);
  });
});
