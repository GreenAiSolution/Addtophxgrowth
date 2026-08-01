import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VERIFY_NODE, VERIFY_PY, sampleEnvelope } from "@/lib/event-docs";
import { EVENT_VERSION, signPayload } from "@/lib/events";

/**
 * The samples on /developers, executed.
 *
 * A docs snippet that does not work is the worst kind of bug to ship: the
 * developer who copies it does not file an issue, they conclude the integration
 * is flaky and wire something else. So both are actually run here, against a
 * signature this repo produced, and both are made to fail on a tampered body.
 */

const SECRET = "phxwh_docs_sample";
const BODY = JSON.stringify({ id: "evt_1", type: "estimate.sent", data: { totalCents: 125000 } });
const HEADER = signPayload(SECRET, BODY);

const dir = mkdtempSync(join(tmpdir(), "phx-docs-"));

function runNode(body: string, header: string): boolean {
  const file = join(dir, "verify.mjs");
  writeFileSync(
    file,
    `${VERIFY_NODE}\nconsole.log(verify(${JSON.stringify(body)}, ${JSON.stringify(header)}, ${JSON.stringify(SECRET)}));`,
  );
  return execFileSync("node", [file], { encoding: "utf8" }).trim() === "true";
}

function runPython(body: string, header: string): boolean {
  const file = join(dir, "verify.py");
  writeFileSync(
    file,
    `${VERIFY_PY}\nprint(verify(${JSON.stringify(body)}.encode(), ${JSON.stringify(header)}, ${JSON.stringify(SECRET)}))`,
  );
  return execFileSync("python3", [file], { encoding: "utf8" }).trim() === "True";
}

describe("the Node sample", () => {
  it("accepts a signature we produced", () => {
    expect(runNode(BODY, HEADER)).toBe(true);
  });

  it("rejects a tampered body", () => {
    // The whole point of printing it. If a copied snippet returns true here,
    // every receiver built from this page is unauthenticated.
    expect(runNode(BODY.replace("125000", "1250"), HEADER)).toBe(false);
  });

  it("rejects the wrong secret and a stale timestamp", () => {
    expect(runNode(BODY, signPayload("someone-else", BODY))).toBe(false);
    const old = signPayload(SECRET, BODY, new Date(Date.now() - 20 * 60 * 1000));
    expect(runNode(BODY, old)).toBe(false);
  });
});

describe("the Python sample", () => {
  it("accepts a signature we produced", () => {
    expect(runPython(BODY, HEADER)).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(runPython(BODY.replace("125000", "1250"), HEADER)).toBe(false);
  });

  it("rejects the wrong secret and a stale timestamp", () => {
    expect(runPython(BODY, signPayload("someone-else", BODY))).toBe(false);
    const old = signPayload(SECRET, BODY, new Date(Date.now() - 20 * 60 * 1000));
    expect(runPython(BODY, old)).toBe(false);
  });
});

describe("the sample envelope", () => {
  it("is valid JSON with the version the code actually stamps", () => {
    const parsed = JSON.parse(sampleEnvelope(EVENT_VERSION));
    expect(parsed.version).toBe(EVENT_VERSION);
    expect(parsed.id).toMatch(/^evt_/);
    expect(parsed.data.totalCents).toBe(125000);
  });

  it("shows the line total adding up to the estimate total", () => {
    // Somebody reads this page to learn the shape. An example whose numbers do
    // not reconcile teaches them the wrong thing about our money fields.
    const parsed = JSON.parse(sampleEnvelope(EVENT_VERSION));
    const sum = parsed.data.lines.reduce(
      (a: number, l: { totalCents: number }) => a + l.totalCents,
      0,
    );
    expect(sum).toBe(parsed.data.totalCents);
  });
});
