/**
 * QUICKBOOKS ONLINE.
 *
 * The one first-party adapter, because it is the one that changes a client's
 * day. Everything else in the world gets the signed event stream; QuickBooks
 * gets an estimate that actually appears in the books with line items on it.
 *
 * WHAT IT WRITES, AND WHAT IT REFUSES TO
 *   Only `estimate.sent` and `lead.received`. An estimate that was spoken on a
 *   call and never released is not an accounting record — putting it in the
 *   books would mean the queue's promise ("nothing that moves money acts
 *   without a named release") was true of the customer's inbox and false of
 *   their ledger.
 *
 * WHAT IS PURE HERE
 *   The mapping — `estimateLines`, `customerName`, `estimatePayload` — is
 *   pure, so the shape we would send is testable without an Intuit account,
 *   which matters because this project does not have one.
 *
 * STATUS
 *   Written against Intuit's documented Accounting v3 API. Never run against a
 *   live company file. That sentence is on the connections screen too; see the
 *   honesty rule in `connectors.ts`.
 */

const MINOR_VERSION = "70";

export interface QuickBooksConfig {
  realmId: string;
  refreshToken: string;
  /** Cached so we are not exchanging a refresh token on every single event. */
  accessToken?: string;
  accessTokenExpiresAt?: string;
  environment: "sandbox" | "production";
}

