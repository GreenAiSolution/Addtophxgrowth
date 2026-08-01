/**
 * THE CONNECTOR REGISTRY.
 *
 * DIRECTION
 *   A business does not want "an integration". It wants the thing it already
 *   pays for — QuickBooks, its CRM, its scheduler — to know what the operator
 *   just did, without anybody retyping it. There are two honest ways to give
 *   them that, and this file holds both:
 *
 *     1. **One signed event stream.** Anything that can receive an HTTP POST
 *        can subscribe. Zapier, Make and n8n turn that stream into the other
 *        9,000 tools without us writing 9,000 adapters, and a client's own
 *        developer can point it at their own endpoint in ten minutes.
 *
 *     2. **A small number of first-party adapters** for the tools worth doing
 *        properly. QuickBooks is the one that earns it, because an estimate
 *        that lands in the books as a real QBO Estimate is worth more than a
 *        webhook the bookkeeper has to read.
 *
 * WHAT THIS FILE IS NOT
 *   It does not talk to a network and it does not touch a database. It declares
 *   what each destination is, what it can accept, and how an event is shaped on
 *   the way in. `event-bus.ts` does the delivering; `quickbooks.ts` does the
 *   one adapter that needs more than a POST.
 *
 * HONESTY RULE
 *   `verified` on a connector means the path has been exercised end to end
 *   against the real destination. Where it has not, it says so, and the
 *   connections screen prints that sentence next to the button. A client
 *   finding out at 4pm on a Friday that "connected" meant "written but never
 *   run against a live company file" is the kind of thing that ends an account.
 */

import { randomBytes } from "node:crypto";
import type { BusinessEvent, EventType } from "@/lib/events";
import { EVENT_CATALOGUE } from "@/lib/events";

export type ConnectorId = "webhook" | "zapier" | "make" | "n8n" | "quickbooks";

/** How a destination is shaped on the wire. */
export type DeliveryStyle =
  /** A signed POST of the event envelope. */
  | "envelope"
  /** A signed POST of a flat object — what no-code catch hooks actually want. */
  | "flat"
  /** Handled by a first-party adapter rather than a POST. */
  | "adapter";

export interface ConnectorField {
  key: "url" | "realmId" | "refreshToken" | "environment";
  label: string;
  /** Shown under the input. Written for an owner, not an engineer. */
  hint: string;
  required: boolean;
  /** True for anything that must never be rendered back onto a screen. */
  secret?: boolean;
}

export interface Connector {
  id: ConnectorId;
  name: string;
  tagline: string;
  /** What the client gets, in their language. Rendered as a list. */
  does: string[];
  style: DeliveryStyle;
  fields: ConnectorField[];
  /** Which events this destination can accept. "all" means the whole catalogue. */
  accepts: EventType[] | "all";
  setup: string[];
  /**
   * Whether this exact path has been run against the live destination.
   * See the honesty rule at the top of this file.
   */
  verified: boolean;
  unverifiedNote?: string;
  docsUrl?: string;
  /**
   * Where to send the owner when the destination does OAuth.
   *
   * Present means the connection is a button: we hold the app registration and
   * they click yes. Absent means the fields above have to be filled in by hand,
   * which for anything but a URL is a cliff most small businesses fall off.
   */
  oauthStart?: string;
  /** Env vars this deployment needs before `oauthStart` will work. */
  requiresEnv?: string[];
}

