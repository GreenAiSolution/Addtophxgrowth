/**
 * ESTIMATES — what the operator is allowed to say a job costs.
 *
 * DIRECTION
 *   "Qualification, quoting rules and calendar booking handled on the call."
 *   Quoting is the line in that promise with teeth: a number said out loud is
 *   the number the customer holds the business to, and they will hold them to
 *   it whether or not a model was confident.
 *
 * THE LOAD-BEARING IDEA
 *   The model never does the arithmetic, and it never chooses the number.
 *
 *   It extracts what the caller said into quantities; this file prices them
 *   from the client's own price book with integer cents; and the result is
 *   handed back as one fixed string the prompt permits it to say. Anything the
 *   book cannot price returns a refusal with a reason, and a refusal is a good
 *   outcome — a booked estimate visit beats a wrong price by more than a wrong
 *   price beats silence.
 *
 *   Above `maxSpokenTotalCents` nothing is quoted on the phone at all. Big jobs
 *   are where a bad guess stops being an awkward phone call and starts being a
 *   dispute, and they are also the jobs an owner most wants to price
 *   themselves.
 *
 * A quote leaving in writing is a separate act, and it goes through the gate as
 * `estimate.send` — money-moving, so a named human releases it.
 */

import { z } from "zod";

export type Unit = "each" | "hour" | "sqft" | "linear_ft" | "day" | "fixed";

export const UNIT_LABELS: Record<Unit, string> = {
  each: "each",
  hour: "per hour",
  sqft: "per sq ft",
  linear_ft: "per linear ft",
  day: "per day",
  fixed: "flat",
};

export const priceItemSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/, "An item key is lowercase letters, digits and underscores."),
  label: z.string().min(1).max(120),
  unit: z.enum(["each", "hour", "sqft", "linear_ft", "day", "fixed"]),
  /** Cents per unit. Integers only — floating-point money is a bug with a delay. */
  rateCents: z.number().int().min(0),
  /** Billed minimum for this item however small the job. */
  minQty: z.number().min(0).default(0),
  /** Words a caller might use for this, matched when the model names a key wrong. */
  aliases: z.array(z.string().min(1).max(60)).default([]),
});
export type PriceItem = z.infer<typeof priceItemSchema>;

export const modifierSchema = z.object({
  key: z.string().min(1).max(40),
  label: z.string().min(1).max(120),
  kind: z.enum(["percent", "flat"]),
  /** Percent as whole points (25 = +25%), or flat cents. Negative for discounts. */
  amount: z.number().int(),
});
export type Modifier = z.infer<typeof modifierSchema>;

export const priceBookSchema = z.object({
  currency: z.string().length(3).default("USD"),
  /** Charged once per visit, before anything else. */
  callOutFeeCents: z.number().int().min(0).default(0),
  /** No job is priced below this, whatever the line items add to. */
  minimumJobCents: z.number().int().min(0).default(0),
  items: z.array(priceItemSchema).max(80).default([]),
  modifiers: z.array(modifierSchema).max(20).default([]),
  travel: z
    .object({
      includedMiles: z.number().min(0).default(0),
      perMileCents: z.number().int().min(0).default(0),
    })
    .default({ includedMiles: 0, perMileCents: 0 }),
  /**
   * How wide a spoken range is, in percent either side of the computed total.
   * A single figure on a phone call is a promise nobody can keep from a
   * description; a range is honest about what a description can support.
   */
  rangeSpreadPct: z.number().int().min(0).max(60).default(20),
  /** Above this, the operator books a visit instead of quoting. 0 = no cap. */
  maxSpokenTotalCents: z.number().int().min(0).default(0),
  /** Said after every spoken price. Editable, never omitted. */
  disclaimer: z
    .string()
    .max(300)
    .default("That's an estimate from what you've described — we confirm the final price in writing."),
});
export type PriceBook = z.infer<typeof priceBookSchema>;

