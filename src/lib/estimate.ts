/**
 * THE ESTIMATOR — a job becomes a priced quote, and nothing is sent unreviewed.
 *
 * DIRECTION
 *   "Set estimates" is the first real job of The Job Runner: read what a
 *   customer wants done, price it off the owner's own rate card, and get a quote
 *   in front of them fast — the speed that wins the job. But a quote is a price
 *   the customer holds the business to, so it is exactly the kind of action the
 *   gate exists for: `quote.send` moves money and is held MANUAL, meaning a named
 *   human releases every quote before it leaves the building.
 *
 * THE LOAD-BEARING IDEA
 *   The model may read the job; it may NEVER price it. Extraction (free text →
 *   line requests) can use Anthropic, because a mistake there is caught at the
 *   gate. Pricing is pure arithmetic over the rate card — `priceEstimate` — so a
 *   number a customer is quoted is the owner's published price times a quantity,
 *   something you can point at and defend, identical whether or not any model is
 *   up. This is the same split spend-watch.ts and gate.ts use, for the same
 *   reason: anything that is a claim about someone's money has to be math.
 *
 * BLUEPRINTS
 *   Pure and tested: `priceEstimate`, `formatEstimateText`, `estimateDedupeKey`,
 *   `formatMoney`. Only `createEstimate`, `estimateFromDescription`, the executor
 *   and registration touch the database or the model.
 */

import { prisma } from "@/lib/prisma";
import { anthropic, ANTHROPIC_MODEL } from "@/lib/anthropic";
import { recordRun } from "@/lib/entitlements";
import { propose, registerExecutor } from "@/lib/gate";
import { postWebhook } from "@/lib/webhooks";
import { env } from "@/lib/env";

export const ESTIMATOR_SLUG = "estimator";
const DAY_MS = 86_400_000;

/** A synthetic line key for the minimum-job bump, so it reads as a real line. */
export const MINIMUM_LINE_KEY = "minimum-job-charge";

export interface RateItem {
  key: string;
  name: string;
  unit: string;
  unitPriceCents: number;
  minPriceCents: number;
  active: boolean;
}

/** What the job asks for, before pricing: a rate-card key and a quantity. */
export interface LineRequest {
  key: string;
  qty: number;
  note?: string;
}

export interface EstimateSettings {
  taxRatePct: number;
  depositPct: number;
  minJobCents?: number | null;
  travelFeeCents: number;
  validDays: number;
}

export interface EstimateLine {
  key: string;
  name: string;
  unit: string;
  qty: number;
  unitPriceCents: number;
  amountCents: number;
}

export interface PricedEstimate {
  lineItems: EstimateLine[];
  subtotalCents: number;
  travelFeeCents: number;
  /** The transparent bump when a job falls under the minimum. 0 if none. */
  minimumAdjustmentCents: number;
  taxCents: number;
  totalCents: number;
  depositCents: number;
  validUntil: Date;
  /** Requests that could not be priced — surfaced, never silently dropped. */
  warnings: string[];
}

/** $1,234.50 from 123450. Pure, so the queue and the email always agree. */
export function formatMoney(cents: number, currency = "USD"): string {
  const sign = cents < 0 ? "-" : "";
  const v = Math.abs(cents) / 100;
  const body = v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === "USD" ? `${sign}$${body}` : `${sign}${body} ${currency}`;
}

/**
 * Price a job. Pure: rate card + requests + settings in, a fully itemised
 * estimate out. No database, no model, no clock beyond the `now` it is handed.
 *
 * Rules, each one a thing a customer could otherwise be wrongly charged for:
 *   - an unknown or inactive service is a warning, not a guessed price;
 *   - a non-positive quantity is skipped, not treated as free work;
 *   - a line never prices below the rate card's per-line floor;
 *   - travel and the minimum-job bump only apply when there is real work;
 *   - the minimum bump is an explicit line, so the customer sees why.
 */
