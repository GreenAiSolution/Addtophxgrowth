import { describe, expect, it } from "vitest";
import { readState, signState, STATE_TTL_SECONDS } from "@/lib/connect-state";
import { authorizeUrl, QBO_SCOPE } from "@/lib/quickbooks";

/**
 * `state` is the only thing that survives an OAuth round trip. If it can be
 * forged, one business's books get attached to another's account — so these
 * are the tests that keep the callback from having to trust the browser.
 */

const AT = new Date("2026-03-05T15:00:00Z");

describe("signState / readState", () => {
  it("round-trips the tenant and the connector", () => {
    const s = signState({ clientId: "c_abc", connector: "quickbooks:production", at: AT });
    expect(readState(s, AT)).toEqual({
      ok: true,
      clientId: "c_abc",
      connector: "quickbooks:production",
    });
  });

  it("refuses a tampered tenant", () => {
    // The attack this stops: swap the client id, get somebody else's QuickBooks
    // attached to your account.
    const s = signState({ clientId: "c_abc", connector: "quickbooks:sandbox", at: AT });
    const body = Buffer.from(
      JSON.stringify({ c: "c_victim", k: "quickbooks:sandbox", t: Math.floor(AT.getTime() / 1000) }),
      "utf8",
    ).toString("base64url");
    const forged = `${body}.${s.slice(s.lastIndexOf(".") + 1)}`;
    expect(readState(forged, AT)).toEqual({ ok: false, why: "That link did not come from us." });
  });

  it("refuses a state with no signature at all", () => {
    const body = Buffer.from(JSON.stringify({ c: "c", k: "quickbooks", t: 1 })).toString("base64url");
    expect(readState(body, AT).ok).toBe(false);
    expect(readState("", AT).ok).toBe(false);
    expect(readState("....", AT).ok).toBe(false);
  });

  it("expires, so a link left in a tab cannot be replayed", () => {
    const s = signState({ clientId: "c_abc", connector: "quickbooks", at: AT });
    const late = new Date(AT.getTime() + (STATE_TTL_SECONDS + 60) * 1000);
    const r = readState(s, late);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.why).toContain("expired");
  });

  it("still works while somebody is picking a company", () => {
    const s = signState({ clientId: "c_abc", connector: "quickbooks", at: AT });
    const soon = new Date(AT.getTime() + (STATE_TTL_SECONDS - 60) * 1000);
    expect(readState(s, soon).ok).toBe(true);
  });

  it("refuses a state issued in the future", () => {
    const s = signState({ clientId: "c_abc", connector: "quickbooks", at: AT });
    const before = new Date(AT.getTime() - 10 * 60 * 1000);
    expect(readState(s, before).ok).toBe(false);
  });

  it("survives a signature containing base64url characters without splitting wrong", () => {
    // The split is on the LAST dot, so a payload that happens to contain one
    // cannot break the parse.
    for (let i = 0; i < 40; i++) {
      const s = signState({ clientId: `c_${i}`, connector: "quickbooks", at: AT });
      expect(readState(s, AT).ok, s).toBe(true);
    }
  });
});

describe("authorizeUrl", () => {
  const url = new URL(
    authorizeUrl({
      clientId: "intuit-app",
      redirectUri: "https://example.com/api/connectors/quickbooks/callback",
      state: "signed-state",
    }),
  );

  it("goes to Intuit's own sign-in, not ours", () => {
    expect(url.origin).toBe("https://appcenter.intuit.com");
  });

  it("asks for exactly one scope", () => {
    // Asking for more than accounting is asking for a refusal.
    expect(url.searchParams.get("scope")).toBe(QBO_SCOPE);
    expect(QBO_SCOPE.split(" ")).toHaveLength(1);
  });

  it("carries the state and the redirect back", () => {
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://example.com/api/connectors/quickbooks/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
  });
});