export function emptyPriceBook(): PriceBook {
  return priceBookSchema.parse({});
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export interface RequestedLine {
  /** Item key, or whatever the caller called it — `resolveItem` handles both. */
  item: string;
  qty: number;
  /** True when the caller measured it, false when they guessed. Moves confidence. */
  measured?: boolean;
}

export interface EstimateRequest {
  lines: RequestedLine[];
  /** Modifier keys the call established — "second storey", "weekend". */
  modifiers?: string[];
  milesFromBase?: number;
}

export interface EstimateLine {
  key: string;
  label: string;
  unit: Unit;
  qty: number;
  /** Quantity actually billed, after the item's minimum. */
  billedQty: number;
  rateCents: number;
  totalCents: number;
  /** Set when the item's minimum raised the billed quantity. */
  note?: string;
}

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export interface Estimate {
  ok: true;
  currency: string;
  lines: EstimateLine[];
  callOutFeeCents: number;
  travelCents: number;
  modifiersApplied: { key: string; label: string; deltaCents: number }[];
  subtotalCents: number;
  totalCents: number;
  lowCents: number;
  highCents: number;
  confidence: Confidence;
  /** Why the confidence is what it is, in the owner's language. */
  confidenceWhy: string;
  /** The one sentence the operator is permitted to say. */
  spoken: string;
  /** True when the minimum job value, not the line items, set the total. */
  minimumApplied: boolean;
}

export type EstimateRefusal = {
  ok: false;
  code: "EMPTY_BOOK" | "UNKNOWN_ITEM" | "NO_QUANTITY" | "ABOVE_SPOKEN_CAP" | "NOTHING_REQUESTED";
  /** Said to the caller. Never mentions a book, a cap or a system. */
  spoken: string;
  /** Written on the record for the owner. Says exactly what was missing. */
  why: string;
  /** Always true. A refusal is a handover, not a dead end. */
  escalate: true;
};

export type EstimateResult = Estimate | EstimateRefusal;

/**
 * Find an item by key, then by alias, then by loose label match.
 *
 * The three-step fallback exists because the extractor is a language model and
 * will confidently return `gutter_clean` for an item keyed `gutter_cleaning`.
 * Refusing that is technically correct and commercially stupid.
 */
export function resolveItem(book: PriceBook, name: string): PriceItem | undefined {
  const n = name.toLowerCase().trim();
  if (!n) return undefined;

  const byKey = book.items.find((i) => i.key === n);
  if (byKey) return byKey;

  const byAlias = book.items.find((i) => i.aliases.some((a) => a.toLowerCase().trim() === n));
  if (byAlias) return byAlias;

  const byLabel = book.items.find((i) => i.label.toLowerCase().trim() === n);
  if (byLabel) return byLabel;

  const loose = book.items.filter((i) => {
    const k = i.key.replace(/_/g, " ");
    const l = i.label.toLowerCase();
    return k.includes(n) || n.includes(k) || l.includes(n) || n.includes(l);
  });
  // Only when it is unambiguous. Two candidates means we do not know.
  return loose.length === 1 ? loose[0] : undefined;
}

/** Round to the nearest whole $5, the way a person says a price out loud. */
export function roundSpoken(cents: number): number {
  return Math.round(cents / 500) * 500;
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/**
 * Price a job, or refuse to.
 *
 * Pure, integer-only, and every refusal carries both a sentence for the caller
 * and a reason for the owner — because these two audiences need different
 * things and collapsing them is how "our AI told the customer the system
 * couldn't find a rate" happens.
 */
export function priceEstimate(
  book: PriceBook,
  req: EstimateRequest,
  quoting: "none" | "range" | "firm" = "range",
): EstimateResult {
  if (quoting === "none") {
    return {
      ok: false,
      code: "EMPTY_BOOK",
      spoken:
        "Pricing depends on seeing it, so I won't guess over the phone — let's get somebody out to look and you'll have a proper number.",
      why: "This playbook does not quote on calls.",
      escalate: true,
    };
  }
  if (!book.items.length) {
    return {
      ok: false,
      code: "EMPTY_BOOK",
      spoken:
        "I want to get this right rather than guess — let me book somebody to price it properly.",
      why: "The price book has no items in it, so nothing can be priced.",
      escalate: true,
    };
  }
  if (!req.lines.length) {
    return {
      ok: false,
      code: "NOTHING_REQUESTED",
      spoken: "Tell me a bit more about what you need and I'll see what I can do on price.",
      why: "Nothing was extracted from the call to price.",
      escalate: true,
    };
  }

  const lines: EstimateLine[] = [];
  const unknown: string[] = [];
  const unquantified: string[] = [];

  for (const r of req.lines) {
    const item = resolveItem(book, r.item);
    if (!item) {
      unknown.push(r.item);
      continue;
    }
    // A fixed-price item does not need a quantity; everything else does.
    const qty = item.unit === "fixed" ? 1 : r.qty;
    if (item.unit !== "fixed" && (!Number.isFinite(qty) || qty <= 0)) {
      unquantified.push(item.label);
      continue;
    }

    const billedQty = Math.max(qty, item.minQty);
    lines.push({
      key: item.key,
      label: item.label,
      unit: item.unit,
      qty,
      billedQty,
      rateCents: item.rateCents,
      totalCents: Math.round(item.rateCents * billedQty),
      note:
        billedQty > qty
          ? `minimum ${item.minQty} ${UNIT_LABELS[item.unit]} applies`
          : undefined,
    });
  }

  // An unknown item is fatal even when other lines priced. A total missing one
  // of the things the caller asked for is worse than no total, because it is
  // the number they will remember.
  if (unknown.length) {
    return {
      ok: false,
      code: "UNKNOWN_ITEM",
      spoken:
        "That's not something I can price over the phone — let me take the details and have somebody come back to you with a number.",
      why: `Not in the price book: ${unknown.join(", ")}.`,
      escalate: true,
    };
  }
  if (unquantified.length) {
    return {
      ok: false,
      code: "NO_QUANTITY",
      spoken:
        "I'd need a measurement to price that properly, and I'd rather not guess — let's get somebody out to measure it.",
      why: `No usable quantity for: ${unquantified.join(", ")}.`,
      escalate: true,
    };
  }

  const lineTotal = lines.reduce((s, l) => s + l.totalCents, 0);

  const travelMiles = Math.max(0, (req.milesFromBase ?? 0) - book.travel.includedMiles);
  const travelCents = Math.round(travelMiles * book.travel.perMileCents);

  let running = lineTotal + book.callOutFeeCents + travelCents;
  const subtotalCents = running;

  const modifiersApplied: Estimate["modifiersApplied"] = [];
  for (const key of req.modifiers ?? []) {
    const mod = book.modifiers.find((m) => m.key === key);
    if (!mod) continue; // An unknown modifier is silently ignored: it can only
    // ever have moved the price, and refusing the whole quote over a missing
    // surcharge label would be the wrong trade.
    const delta =
      mod.kind === "percent" ? Math.round((subtotalCents * mod.amount) / 100) : mod.amount;
    running += delta;
    modifiersApplied.push({ key: mod.key, label: mod.label, deltaCents: delta });
  }

  const minimumApplied = running < book.minimumJobCents;
  const totalCents = Math.max(running, book.minimumJobCents);

  if (book.maxSpokenTotalCents > 0 && totalCents > book.maxSpokenTotalCents) {
    return {
      ok: false,
      code: "ABOVE_SPOKEN_CAP",
      spoken:
        "A job that size deserves a proper look rather than a phone number — let me get somebody out to price it for you.",
      why: `Priced at ${money(totalCents, book.currency)}, above the ${money(
        book.maxSpokenTotalCents,
        book.currency,
      )} cap for quoting on a call.`,
      escalate: true,
    };
  }

  const measuredCount = req.lines.filter((l) => l.measured).length;
  const confidence: Confidence = minimumApplied
    ? "HIGH" // The minimum is a fixed number; nothing about the job can move it.
    : measuredCount === req.lines.length
      ? "HIGH"
      : measuredCount > 0
        ? "MEDIUM"
        : "LOW";
  const confidenceWhy = minimumApplied
    ? "the minimum job value set this, so the description cannot move it"
    : confidence === "HIGH"
      ? "every quantity was measured, not guessed"
      : confidence === "MEDIUM"
        ? `${measuredCount} of ${req.lines.length} quantities were measured`
        : "every quantity came from the caller's description";

  // A LOW-confidence firm price is a firm price nobody can stand behind.
  const effectiveMode = quoting === "firm" && confidence !== "LOW" ? "firm" : "range";
  const spread = effectiveMode === "firm" ? 0 : book.rangeSpreadPct;
  const lowCents = roundSpoken(Math.round(totalCents * (1 - spread / 100)));
  const highCents = roundSpoken(Math.round(totalCents * (1 + spread / 100)));

  const priceWords =
    effectiveMode === "firm"
      ? money(roundSpoken(totalCents), book.currency)
      : `${money(lowCents, book.currency)} to ${money(highCents, book.currency)}`;

  return {
    ok: true,
    currency: book.currency,
    lines,
    callOutFeeCents: book.callOutFeeCents,
    travelCents,
    modifiersApplied,
    subtotalCents,
    totalCents,
    lowCents,
    highCents,
    confidence,
    confidenceWhy,
    spoken: `${priceWords}. ${book.disclaimer}`.trim(),
    minimumApplied,
  };
}

/**
 * The estimate as a written quote, ready to be proposed to the gate.
 *
 * Separate from `priceEstimate` because the number said on a call and the
 * document that commits to it are different acts with different oversight. This
 * builds the payload; `estimate.send` holds it until a person releases it.
 */
export function quotePayload(
  est: Estimate,
  subject: { name?: string; phone?: string; address?: string; description?: string },
): Record<string, unknown> {
  return {
    customer: {
      name: subject.name ?? null,
      phone: subject.phone ?? null,
      address: subject.address ?? null,
    },
    job: subject.description ?? null,
    lines: est.lines.map((l) => ({
      label: l.label,
      qty: l.billedQty,
      unit: UNIT_LABELS[l.unit],
      rate: money(l.rateCents, est.currency),
      total: money(l.totalCents, est.currency),
      note: l.note ?? null,
    })),
    callOutFee: est.callOutFeeCents ? money(est.callOutFeeCents, est.currency) : null,
    travel: est.travelCents ? money(est.travelCents, est.currency) : null,
    surcharges: est.modifiersApplied.map((m) => ({
      label: m.label,
      amount: money(m.deltaCents, est.currency),
    })),
    total: money(est.totalCents, est.currency),
    range: `${money(est.lowCents, est.currency)} – ${money(est.highCents, est.currency)}`,
    confidence: est.confidence,
    confidenceWhy: est.confidenceWhy,
    minimumApplied: est.minimumApplied,
    quotedOnCall: est.spoken,
  };
}