export function priceEstimate({
  rateItems,
  requests,
  settings,
  now,
}: {
  rateItems: RateItem[];
  requests: LineRequest[];
  settings: EstimateSettings;
  now: Date;
}): PricedEstimate {
  const byKey = new Map(rateItems.filter((r) => r.active).map((r) => [r.key, r]));
  const lineItems: EstimateLine[] = [];
  const warnings: string[] = [];

  for (const req of requests) {
    const item = byKey.get(req.key);
    if (!item) {
      warnings.push(`No active rate-card item "${req.key}" — left off the quote.`);
      continue;
    }
    if (!(req.qty > 0)) {
      warnings.push(`Skipped "${item.name}" — quantity was ${req.qty}.`);
      continue;
    }
    const raw = item.unitPriceCents * req.qty;
    const amountCents = Math.max(raw, item.minPriceCents);
    lineItems.push({
      key: item.key,
      name: item.name,
      unit: item.unit,
      qty: req.qty,
      unitPriceCents: item.unitPriceCents,
      amountCents,
    });
  }

  const subtotalCents = lineItems.reduce((s, l) => s + l.amountCents, 0);
  const hasWork = lineItems.length > 0 && subtotalCents > 0;

  const travelFeeCents = hasWork ? Math.max(0, settings.travelFeeCents) : 0;
  const base = subtotalCents + travelFeeCents;
  const minJob = settings.minJobCents ?? 0;
  const minimumAdjustmentCents = hasWork && minJob > base ? minJob - base : 0;

  const taxable = base + minimumAdjustmentCents;
  const taxCents = Math.max(0, Math.round((taxable * settings.taxRatePct) / 100));
  const totalCents = taxable + taxCents;
  const depositCents = Math.max(0, Math.round((totalCents * settings.depositPct) / 100));

  const validUntil = new Date(now.getTime() + Math.max(1, settings.validDays) * DAY_MS);

  return {
    lineItems,
    subtotalCents,
    travelFeeCents,
    minimumAdjustmentCents,
    taxCents,
    totalCents,
    depositCents,
    validUntil,
    warnings,
  };
}

/**
 * The customer-facing quote, in the client's business's name. Pure, so the exact
 * words are visible in the gate queue before anyone releases them — and an
 * Anthropic outage can never change a figure that has already been quoted.
 */
export function formatEstimateText(input: {
  businessName: string;
  customerName?: string | null;
  priced: PricedEstimate;
  currency?: string;
  notes?: string | null;
}): string {
  const { businessName, priced, notes } = input;
  const currency = input.currency ?? "USD";
  const first = (input.customerName ?? "").trim().split(/\s+/)[0] || "there";
  const m = (c: number) => formatMoney(c, currency);

  const lines = priced.lineItems.map(
    (l) => `  • ${l.name} — ${l.qty} ${l.unit} × ${m(l.unitPriceCents)} = ${m(l.amountCents)}`,
  );
  if (priced.travelFeeCents > 0) lines.push(`  • Trip charge — ${m(priced.travelFeeCents)}`);
  if (priced.minimumAdjustmentCents > 0) {
    lines.push(`  • Minimum job charge — ${m(priced.minimumAdjustmentCents)}`);
  }

  const totals = [
    `Subtotal: ${m(priced.subtotalCents + priced.travelFeeCents + priced.minimumAdjustmentCents)}`,
    priced.taxCents > 0 ? `Tax: ${m(priced.taxCents)}` : "",
    `Total: ${m(priced.totalCents)}`,
    priced.depositCents > 0 ? `Deposit to book: ${m(priced.depositCents)}` : "",
  ].filter(Boolean);

  return [
    `Hi ${first},`,
    "",
    `Thanks for the opportunity — here's your estimate from ${businessName}:`,
    "",
    ...lines,
    "",
    ...totals,
    "",
    `This estimate is valid through ${priced.validUntil.toISOString().slice(0, 10)}.`,
    notes ? `\n${notes}` : "",
    "",
    `Reply here or give us a call to get on the schedule.`,
    "",
    `Thanks,\n${businessName}`,
  ]
    .filter((l) => l !== undefined)
    .join("\n");
}

