import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PROTOCOL_VERSION,
  SERVER_INFO,
  TOOLS,
  callTool,
  dollars,
  handleBody,
  handleRpc,
} from "./mcp";
import { BUNDLES, UPGRADES, bundleListPrice, bundleSaving, upgradeByKey } from "./upgrades";

/**
 * Two things are being tested here and the second one is unusual.
 *
 *   THE PROTOCOL — that this server actually speaks MCP, because a JSON-RPC
 *   implementation that is subtly wrong fails in the client's process rather
 *   than ours, where nobody can see it.
 *
 *   THE README — that the component this repository has been claiming to have
 *   still exists. `consistency.test.ts` already fails the build when the Terms
 *   quote a price the page does not charge; a README describing a directory
 *   that was never created is the same class of defect and had gone unnoticed
 *   for longer.
 */

const repoRoot = join(__dirname, "..", "..");

describe("the claim the README makes", () => {
  it("the MCP server directory named in the catalogue route exists", () => {
    // `src/app/api/catalogue/route.ts` says: "the MCP server in
    // `phxgrowth-plus-mcp-server/`". It said that for months before there was
    // one. This test is what makes the sentence true rather than merely
    // written.
    const dir = join(repoRoot, "phxgrowth-plus-mcp-server");
    expect(existsSync(dir), "phxgrowth-plus-mcp-server/ is named in the catalogue route").toBe(true);
    expect(existsSync(join(dir, "server.mjs"))).toBe(true);
    expect(existsSync(join(dir, "package.json"))).toBe(true);
  });

  it("the catalogue route still points at the directory this test guards", () => {
    // If somebody renames the directory, the comment and the test have to move
    // together — otherwise this passes while the route describes a path that
    // is gone again.
    const route = readFileSync(join(repoRoot, "src/app/api/catalogue/route.ts"), "utf8");
    expect(route).toContain("phxgrowth-plus-mcp-server/");
  });

  it("the stdio wrapper carries no prices of its own", () => {
    // The whole reason it proxies. Two copies of a price list means one of
    // them is eventually wrong, and it will be the one somebody quotes.
    const server = readFileSync(join(repoRoot, "phxgrowth-plus-mcp-server/server.mjs"), "utf8");
    expect(server).not.toMatch(/\$\s?\d{3,}/);
    expect(server).toMatch(/PHX_MCP_URL/);
  });

  it("the stdio wrapper drains its in-flight work before exiting", () => {
    // A real bug, caught by piping a batch in rather than typing one: stdin's
    // `end` fires when the writer closes the pipe, not when the work is done,
    // so exiting on it produced a clean exit code and zero bytes of output.
    // It looked correct interactively because a human types slowly enough for
    // the response to arrive first.
    const server = readFileSync(join(repoRoot, "phxgrowth-plus-mcp-server/server.mjs"), "utf8");
    const endHandler = server.match(/on\("end",[\s\S]*?\}\);/)?.[0] ?? "";
    expect(endHandler).toContain("pending");
    expect(endHandler, "exiting straight out of the end handler drops pending responses").not.toMatch(
      /on\("end",\s*\(\)\s*=>\s*process\.exit/,
    );
  });

  it("the stdio wrapper does not invent a domain", () => {
    // The sitemap-serving-localhost bug, in its next available disguise.
    const server = readFileSync(join(repoRoot, "phxgrowth-plus-mcp-server/server.mjs"), "utf8");
    const defaulted = server.match(/PHX_MCP_URL\s*(\?\?|\|\|)\s*["'`]https?:/);
    expect(defaulted, "the endpoint must be required, never defaulted to a guessed host").toBeNull();
  });
});

describe("the handshake", () => {
  it("answers initialize with a protocol version and a tool capability", () => {
    const res = handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize" })!;
    expect(res.id).toBe(1);
    const result = res.result as Record<string, unknown>;
    expect(result.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(result.serverInfo).toEqual(SERVER_INFO);
    expect((result.capabilities as Record<string, unknown>).tools).toBeDefined();
  });

  it("tells the client not to invent results claims", () => {
    // The instructions field is the only thing an assistant reads before it
    // starts answering, so the proof posture has to be in it.
    const res = handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize" })!;
    const instructions = String((res.result as Record<string, unknown>).instructions);
    expect(instructions).toContain("proof_posture");
  });

  it("returns nothing for notifications", () => {
    // A response to a notification is a message the client never asked for,
    // and some clients drop the connection over it.
    expect(handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    expect(handleRpc({ jsonrpc: "2.0", method: "notifications/cancelled" })).toBeNull();
  });

  it("rejects a message that is not JSON-RPC 2.0", () => {
    const res = handleRpc({ jsonrpc: "1.0", id: 9, method: "tools/list" })!;
    expect(res.error?.code).toBe(-32600);
  });

  it("reports an unknown method rather than throwing", () => {
    const res = handleRpc({ jsonrpc: "2.0", id: 3, method: "resources/list" })!;
    expect(res.error?.code).toBe(-32601);
  });

  it("survives malformed JSON on the wire", () => {
    const res = handleBody("{not json") as { error?: { code: number } };
    expect(res.error?.code).toBe(-32700);
  });

  it("handles a batch and drops the notifications from the reply", () => {
    const res = handleBody(
      JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "ping" },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "tools/list" },
      ]),
    ) as unknown[];
    expect(Array.isArray(res)).toBe(true);
    expect(res).toHaveLength(2);
  });
});

