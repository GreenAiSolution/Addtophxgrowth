import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  verifyTwilioSignature,
  twimlGatherTurn,
  twimlTransfer,
  twimlTakeMessage,
  twimlSayAndHangup,
} from "@/lib/telephony";

function sign(authToken: string, url: string, params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  const data = sortedKeys.reduce((acc, key) => acc + key + params[key], url);
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
}

describe("verifyTwilioSignature", () => {
  const authToken = "test-auth-token";
  const url = "https://example.com/api/voice/inbound";
  const params = { CallSid: "CA123", From: "+16025551234", To: "+16025555678" };

  it("accepts a correctly signed request", () => {
    const sig = sign(authToken, url, params);
    expect(verifyTwilioSignature(authToken, url, params, sig)).toBe(true);
  });

  it("rejects a missing signature", () => {
    expect(verifyTwilioSignature(authToken, url, params, null)).toBe(false);
  });

  it("rejects a tampered parameter", () => {
    const sig = sign(authToken, url, params);
    const tampered = { ...params, From: "+16025559999" };
    expect(verifyTwilioSignature(authToken, url, tampered, sig)).toBe(false);
  });

  it("rejects a signature computed with the wrong auth token", () => {
    const sig = sign("a-different-token", url, params);
    expect(verifyTwilioSignature(authToken, url, params, sig)).toBe(false);
  });

  it("rejects a signature for a different URL", () => {
    const sig = sign(authToken, "https://evil.example.com/api/voice/inbound", params);
    expect(verifyTwilioSignature(authToken, url, params, sig)).toBe(false);
  });
});

describe("TwiML builders", () => {
  it("gather turn escapes XML-unsafe characters and includes the action URL", () => {
    const xml = twimlGatherTurn({
      say: `Thanks for calling "Bob & Sons" <Roofing>`,
      gatherActionUrl: "https://example.com/api/voice/gather?call=abc",
    });
    expect(xml).toContain("<Gather");
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&lt;Roofing&gt;");
    expect(xml).toContain("https://example.com/api/voice/gather?call=abc");
    expect(xml).not.toContain("<Roofing>");
  });

  it("transfer TwiML dials the forwarding number", () => {
    const xml = twimlTransfer("Connecting you now.", "+16025551234", "https://example.com/api/voice/status");
    expect(xml).toContain("<Dial");
    expect(xml).toContain("+16025551234");
  });

  it("take-message TwiML records", () => {
    const xml = twimlTakeMessage("Leave a message.", "https://example.com/api/voice/recording");
    expect(xml).toContain("<Record");
  });

  it("say-and-hangup TwiML hangs up", () => {
    const xml = twimlSayAndHangup("Goodbye.");
    expect(xml).toContain("<Hangup/>");
  });
});