/**
 * Stable idempotency key for a job, so re-quoting the same customer updates the
 * estimate rather than stacking duplicates. Prefers the lead id; falls back to a
 * normalised email or name.
 */
export function estimateDedupeKey(input: {
  leadId?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
}): string {
  const anchor =
    input.leadId ||
    input.customerEmail?.trim().toLowerCase() ||
    input.customerName?.trim().toLowerCase() ||
    "adhoc";
  return `estimate:${anchor}`;
}

// ---------------------------------------------------------------------------
// The impure runner. Nothing below prices anything — the pure layer already did.
// ---------------------------------------------------------------------------

function settingsFrom(client: {
  taxRatePct: number;
  depositPct: number;
  minJobCents: number | null;
  travelFeeCents: number;
  estimateValidDays: number;
}): EstimateSettings {
  return {
    taxRatePct: client.taxRatePct,
    depositPct: client.depositPct,
    minJobCents: client.minJobCents,
    travelFeeCents: client.travelFeeCents,
    validDays: client.estimateValidDays,
  };
}

export type CreateEstimateInput = {
  clientId: string;
  requests: LineRequest[];
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  leadId?: string | null;
  notes?: string | null;
  dedupeKey?: string;
  now?: Date;
};

export type CreateEstimateResult =
  | {
      ok: true;
      estimateId: string;
      priced: PricedEstimate;
      pendingActionId: string;
      warnings: string[];
    }
  | { ok: false; reason: "DISABLED" | "NOTHING_TO_PRICE" | "NO_CLIENT" | "ERROR"; detail?: string; warnings?: string[] };

/**
 * Price a job and queue the quote at the gate. It does not send — `quote.send`
 * is held MANUAL, so the estimate waits for the owner to release it. Idempotent
 * per (client, job): re-quoting updates the row and re-proposes under the same
 * dedupe key rather than duplicating.
 */