describe("the tool list", () => {
  it("every tool has a name, a description and an object schema", () => {
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^[a-z_]+$/);
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.inputSchema.type).toBe("object");
    }
  });

  it("names are unique", () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("tools/list returns exactly the declared tools", () => {
    const res = handleRpc({ jsonrpc: "2.0", id: 1, method: "tools/list" })!;
    expect((res.result as { tools: unknown[] }).tools).toEqual(TOOLS);
  });

  it("every declared tool is actually callable", () => {
    // A tool advertised and not implemented is worse than one that is missing:
    // the assistant calls it, gets an error, and reports it to the customer.
    for (const t of TOOLS) {
      const required = (t.inputSchema.required ?? []) as string[];
      if (required.length > 0) continue; // covered case by case below
      const result = callTool(t.name, {});
      expect(result.isError, `${t.name} is advertised but errors on an empty call`).toBeFalsy();
    }
  });
});

describe("prices", () => {
  it("formats cents as dollars and never the other way round", () => {
    expect(dollars(160_000)).toBe("$1,600");
    expect(dollars(990_000)).toBe("$9,900");
  });

  it("quotes an upgrade at exactly the catalogue price", () => {
    const u = UPGRADES[0];
    const result = callTool("get_upgrade", { key: u.key });
    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as { priceCents: number; name: string };
    expect(structured.priceCents).toBe(u.price);
    expect(structured.name).toBe(u.name);
    // The prose an assistant reads aloud has to agree with the number.
    expect(result.content[0].text).toContain(dollars(u.price));
  });

  it("prices a bundle from its members rather than from a stored total", () => {
    const b = BUNDLES[0];
    const result = callTool("quote_bundle", { key: b.key });
    const s = result.structuredContent as {
      priceCents: number;
      listPriceCents: number;
      savingCents: number;
    };
    expect(s.priceCents).toBe(b.price);
    expect(s.listPriceCents).toBe(bundleListPrice(b));
    expect(s.savingCents).toBe(bundleSaving(b));
    // The property the catalogue's own tests enforce: a bundle is cheaper.
    expect(s.savingCents).toBeGreaterThan(0);
  });

  it("totals a stack and separates monthly from one-time", () => {
    const monthly = UPGRADES.filter((u) => u.billing === "monthly").slice(0, 2);
    const result = callTool("quote_stack", { keys: monthly.map((u) => u.key) });
    const s = result.structuredContent as { monthlyCents: number; oneTimeCents: number };
    expect(s.monthlyCents).toBe(monthly.reduce((n, u) => n + u.price, 0));
    expect(s.oneTimeCents).toBe(0);
  });

  it("surfaces a cheaper bundle instead of quietly quoting the à la carte sum", () => {
    // Quoting somebody the list price when a bundle contains exactly what they
    // asked for is a quiet overcharge — it costs a client rather than a sale.
    const b = BUNDLES[0];
    const result = callTool("quote_stack", { keys: b.members });
    const s = result.structuredContent as { suggestedBundles: { key: string }[] };
    expect(s.suggestedBundles.map((x) => x.key)).toContain(b.key);
    expect(result.content[0].text).toContain("Cheaper as a bundle");
  });

  it("never quotes a price the catalogue does not carry", () => {
    // Every dollar figure the server can emit, checked against the real ones.
    const legal = new Set<string>();
    for (const u of UPGRADES) legal.add(dollars(u.price));
    for (const b of BUNDLES) {
      legal.add(dollars(b.price));
      legal.add(dollars(bundleListPrice(b)));
      legal.add(dollars(bundleSaving(b)));
    }
    for (const p of ["$5,000", "$12,000", "$25,000"]) legal.add(p); // flight plan labels

    const everything = [
      callTool("list_catalogue", {}),
      ...UPGRADES.map((u) => callTool("get_upgrade", { key: u.key })),
      ...BUNDLES.map((b) => callTool("quote_bundle", { key: b.key })),
    ]
      .map((r) => r.content[0].text)
      .join("\n");

    for (const figure of everything.match(/\$[\d,]+/g) ?? []) {
      expect(legal.has(figure), `"${figure}" is not a price this business charges`).toBe(true);
    }
  });
});