export const CONNECTORS: Connector[] = [
  {
    id: "webhook",
    name: "Any system (signed webhook)",
    tagline: "One URL. Everything that happens, signed, in JSON.",
    does: [
      "Sends every event you pick to a URL you control.",
      "Signs each request the way Stripe does, so your developer can prove it came from us.",
      "Retries six times over about a day if your endpoint is down.",
    ],
    style: "envelope",
    fields: [
      {
        key: "url",
        label: "Your endpoint",
        hint: "Where we POST. Must be https. Answer with any 2xx and we call it delivered.",
        required: true,
      },
    ],
    accepts: "all",
    setup: [
      "Paste the https URL that should receive the events.",
      "Copy the signing secret shown once when you save — we cannot show it again.",
      "Verify the X-Phx-Signature header the way you would a Stripe webhook.",
      "Send a test event from this page and confirm you got a 2xx back.",
    ],
    verified: true,
  },
  {
    id: "zapier",
    name: "Zapier",
    tagline: "Reach 8,000 apps without anybody writing code.",
    does: [
      "Fires a Zap the moment a call ends, an estimate is released or a visit is booked.",
      "Sends a flat payload, which is the shape Zapier's field picker actually reads.",
      "Works with whatever your team already runs — Sheets, Slack, Jobber, HubSpot.",
    ],
    style: "flat",
    fields: [
      {
        key: "url",
        label: "Catch Hook URL",
        hint: "From Zapier: new Zap → trigger → Webhooks by Zapier → Catch Hook. Copy the URL it gives you.",
        required: true,
      },
    ],
    accepts: "all",
    setup: [
      "In Zapier, start a Zap with the Webhooks by Zapier trigger, Catch Hook.",
      "Paste its URL here and save.",
      "Send a test event from this page so Zapier has a sample to map fields from.",
      "Build the rest of the Zap against those fields.",
    ],
    verified: true,
  },
  {
    id: "make",
    name: "Make",
    tagline: "Same stream, Make's scenario builder.",
    does: [
      "Starts a scenario on any event you choose.",
      "Flat payload so Make's data mapper picks the fields up first time.",
    ],
    style: "flat",
    fields: [
      {
        key: "url",
        label: "Custom webhook URL",
        hint: "From Make: add a Webhooks → Custom webhook module and copy its address.",
        required: true,
      },
    ],
    accepts: "all",
    setup: [
      "Add a Custom webhook module in Make and copy the URL.",
      "Paste it here and save.",
      "Click Determine data structure in Make, then send a test event from this page.",
    ],
    verified: true,
  },
  {
    id: "n8n",
    name: "n8n",
    tagline: "For teams running their own automation server.",
    does: [
      "POSTs the full event envelope to an n8n Webhook node.",
      "Keeps the nested shape, because n8n handles it and your workflows will want it.",
    ],
    style: "envelope",
    fields: [
      {
        key: "url",
        label: "Webhook node URL",
        hint: "The production URL from your n8n Webhook node, not the test one.",
        required: true,
      },
    ],
    accepts: "all",
    setup: [
      "Add a Webhook node in n8n, method POST, and activate the workflow.",
      "Paste the production URL here.",
      "Send a test event and check the execution appears.",
    ],
    verified: true,
  },
  {
    id: "quickbooks",
    name: "QuickBooks Online",
    tagline: "Released estimates land in the books as real QuickBooks estimates.",
    does: [
      "Creates a QuickBooks Estimate when you release one at the queue — line items, totals and all.",
      "Finds the customer by name, and creates them if they are new.",
      "Never writes anything from a price said on a call. Only what a person released.",
    ],
    style: "adapter",
    // Nothing to type. The owner presses a button, approves on Intuit's own
    // screen and comes back connected — see `oauthStart` below.
    fields: [],
    // The gate decides what reaches the books. An estimate that was only spoken
    // on a call is not an accounting record, so `estimate.created` is not here.
    accepts: ["estimate.sent", "lead.received"],
    setup: [
      "Press Connect. You will land on Intuit's own sign-in page.",
      "Pick the company you keep your books in and approve the connection.",
      "You come straight back here — there is nothing to copy or paste.",
      "Release one estimate at the queue and check it appears in QuickBooks.",
    ],
    oauthStart: "/api/connectors/quickbooks/start",
    requiresEnv: ["QUICKBOOKS_CLIENT_ID", "QUICKBOOKS_CLIENT_SECRET"],
    verified: false,
    unverifiedNote:
      "Written against Intuit's documented v3 API but never run against a live company file — " +
      "there are no Intuit credentials in this project. Treat the first release as a test: " +
      "check the estimate in QuickBooks before you trust the next one.",
    docsUrl: "https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/estimate",
  },
];