export async function createEstimate(input: CreateEstimateInput): Promise<CreateEstimateResult> {
  const now = input.now ?? new Date();

  const client = await prisma.clientProfile.findUnique({
    where: { id: input.clientId },
    select: {
      id: true,
      businessName: true,
      estimatorEnabled: true,
      taxRatePct: true,
      depositPct: true,
      minJobCents: true,
      travelFeeCents: true,
      estimateValidDays: true,
    },
  });
  if (!client) return { ok: false, reason: "NO_CLIENT" };
  if (!client.estimatorEnabled) return { ok: false, reason: "DISABLED" };

  try {
    const rows = await prisma.rateCardItem.findMany({
      where: { clientId: input.clientId, active: true },
    });
    const rateItems: RateItem[] = rows.map((r) => ({
      key: r.key,
      name: r.name,
      unit: r.unit,
      unitPriceCents: r.unitPriceCents,
      minPriceCents: r.minPriceCents,
      active: r.active,
    }));

    const priced = priceEstimate({ rateItems, requests: input.requests, settings: settingsFrom(client), now });
    if (priced.totalCents <= 0) {
      return { ok: false, reason: "NOTHING_TO_PRICE", warnings: priced.warnings };
    }

    const dedupeKey =
      input.dedupeKey ??
      estimateDedupeKey({
        leadId: input.leadId,
        customerEmail: input.customerEmail,
        customerName: input.customerName,
      });

    const estimate = await prisma.estimate.upsert({
      where: { clientId_dedupeKey: { clientId: input.clientId, dedupeKey } },
      update: {
        leadId: input.leadId ?? null,
        customerName: input.customerName ?? null,
        customerEmail: input.customerEmail ?? null,
        customerPhone: input.customerPhone ?? null,
        status: "QUEUED",
        lineItems: priced.lineItems as unknown as object,
        subtotalCents: priced.subtotalCents,
        travelFeeCents: priced.travelFeeCents,
        taxCents: priced.taxCents,
        totalCents: priced.totalCents,
        depositCents: priced.depositCents,
        validUntil: priced.validUntil,
        notes: input.notes ?? null,
      },
      create: {
        clientId: input.clientId,
        leadId: input.leadId ?? null,
        customerName: input.customerName ?? null,
        customerEmail: input.customerEmail ?? null,
        customerPhone: input.customerPhone ?? null,
        status: "QUEUED",
        lineItems: priced.lineItems as unknown as object,
        subtotalCents: priced.subtotalCents,
        travelFeeCents: priced.travelFeeCents,
        taxCents: priced.taxCents,
        totalCents: priced.totalCents,
        depositCents: priced.depositCents,
        validUntil: priced.validUntil,
        notes: input.notes ?? null,
        dedupeKey,
      },
    });

    const message = {
      subject: `Your estimate from ${client.businessName}`,
      body: formatEstimateText({
        businessName: client.businessName,
        customerName: input.customerName,
        priced,
        notes: input.notes,
      }),
    };

    const action = await propose({
      clientId: input.clientId,
      kind: "quote.send",
      summary: `Send ${input.customerName ?? "customer"} a quote for ${formatMoney(priced.totalCents)}`,
      subject: input.customerName ?? input.customerEmail ?? "New estimate",
      payload: {
        estimateId: estimate.id,
        clientId: input.clientId,
        customerName: input.customerName ?? null,
        email: input.customerEmail ?? null,
        phone: input.customerPhone ?? null,
        totalCents: priced.totalCents,
        message,
      },
      dedupeKey: `quote:${dedupeKey}`,
      now,
    });

    await prisma.estimate.update({
      where: { id: estimate.id },
      data: { pendingActionId: action.id },
    });

    return {
      ok: true,
      estimateId: estimate.id,
      priced,
      pendingActionId: action.id,
      warnings: priced.warnings,
    };
  } catch (err) {
    console.error(`[estimate] createEstimate failed for ${input.clientId}:`, err);
    return { ok: false, reason: "ERROR", detail: (err as Error).message };
  }
}

const EXTRACT_INSTRUCTION = [
  "You turn a plain-English job description into line requests against a fixed rate card.",
  "Respond with ONLY a fenced ```json block: { \"requests\": [{ \"key\": \"<rate-card key>\", \"qty\": <number> }], \"customerName\": <string|null>, \"notes\": <string|null> }.",
  "Use ONLY keys from the rate card provided. If the job mentions work with no matching key, put it in notes rather than inventing a key. Never invent prices — you only choose keys and quantities.",
].join(" ");

function parseRequests(text: string, validKeys: Set<string>): { requests: LineRequest[]; customerName: string | null; notes: string | null } {
  const empty = { requests: [] as LineRequest[], customerName: null, notes: null };
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return empty;
  try {
    const obj = JSON.parse(candidate) as Record<string, unknown>;
    const raw = Array.isArray(obj.requests) ? obj.requests : [];
    const requests = raw
      .map((r) => r as Record<string, unknown>)
      .filter((r) => typeof r.key === "string" && validKeys.has(r.key))
      .map((r) => ({ key: r.key as string, qty: Number(r.qty) || 0 }))
      .filter((r) => r.qty > 0);
    return {
      requests,
      customerName: typeof obj.customerName === "string" ? obj.customerName : null,
      notes: typeof obj.notes === "string" ? obj.notes : null,
    };
  } catch {
    return empty;
  }
}

/**
 * The Estimator bot: turn a free-text job (a call summary, a form message) into
 * a priced, gated quote. The model only maps words to rate-card keys and
 * quantities; `createEstimate` does the arithmetic. Metered like any agent run.
 */