export function apiBase(env: QuickBooksConfig["environment"]): string {
  return env === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

// ---------------------------------------------------------------------------
// Mapping — pure, and the part worth testing
// ---------------------------------------------------------------------------

export interface QboLine {
  DetailType: "SalesItemLineDetail";
  Amount: number;
  Description?: string;
  SalesItemLineDetail: { Qty?: number; UnitPrice?: number };
}

/**
 * Turn our estimate lines into QuickBooks lines.
 *
 * Two things this deliberately does not do:
 *
 *   - It does not invent an ItemRef. QuickBooks will happily take a line with
 *     no item and put the description on the estimate; guessing at the client's
 *     chart of items would put revenue against the wrong account, which is a
 *     bookkeeping problem they would find in April rather than today.
 *   - It does not round. Our totals are integer cents and QuickBooks wants
 *     dollars; dividing by 100 is exact, and any "tidying" here would make the
 *     estimate in the books disagree with the one the customer holds.
 */
export function estimateLines(data: Record<string, unknown>): QboLine[] {
  const raw = Array.isArray(data.lines) ? (data.lines as Record<string, unknown>[]) : [];
  const lines = raw
    .map((l) => {
      const cents = numeric(l.totalCents ?? l.amountCents ?? l.cents);
      if (cents === null) return null;
      const qty = numeric(l.quantity ?? l.qty);
      const unit = numeric(l.unitCents ?? l.rateCents);
      const line: QboLine = {
        DetailType: "SalesItemLineDetail",
        Amount: cents / 100,
        Description: String(l.label ?? l.description ?? "Work"),
        SalesItemLineDetail: {},
      };
      if (qty !== null) line.SalesItemLineDetail.Qty = qty;
      if (unit !== null) line.SalesItemLineDetail.UnitPrice = unit / 100;
      return line;
    })
    .filter((l): l is QboLine => l !== null);

  if (lines.length > 0) return lines;

  // No breakdown reached us, but a total did. One line beats no estimate: an
  // owner can split it in QuickBooks, but cannot conjure a document that was
  // never created.
  const total = numeric(data.totalCents ?? data.total);
  if (total === null) return [];
  return [
    {
      DetailType: "SalesItemLineDetail",
      Amount: total / 100,
      Description: String(data.job ?? data.jobDescription ?? "Work"),
      SalesItemLineDetail: {},
    },
  ];
}

function numeric(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/**
 * The name to look the customer up by.
 *
 * QuickBooks' DisplayName is unique per company file, so the fallback chain
 * matters: a name if we have one, otherwise the phone number, otherwise a
 * marker that reads as deliberate in a customer list rather than as a bug.
 */
export function customerName(data: Record<string, unknown>): string {
  const customer = (data.customer ?? {}) as Record<string, unknown>;
  const name = str(customer.name) ?? str(data.customerName);
  if (name) return name.slice(0, 100);
  const phone = str(customer.phone) ?? str(data.customerPhone);
  if (phone) return `Caller ${phone}`.slice(0, 100);
  return "Unnamed caller";
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export function customerPayload(data: Record<string, unknown>): Record<string, unknown> {
  const customer = (data.customer ?? {}) as Record<string, unknown>;
  const phone = str(customer.phone) ?? str(data.customerPhone);
  const email = str(customer.email);
  const address = str(customer.address) ?? str(data.customerAddress);
  return {
    DisplayName: customerName(data),
    ...(phone ? { PrimaryPhone: { FreeFormNumber: phone } } : {}),
    ...(email ? { PrimaryEmailAddr: { Address: email } } : {}),
    ...(address ? { BillAddr: { Line1: address.slice(0, 500) } } : {}),
  };
}

/**
 * The Estimate body.
 *
 * `DocNumber` is not set on purpose — QuickBooks assigns it, and a duplicate
 * DocNumber is a hard 400 that would fail the delivery permanently for a reason
 * that has nothing to do with us.
 */
export function estimatePayload(
  data: Record<string, unknown>,
  customerRefId: string,
): Record<string, unknown> {
  const memoBits = [
    str(data.job) ?? str(data.jobDescription),
    str(data.releasedBy) ? `Released by ${str(data.releasedBy)}` : null,
    "Created from a phone estimate.",
  ].filter(Boolean);

  return {
    CustomerRef: { value: customerRefId },
    Line: estimateLines(data),
    CustomerMemo: { value: memoBits.join(" — ").slice(0, 1000) },
    ...(str(data.customerEmail) ? { BillEmail: { Address: str(data.customerEmail) } } : {}),
  };
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

export interface QboResult {
  ok: boolean;
  /** HTTP-ish status so the outbox can decide whether to retry. */
  status: number;
  detail: string;
  /** Set on success — what to show the owner. */
  ref?: string;
  /** Set when the refresh token rotated and the stored config must be updated. */
  config?: QuickBooksConfig;
}

/**
 * Exchange the refresh token for an access token.
 *
 * Intuit rotates the refresh token on every exchange and expires the old one
 * after a grace period, so the new one has to be written back or the connection
 * dies quietly in a hundred days. `QboResult.config` carries it out.
 */
export async function refreshAccess(
  cfg: QuickBooksConfig,
  creds: { clientId: string; clientSecret: string },
): Promise<{ ok: true; config: QuickBooksConfig } | { ok: false; status: number; detail: string }> {
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: cfg.refreshToken,
    }).toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      detail:
        res.status === 400 || res.status === 401
          ? "QuickBooks rejected the refresh token. It has expired or been revoked — reconnect the company."
          : `QuickBooks token exchange failed (${res.status}): ${text.slice(0, 300)}`,
    };
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ok: false, status: 502, detail: "QuickBooks returned a token response we could not read." };
  }

  const access = typeof body.access_token === "string" ? body.access_token : null;
  if (!access) return { ok: false, status: 502, detail: "QuickBooks returned no access token." };

  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 3600;
  return {
    ok: true,
    config: {
      ...cfg,
      accessToken: access,
      // A minute of headroom, so a token that expires mid-request does not fail
      // a delivery that would have worked.
      accessTokenExpiresAt: new Date(Date.now() + (expiresIn - 60) * 1000).toISOString(),
      refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : cfg.refreshToken,
    },
  };
}

export function accessTokenIsFresh(cfg: QuickBooksConfig, now = new Date()): boolean {
  if (!cfg.accessToken || !cfg.accessTokenExpiresAt) return false;
  return new Date(cfg.accessTokenExpiresAt).getTime() > now.getTime();
}