export function connectorById(id: string): Connector | undefined {
  return CONNECTORS.find((c) => c.id === id);
}

/** Event types a connector will accept, resolved against the catalogue. */
export function acceptedEvents(connector: Connector): EventType[] {
  if (connector.accepts === "all") return EVENT_CATALOGUE.map((e) => e.type);
  return connector.accepts;
}

/**
 * Whether a connection wants a given event.
 *
 * An empty subscription list means "everything this connector accepts" rather
 * than "nothing". A client who connects Zapier and never opens the checkbox
 * list should get events, not silence — silence is indistinguishable from a
 * broken integration, and they will not report it, they will just leave.
 */
export function wantsEvent(
  connector: Connector,
  subscribed: string[],
  type: EventType,
): boolean {
  const allowed = acceptedEvents(connector);
  if (!allowed.includes(type)) return false;
  if (subscribed.length === 0) return true;
  return subscribed.includes(type);
}

// ---------------------------------------------------------------------------
// Shaping
// ---------------------------------------------------------------------------

/**
 * Flatten an event for the no-code tools.
 *
 * Zapier and Make build their field pickers from the first sample they see. A
 * nested object gives them `data` as one lump the user cannot map, so anything
 * routed at those two gets dotted keys instead: `data.customer.name` becomes
 * `customer.name`, and arrays are joined rather than indexed, because a field
 * picker offering `lines.0.label` through `lines.7.label` is a field picker
 * nobody can build a Zap against.
 */
export function flattenEvent(event: BusinessEvent): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: event.id,
    type: event.type,
    version: event.version,
    occurredAt: event.occurredAt,
    clientId: event.clientId,
  };
  if (event.businessName) out.business = event.businessName;
  walk(event.data, "", out);
  return out;
}

function walk(value: unknown, prefix: string, out: Record<string, unknown>): void {
  if (value === null || value === undefined) {
    if (prefix) out[prefix] = null;
    return;
  }
  if (Array.isArray(value)) {
    // Objects in an array get summarised to one line each. Scalars join.
    out[prefix] = value
      .map((v) => (v && typeof v === "object" ? summarise(v as Record<string, unknown>) : String(v)))
      .join(", ");
    out[`${prefix}.count`] = value.length;
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      walk(v, prefix ? `${prefix}.${k}` : k, out);
    }
    return;
  }
  out[prefix] = value;
}

function summarise(o: Record<string, unknown>): string {
  const bits = Object.entries(o)
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== "object")
    .map(([k, v]) => `${k}=${String(v)}`);
  return bits.join(" ");
}

/** The body a given destination gets, as a string ready to sign and send. */
export function bodyFor(connector: Connector, event: BusinessEvent): string {
  if (connector.style === "flat") return JSON.stringify(flattenEvent(event));
  return JSON.stringify(event);
}

// ---------------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------------

/**
 * A signing secret, shown once.
 *
 * Prefixed so that a secret pasted into a support ticket is recognisable as
 * ours and can be revoked, rather than sitting in a thread looking like noise.
 */
export function newSigningSecret(): string {
  return `phxwh_${randomBytes(24).toString("hex")}`;
}

/** What a URL has to satisfy before we will ever POST to it. */
export function validateEndpoint(raw: string): { ok: true; url: string } | { ok: false; why: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { ok: false, why: "That is not a URL. It needs to start with https://" };
  }
  if (parsed.protocol !== "https:") {
    // Not pedantry: the body carries customer names, phone numbers and prices.
    return { ok: false, why: "Only https endpoints are allowed — these payloads carry customer details." };
  }
  const host = parsed.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (blocked) {
    // A URL pointing back inside our own network turns the connections screen
    // into a request forgery tool. Refused by name rather than by timeout.
    return { ok: false, why: "That address is inside a private network, so nothing outside could reach it anyway." };
  }
  return { ok: true, url: parsed.toString() };
}