export async function estimateFromDescription(input: {
  clientId: string;
  description: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  leadId?: string | null;
  now?: Date;
}): Promise<CreateEstimateResult> {
  const client = await prisma.clientProfile.findUnique({
    where: { id: input.clientId },
    select: { id: true, estimatorEnabled: true },
  });
  if (!client) return { ok: false, reason: "NO_CLIENT" };
  if (!client.estimatorEnabled) return { ok: false, reason: "DISABLED" };

  const rateItems = await prisma.rateCardItem.findMany({
    where: { clientId: input.clientId, active: true },
    select: { key: true, name: true, unit: true, unitPriceCents: true },
  });
  if (rateItems.length === 0) {
    return { ok: false, reason: "NOTHING_TO_PRICE", detail: "No rate card configured." };
  }

  const catalogue = rateItems
    .map((r) => `${r.key} — ${r.name} (${r.unit}, ${formatMoney(r.unitPriceCents)})`)
    .join("\n");

  let requests: LineRequest[] = [];
  let extractedName: string | null = null;
  let notes: string | null = null;
  try {
    const res = await anthropic().messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 600,
      system: `${EXTRACT_INSTRUCTION}\n\nRate card:\n${catalogue}`,
      messages: [{ role: "user", content: input.description }],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const parsed = parseRequests(text, new Set(rateItems.map((r) => r.key)));
    requests = parsed.requests;
    extractedName = parsed.customerName;
    notes = parsed.notes;
    await recordRun(input.clientId, ESTIMATOR_SLUG, res.usage.input_tokens, res.usage.output_tokens);
  } catch (err) {
    console.error(`[estimate] extraction failed for ${input.clientId}:`, err);
    return { ok: false, reason: "ERROR", detail: (err as Error).message };
  }

  if (requests.length === 0) {
    return { ok: false, reason: "NOTHING_TO_PRICE", detail: "Nothing in the job matched the rate card." };
  }

  return createEstimate({
    clientId: input.clientId,
    requests,
    customerName: input.customerName ?? extractedName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
    leadId: input.leadId,
    notes,
    now: input.now,
  });
}

// ---------------------------------------------------------------------------
// The executor — the only code that sends a quote, and only a released one.
// ---------------------------------------------------------------------------

interface DeliverEstimatePayload {
  estimateId: string;
  clientId: string;
  customerName: string | null;
  email: string | null;
  phone: string | null;
  message: { subject: string; body: string };
}

/**
 * Deliver a released quote through the client's own channel, then mark the
 * estimate SENT. Like The Comeback, it throws when no channel is wired rather
 * than reporting a success that did not happen — the gate records that plainly.
 */
export async function deliverEstimate(payload: unknown): Promise<Record<string, unknown>> {
  const p = payload as DeliverEstimatePayload;
  const to = p.email ?? p.phone ?? null;
  if (!to) throw new Error("This customer has no email or phone on file; the quote could not be sent.");

  const body = {
    source: "estimate",
    clientId: p.clientId,
    estimateId: p.estimateId,
    to: { name: p.customerName, email: p.email, phone: p.phone },
    subject: p.message.subject,
    message: p.message.body,
    at: new Date().toISOString(),
  };

  const crm = await prisma.webhookConfig.findFirst({
    where: { clientId: p.clientId, enabled: true },
    orderBy: { createdAt: "asc" },
    select: { url: true, label: true },
  });

  let channel: string;
  if (crm) {
    const ok = await postWebhook(crm.url, body, { label: "estimate-crm" });
    if (!ok) throw new Error(`The CRM webhook (${crm.label}) did not accept the quote; nothing was sent.`);
    channel = "crm-webhook";
  } else {
    const ok = await postWebhook(env.zapierOnboardHook, body, { label: "estimate-hook" });
    if (!ok) {
      throw new Error(
        "No delivery channel is wired for estimates. Connect a CRM webhook so quotes can reach customers.",
      );
    }
    channel = "automation-hook";
  }

  await prisma.estimate.update({ where: { id: p.estimateId }, data: { status: "SENT" } });
  return { channel, to };
}

/** Wire the Estimator's executor into the gate. Called from the sweep cron. */
export function registerEstimateExecutors(): void {
  registerExecutor("quote.send", deliverEstimate);
}
