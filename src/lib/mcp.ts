/**
 * THE MCP SERVER — tools and handlers.
 *
 * DIRECTION
 *   `src/app/api/catalogue/route.ts` has said this since it shipped:
 *
 *     "The second [reader] is the MCP server in `phxgrowth-plus-mcp-server/`,
 *      which lets the agency quote a bundle from Slack without opening the
 *      site."
 *
 *   and the README says the catalogue endpoint "is the single source the MCP
 *   server reads". There was no MCP server. There was no such directory.
 *
 *   This codebase fails its own build over a percentage on a marketing page
 *   that nobody can verify, and over a Terms document quoting a fee the
 *   business does not charge. A README describing a component that does not
 *   exist is the same defect, in the file most likely to be read first by
 *   somebody deciding whether to trust the rest of it. `mcp.test.ts` now
 *   enforces the claim rather than the claim merely being made.
 *
 * WHY IT DOGFOODS THE PRODUCT
 *   This site sells Answer Engine Visibility — the product is being a business
 *   an assistant can describe accurately. A price list an assistant can only
 *   reach by scraping HTML is the exact failure the instruments on the home
 *   page diagnose in other people's businesses. Publishing the offer as
 *   callable tools is the least defensible thing to skip while charging for
 *   it.
 *
 * WHY THE PROTOCOL IS HAND-ROLLED
 *   MCP over HTTP is JSON-RPC 2.0 with three methods that matter — the
 *   handshake, the tool list, and the call. That is a few hundred lines,
 *   fully testable, with no new dependency in a repository whose whole posture
 *   is that it installs and runs with nothing configured. Pulling in an SDK to
 *   avoid writing `if (method === "tools/list")` would be the larger cost.
 *
 * BLUEPRINTS
 *   Everything here is pure: a request object in, a response object out. No
 *   database, no auth, no network. `app/api/mcp/route.ts` is the transport and
 *   holds no logic. That split is what lets the entire protocol be tested
 *   without starting a server.
 */

import {
  BUNDLES,
  FLIGHT_PLANS,
  PARENT_SERVICES,
  UPGRADES,
  bundleByKey,
  bundleListPrice,
  bundleMembers,
  bundleSaving,
  entryPrice,
  upgradeByKey,
  upgradesFor,
  type ServiceKey,
} from "@/lib/upgrades";
import { BRAND } from "@/lib/brand";

/** The MCP revision this server speaks. */
export const PROTOCOL_VERSION = "2024-11-05";

export const SERVER_INFO = {
  name: "phxgrowth-plus",
  version: "1.0.0",
} as const;

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * Everything in this codebase stores cents. Everything an assistant repeats to
 * a human has to be dollars, and the two must never be confused — a currency
 * figure that might be either is how somebody gets quoted a hundredth of the
 * real price.
 *
 * So every tool result carries both: a formatted string for reading aloud and
 * an explicit `*Cents` number for arithmetic.
 */