async function qboFetch(
  cfg: QuickBooksConfig,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<{ status: number; body: Record<string, unknown>; text: string }> {
  const url = `${apiBase(cfg.environment)}/v3/company/${encodeURIComponent(cfg.realmId)}/${path}${
    path.includes("?") ? "&" : "?"
  }minorversion=${MINOR_VERSION}`;

  const res = await fetch(url, {
    method: init.method,
    headers: {
      authorization: `Bearer ${cfg.accessToken}`,
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });

  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    /* left empty — `text` is what gets reported */
  }
  return { status: res.status, body, text };
}

/** Find a customer by DisplayName, or create one. */
async function findOrCreateCustomer(
  cfg: QuickBooksConfig,
  data: Record<string, unknown>,
): Promise<{ ok: true; id: string } | { ok: false; status: number; detail: string }> {
  const name = customerName(data);
  // Escaped for the QBO query language, which is SQL-shaped and takes single
  // quotes. A customer called O'Brien would otherwise produce a 400 forever.
  const escaped = name.replace(/'/g, "\\'");
  const found = await qboFetch(cfg, `query?query=${encodeURIComponent(`select Id from Customer where DisplayName = '${escaped}'`)}`, {
    method: "GET",
  });

  if (found.status === 200) {
    const qr = (found.body.QueryResponse ?? {}) as Record<string, unknown>;
    const rows = Array.isArray(qr.Customer) ? (qr.Customer as Record<string, unknown>[]) : [];
    const id = rows[0]?.Id;
    if (typeof id === "string") return { ok: true, id };
  } else if (found.status !== 400) {
    return { ok: false, status: found.status, detail: `Customer lookup failed: ${found.text.slice(0, 300)}` };
  }

  const created = await qboFetch(cfg, "customer", { method: "POST", body: customerPayload(data) });
  const customer = (created.body.Customer ?? {}) as Record<string, unknown>;
  if (created.status === 200 && typeof customer.Id === "string") {
    return { ok: true, id: customer.Id };
  }
  return {
    ok: false,
    status: created.status,
    detail: `Could not create the customer in QuickBooks: ${created.text.slice(0, 300)}`,
  };
}

/**
 * Push one event into QuickBooks.
 *
 * Returns rather than throws, because the caller is the outbox and it needs a
 * status to decide whether this is worth another attempt.
 */
export async function pushToQuickBooks(
  cfg: QuickBooksConfig,
  event: { type: string; data: Record<string, unknown> },
  creds: { clientId: string; clientSecret: string },
): Promise<QboResult> {
  let config = cfg;

  if (!accessTokenIsFresh(config)) {
    const refreshed = await refreshAccess(config, creds);
    if (!refreshed.ok) return { ok: false, status: refreshed.status, detail: refreshed.detail };
    config = refreshed.config;
  }

  const customer = await findOrCreateCustomer(config, event.data);
  if (!customer.ok) return { ok: false, status: customer.status, detail: customer.detail, config };

  if (event.type === "lead.received") {
    return {
      ok: true,
      status: 200,
      detail: `Customer ${customerName(event.data)} is in QuickBooks.`,
      ref: customer.id,
      config,
    };
  }

  const lines = estimateLines(event.data);
  if (lines.length === 0) {
    // A permanent refusal, not a retry. Sending an empty estimate would create
    // a zero-dollar document in the books that somebody has to go delete.
    return {
      ok: false,
      status: 422,
      detail: "The estimate had no priced lines and no total, so there was nothing to write to QuickBooks.",
      config,
    };
  }

  const created = await qboFetch(config, "estimate", {
    method: "POST",
    body: estimatePayload(event.data, customer.id),
  });
  const estimate = (created.body.Estimate ?? {}) as Record<string, unknown>;
  if (created.status === 200 && estimate.Id) {
    return {
      ok: true,
      status: 200,
      detail: `Estimate ${String(estimate.DocNumber ?? estimate.Id)} created in QuickBooks.`,
      ref: String(estimate.Id),
      config,
    };
  }

  return {
    ok: false,
    status: created.status,
    detail: `QuickBooks refused the estimate (${created.status}): ${created.text.slice(0, 300)}`,
    config,
  };
}