describe("unknown keys", () => {
  it("names the real keys instead of throwing", () => {
    const result = callTool("get_upgrade", { key: "not-a-thing" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(UPGRADES[0].key);
  });

  it("reports every missing key in a stack at once", () => {
    const result = callTool("quote_stack", { keys: [UPGRADES[0].key, "nope", "also-nope"] });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("nope");
    expect(result.content[0].text).toContain("also-nope");
  });

  it("refuses an empty stack rather than quoting zero", () => {
    const result = callTool("quote_stack", { keys: [] });
    expect(result.isError).toBe(true);
  });

  it("reports an unknown tool", () => {
    expect(callTool("drop_tables", {}).isError).toBe(true);
  });
});

describe("proof posture", () => {
  it("is a tool, so an assistant can find it before inventing a number", () => {
    expect(TOOLS.map((t) => t.name)).toContain("proof_posture");
  });

  it("states plainly that there are no case studies and percentages are prices", () => {
    const result = callTool("proof_posture", {});
    const s = result.structuredContent as {
      hasPublishedCaseStudies: boolean;
      percentagesArePricesNotResults: boolean;
    };
    expect(s.hasPublishedCaseStudies).toBe(false);
    expect(s.percentagesArePricesNotResults).toBe(true);
    expect(result.content[0].text).toContain("Do not repeat a performance figure");
  });

  it("no tool output quotes a percentage that is not a real fee rate", () => {
    // The same rule upgrades.test.ts enforces on the page, enforced on what
    // the server hands an assistant to repeat.
    const everything = [
      callTool("list_catalogue", {}),
      callTool("proof_posture", {}),
      ...UPGRADES.map((u) => callTool("get_upgrade", { key: u.key })),
    ]
      .map((r) => r.content[0].text)
      .join("\n");

    for (const pct of everything.match(/\d+(\.\d+)?\s?%/g) ?? []) {
      expect(["8%", "6%", "4%"]).toContain(pct.replace(/\s/g, ""));
    }
  });
});

describe("service lookup", () => {
  it("returns the upgrades that bolt onto a real service", () => {
    const service = UPGRADES[0].attachesTo;
    const result = callTool("upgrades_for_service", { service });
    expect(result.isError).toBeFalsy();
    const s = result.structuredContent as { upgrades: { key: string }[] };
    expect(s.upgrades.length).toBeGreaterThan(0);
    for (const u of s.upgrades) {
      expect(upgradeByKey(u.key)!.attachesTo).toBe(service);
    }
  });

  it("names the real services on a bad one", () => {
    const result = callTool("upgrades_for_service", { service: "dog-walking" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(UPGRADES[0].attachesTo);
  });
});