export function dollars(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function priceOf(u: { price: number; billing: string }): string {
  return u.billing === "monthly" ? `${dollars(u.price)}/mo` : `${dollars(u.price)} one-time`;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const SERVICE_KEYS = PARENT_SERVICES.map((s) => s.key);

export const TOOLS: ToolDef[] = [
  {
    name: "list_catalogue",
    description:
      "The whole PHX Growth Plus offer: the three PHX/GROWTH services it bolts onto, every upgrade with its price and what it delivers, and every bundle. Use this to answer any question about what is sold or what it costs.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_upgrade",
    description:
      "One upgrade in full: what it fixes, exactly what is delivered, the demand case, the price, and which PHX/GROWTH service it attaches to.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: `Upgrade key, e.g. ${UPGRADES[0]?.key ?? "answer-engine"}` },
      },
      required: ["key"],
      additionalProperties: false,
    },
  },
  {
    name: "quote_bundle",
    description:
      "Price a bundle from its members. Returns the bundle price, the à la carte list price, and the saving — computed from the members rather than stored, so a quote can never disagree with the catalogue.",
    inputSchema: {
      type: "object",
      properties: { key: { type: "string", description: "Bundle key." } },
      required: ["key"],
      additionalProperties: false,
    },
  },
  {
    name: "quote_stack",
    description:
      "Price an arbitrary set of upgrades. Monthly and one-time totals are returned separately because they are different commitments, and any bundle that would be cheaper than the same items bought individually is surfaced.",
    inputSchema: {
      type: "object",
      properties: {
        keys: {
          type: "array",
          items: { type: "string" },
          description: "Upgrade keys to price together.",
        },
      },
      required: ["keys"],
      additionalProperties: false,
    },
  },
  {
    name: "upgrades_for_service",
    description:
      "Every upgrade that bolts onto one PHX/GROWTH service, most expensive first.",
    inputSchema: {
      type: "object",
      properties: {
        service: { type: "string", enum: SERVICE_KEYS, description: "PHX/GROWTH service key." },
      },
      required: ["service"],
      additionalProperties: false,
    },
  },
  {
    name: "proof_posture",
    description:
      "What this business will and will not claim about results, and the guarantee it does offer. Read this before repeating any performance figure — there are no case studies published yet, and saying so is the position rather than an omission.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  /** Machine-readable payload alongside the prose. */
  structuredContent?: unknown;
}

function textResult(text: string, structured?: unknown): ToolResult {
  return { content: [{ type: "text", text }], structuredContent: structured };
}

function errorResult(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

function upgradeSummary(u: (typeof UPGRADES)[number]) {
  return {
    key: u.key,
    name: u.name,
    attachesTo: u.attachesTo,
    promise: u.promise,
    fixes: u.fixes,
    delivers: u.delivers,
    demandCase: u.demandCase,
    price: priceOf(u),
    priceCents: u.price,
    billing: u.billing,
    ...(u.build ? { build: true, oversight: u.oversight } : {}),
  };
}

/**
 * Pure: run one tool.
 *
 * Every unknown key returns an error result rather than throwing, because a
 * tool that throws takes the assistant's whole turn down, and the useful
 * behaviour on a mistyped key is to say which keys exist.
 */
export function callTool(name: string, args: Record<string, unknown>): ToolResult {
  switch (name) {
    case "list_catalogue": {
      const payload = {
        brand: { name: BRAND.name, tagline: BRAND.tagline, parent: BRAND.parent.name },
        currency: "USD",
        services: PARENT_SERVICES.map((s) => ({
          key: s.key,
          name: s.name,
          priceLabel: s.priceLabel,
          role: s.role,
          ceiling: s.ceiling,
        })),
        flightPlans: FLIGHT_PLANS.map((p) => ({
          key: p.key,
          name: p.name,
          promise: p.promise,
          price: p.price,
          fee: p.fee,
        })),
        upgrades: UPGRADES.map(upgradeSummary),
        bundles: BUNDLES.map((b) => ({
          key: b.key,
          name: b.name,
          members: b.members,
          promise: b.promise,
          price: `${dollars(b.price)}/mo`,
          priceCents: b.price,
          listPriceCents: bundleListPrice(b),
          savingCents: bundleSaving(b),
        })),
        entryPrice: dollars(entryPrice()),
        entryPriceCents: entryPrice(),
      };
      return textResult(
        `${BRAND.name} — ${UPGRADES.length} upgrades and ${BUNDLES.length} bundles bolting onto ${PARENT_SERVICES.length} PHX/GROWTH services. Entry price ${dollars(entryPrice())}/mo.`,
        payload,
      );
    }

    case "get_upgrade": {
      const key = String(args.key ?? "");
      const u = upgradeByKey(key);
      if (!u) {
        return errorResult(
          `No upgrade "${key}". Available: ${UPGRADES.map((x) => x.key).join(", ")}.`,
        );
      }
      const lines = [
        `${u.name} — ${priceOf(u)}`,
        `Attaches to: ${u.attachesTo}`,
        `Fixes: ${u.fixes}`,
        `Promise: ${u.promise}`,
        "",
        "Delivers:",
        ...u.delivers.map((d) => `- ${d}`),
        "",
        `Why demand is rising: ${u.demandCase}`,
        ...(u.oversight ? ["", `What you can see and stop: ${u.oversight}`] : []),
      ];
      return textResult(lines.join("\n"), upgradeSummary(u));
    }

    case "quote_bundle": {
      const key = String(args.key ?? "");
      const b = bundleByKey(key);
      if (!b) {
        return errorResult(`No bundle "${key}". Available: ${BUNDLES.map((x) => x.key).join(", ")}.`);
      }
      const members = bundleMembers(b);
      const list = bundleListPrice(b);
      const saving = bundleSaving(b);
      const lines = [
        `${b.name} — ${dollars(b.price)}/mo`,
        `Bought separately: ${dollars(list)}/mo. Saving: ${dollars(saving)}/mo.`,
        "",
        "Members:",
        ...members.map((m) => `- ${m.name} (${priceOf(m)})`),
        "",
        b.rationale,
      ];
      return textResult(lines.join("\n"), {
        key: b.key,
        name: b.name,
        priceCents: b.price,
        listPriceCents: list,
        savingCents: saving,
        members: members.map(upgradeSummary),
      });
    }

    case "quote_stack": {
      const raw = Array.isArray(args.keys) ? args.keys : [];
      const keys = raw.map(String);
      if (keys.length === 0) return errorResult("Pass at least one upgrade key in `keys`.");

      const found = keys.map((k) => ({ k, u: upgradeByKey(k) }));
      const missing = found.filter((f) => !f.u).map((f) => f.k);
      if (missing.length > 0) {
        return errorResult(
          `Unknown upgrade key(s): ${missing.join(", ")}. Available: ${UPGRADES.map((x) => x.key).join(", ")}.`,
        );
      }

      const items = found.map((f) => f.u!);
      const monthly = items.filter((u) => u.billing === "monthly");
      const oneTime = items.filter((u) => u.billing === "one_time");
      const monthlyCents = monthly.reduce((n, u) => n + u.price, 0);
      const oneTimeCents = oneTime.reduce((n, u) => n + u.price, 0);

      // If the same items sit inside a bundle, say so. Quoting somebody the à
      // la carte sum when a cheaper bundle contains everything they asked for
      // is the kind of quiet overcharge that costs a client rather than a sale.
      const chosen = new Set(keys);
      const cheaper = BUNDLES.filter(
        (b) => b.members.every((m) => chosen.has(m)) && b.price < bundleListPrice(b),
      );

      const lines = [
        `${items.length} upgrade${items.length === 1 ? "" : "s"}:`,
        ...items.map((u) => `- ${u.name} — ${priceOf(u)}`),
        "",
        `Monthly: ${dollars(monthlyCents)}/mo`,
        ...(oneTimeCents > 0 ? [`One-time: ${dollars(oneTimeCents)}`] : []),
        ...cheaper.map(
          (b) =>
            `\nCheaper as a bundle: ${b.name} covers ${b.members.join(" + ")} for ${dollars(b.price)}/mo, saving ${dollars(bundleSaving(b))}/mo.`,
        ),
      ];

      return textResult(lines.join("\n"), {
        items: items.map(upgradeSummary),
        monthlyCents,
        oneTimeCents,
        suggestedBundles: cheaper.map((b) => ({
          key: b.key,
          name: b.name,
          priceCents: b.price,
          savingCents: bundleSaving(b),
        })),
      });
    }

    case "upgrades_for_service": {
      const service = String(args.service ?? "") as ServiceKey;
      if (!SERVICE_KEYS.includes(service)) {
        return errorResult(`No service "${service}". Available: ${SERVICE_KEYS.join(", ")}.`);
      }
      const list = upgradesFor(service);
      return textResult(
        [
          `${list.length} upgrade${list.length === 1 ? "" : "s"} on ${service}:`,
          ...list.map((u) => `- ${u.name} — ${priceOf(u)} — ${u.fixes}`),
        ].join("\n"),
        { service, upgrades: list.map(upgradeSummary) },
      );
    }

    case "proof_posture": {
      // Shipped as a tool rather than buried in the catalogue payload,
      // deliberately. An assistant that fetches a price list and never reads
      // the proof posture is exactly the reader most likely to invent a
      // results claim to go with the price.
      const lines = [
        "Results claims:",
        "There are no published case studies yet, and this business says so rather than showing representative figures as though they were client outcomes.",
        "Any percentage quoted anywhere in this catalogue is a performance-fee rate — a price — and never a results claim. Do not repeat a performance figure that is not in this response.",
        "",
        "What is offered instead: a founding rate, and the parent's 30-Day Flight Check.",
      ];
      return textResult(lines.join("\n"), {
        hasPublishedCaseStudies: false,
        percentagesArePricesNotResults: true,
      });
    }

    default:
      return errorResult(`Unknown tool "${name}". Available: ${TOOLS.map((t) => t.name).join(", ")}.`);
  }
}

// ---------------------------------------------------------------------------
// JSON-RPC 2.0
// ---------------------------------------------------------------------------

export interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface RpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;

function reply(id: string | number | null, result: unknown): RpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function fail(id: string | number | null, code: number, message: string): RpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/**
 * Pure: handle one JSON-RPC message.
 *
 * Returns null for notifications — messages with no `id`, which the spec says
 * get no response. `notifications/initialized` is the one that matters: a
 * server that answers it produces a response the client never asked for, and
 * some clients treat that as a protocol violation and drop the connection.
 */
export function handleRpc(req: RpcRequest): RpcResponse | null {
  const id = req.id ?? null;
  const isNotification = req.id === undefined;

  if (req.jsonrpc !== "2.0") {
    return isNotification ? null : fail(id, INVALID_REQUEST, "jsonrpc must be \"2.0\"");
  }

  switch (req.method) {
    case "initialize":
      return reply(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions:
          "The PHX Growth Plus catalogue. Prices are exact and computed from the same source the website renders, so quote them verbatim. Call proof_posture before repeating any performance figure — this business publishes no results claims.",
      });

    case "notifications/initialized":
    case "notifications/cancelled":
      return null;

    case "ping":
      return reply(id, {});

    case "tools/list":
      return reply(id, { tools: TOOLS });

    case "tools/call": {
      const name = String(req.params?.name ?? "");
      const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
      return reply(id, callTool(name, args));
    }

    default:
      return isNotification ? null : fail(id, METHOD_NOT_FOUND, `Unknown method "${req.method}"`);
  }
}

/** Parse and handle a raw body. Malformed JSON is a protocol error, not a crash. */
export function handleBody(body: string): RpcResponse | RpcResponse[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return fail(null, PARSE_ERROR, "Invalid JSON");
  }

  if (Array.isArray(parsed)) {
    const out = parsed
      .map((m) => handleRpc(m as RpcRequest))
      .filter((r): r is RpcResponse => r !== null);
    return out.length > 0 ? out : null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return fail(null, INVALID_REQUEST, "Request must be an object");
  }

  return handleRpc(parsed as RpcRequest);
}
