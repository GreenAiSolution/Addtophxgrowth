/**
 * The code samples printed on /developers.
 *
 * They live here, in a module, rather than inline in the page for one reason:
 * so a test can actually **run them** against a signature this repo produced.
 *
 * A docs snippet that does not compile is the worst possible bug to ship. The
 * developer who copies it does not file an issue — they conclude the
 * integration is flaky, wire something else, and the client never mentions it.
 * These two functions are executed by the suite, in Node and in Python, against
 * a real `signPayload` output, so "the sample works" is a fact rather than a
 * hope.
 */

export const VERIFY_NODE = `import { createHmac, timingSafeEqual } from "node:crypto";

export function verify(rawBody, header, secret) {
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i), p.slice(i + 1)];
    }),
  );

  // Reject anything older than five minutes — that is the replay window.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(parts.t));
  if (!parts.t || !parts.v1 || age > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(\`\${parts.t}.\${rawBody}\`)
    .digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}`;

export const VERIFY_PY = `import hmac, hashlib, time

def verify(raw_body: bytes, header: str, secret: str) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(","))
    if "t" not in parts or "v1" not in parts:
        return False
    if abs(int(time.time()) - int(parts["t"])) > 300:
        return False

    signed = parts["t"].encode() + b"." + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts["v1"])`;

/**
 * The sample envelope.
 *
 * Deliberately an `estimate.sent` — it is the one that means money, the one
 * QuickBooks takes, and the one a receiver is most likely to be built for.
 */
export function sampleEnvelope(version: number): string {
  return `{
  "id": "evt_8f2c41a9d0e7b3560c1a4f28",
  "type": "estimate.sent",
  "version": ${version},
  "occurredAt": "2026-03-05T15:04:11.220Z",
  "clientId": "cl_9k2m4x",
  "businessName": "Desert Shine Exteriors",
  "data": {
    "estimateId": "est_71bd",
    "customer": { "name": "Dana Reyes", "phone": "+16025550134" },
    "job": "Two-storey house, exterior wash",
    "totalCents": 125000,
    "lines": [
      { "label": "House wash", "quantity": 1, "totalCents": 95000 },
      { "label": "Driveway", "quantity": 1, "totalCents": 30000 }
    ],
    "releasedBy": "Marco"
  }
}`;
}
