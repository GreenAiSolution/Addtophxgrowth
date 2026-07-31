/**
 * THE ESTIMATOR — Gauge, and the one number nobody may guess.
 *
 * DIRECTION
 *   The Job Runner promises "quotes out the same day, priced off your own rate
 *   card and sent for signature". The leak it closes is not that quotes are
 *   wrong, it is that they are late: the price waits for the evening the owner
 *   has the energy to write it, and by the time it lands the customer has read
 *   two others.
 *
 * THE LOAD-BEARING RULE
 *   An unpriced line is never worth zero.
 *
 *   This is the whole file. The obvious implementation of "price these lines
 *   against this rate card" reaches for a lookup, finds nothing for a code
 *   somebody typed, and contributes 0 to the subtotal. The result is a
 *   plausible, well-formatted, confidently-wrong estimate that undercharges —
 *   and it is a *price commitment*, so the customer holds us to it. Nobody
 *   notices, because a total that is too low looks exactly like a total.
 *
 *   So unknown codes land in `unpriced`, `complete` goes false, and `canSend`
 *   refuses with the codes named. Gauge's published duty is "never invents a
 *   number it was not given a rate for; it asks you instead", and this is that
 *   sentence as code.
 *
 * ONE PLACE COMPUTES ANY TOTAL
 *   `priceEstimate` is pure and is the only arithmetic in the product. The
 *   number the client watches assemble, the number on the document the customer
 *   signs, and the number that reaches an invoice are the same function call.
 *   Two implementations would eventually disagree, and the trust cost of a
 *   quote that changed between the screen and the email is permanent.
 *
 * SNAPSHOT, NEVER A REFERENCE
 *   `PricedLine` carries the label, unit and unit price it was priced at rather
 *   than pointing at a rate card row. Rate cards get edited — that is what they
 *   are for — and an estimate that re-read live rates would silently restate a
 *   price a customer was already holding. The stored estimate has to mean what
 *   it meant on the day it was sent.
 *
 * NO MODEL, NO DATABASE, NO CLOCK. A price is a claim about somebody's money,
 * so it has to be arithmetic that can be pointed at — the same standard
 * `spend-watch.ts` holds itself to for the same reason.
 */

export type RateUnit = "HOUR" | "DAY" | "EACH" | "SQ_FT" | "LINEAR_FT" | "FLAT";

export const RATE_UNITS: { key: RateUnit; label: string; short: string }[] = [
  { key: "HOUR", label: "Per hour", short: "hr" },
  { key: "DAY", label: "Per day", short: "day" },
  { key: "EACH", label: "Each", short: "ea" },
  { key: "SQ_FT", label: "Per square foot", short: "sq ft" },
  { key: "LINEAR_FT", label: "Per linear foot", short: "ln ft" },
  { key: "FLAT", label: "Flat fee", short: "flat" },
];

export function unitShort(unit: RateUnit): string {
  return RATE_UNITS.find((u) => u.key === unit)?.short ?? String(unit).toLowerCase();
}

/** One line on the client's own rate card. */
export interface Rate {
  code: string;
  label: string;
  unit: RateUnit;
  unitPriceCents: number;
  /**
   * Never charge less than this for the line, however small the quantity.
   * A callout that costs the same whether it takes ten minutes or an hour is
   * the single most common shape of trade pricing and the one a naive
   * quantity × price model gets wrong.
   */
  minimumCents?: number | null;
  /** Defaults to true. Labour is often taxed differently from materials. */
  taxable?: boolean;
}

/** What was asked for: a code and a quantity. */
export interface LineRequest {
  code: string;
  quantity: number;
  note?: string;
}

/** What it costs. Everything needed to re-read the line in five years. */
export interface PricedLine {
  code: string;
  label: string;
  unit: RateUnit;
  quantity: number;
  unitPriceCents: number;
  /** quantity × unit price, before any minimum. Kept so the minimum is visible. */
  rawCents: number;
  /** What is actually charged for this line. */
  amountCents: number;
  minimumApplied: boolean;
  taxable: boolean;
  note?: string;
}

export interface EstimateInput {
  lines: LineRequest[];
  rates: Rate[];
  discountCents?: number;
  /** Percent, e.g. 8.6. Applied to the taxable portion only. */
  taxRatePercent?: number;
}

export interface PricedEstimate {
  lines: PricedLine[];
  /**
   * Codes with no rate on the card. Non-empty means this estimate must not go
   * anywhere near a customer.
   */
  unpriced: string[];
  subtotalCents: number;
  discountCents: number;
  /** What the tax was actually charged on, after the discount was shared out. */
  taxableBaseCents: number;
  taxCents: number;
  totalCents: number;
  /** Every requested line found a rate. */
  complete: boolean;
}

/**
 * Cents, always. Guards the two ways a price panel gets ruined: a NaN from a
 * blank form field, and an Infinity from a runaway quantity.
 */
function money(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v);
}

/** Quantities may be fractional (2.5 hours) but never negative. */
function quantity(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return v;
}

/**
 * Price it.
 *
 * Deliberately total rather than throwing. A form with one bad code should show
 * the client which code is bad, with the rest of the estimate priced around it
 * — not an error page that loses the twelve lines they had already typed.
 */
export function priceEstimate(input: EstimateInput): PricedEstimate {
  const byCode = new Map(input.rates.map((r) => [r.code, r]));
  const lines: PricedLine[] = [];
  const unpriced: string[] = [];

  for (const req of input.lines ?? []) {
    const rate = byCode.get(req.code);
    if (!rate) {
      // The rule this file exists for. Not a zero-priced line.
      if (!unpriced.includes(req.code)) unpriced.push(req.code);
      continue;
    }

    const qty = quantity(req.quantity);
    const unitPriceCents = money(rate.unitPriceCents);
    const rawCents = Math.round(qty * unitPriceCents);
    const minimum = money(rate.minimumCents ?? 0);

    // A minimum on a zero quantity is not a charge — nobody asked for the line.
    const minimumApplies = qty > 0 && minimum > 0 && rawCents < minimum;
    const amountCents = minimumApplies ? minimum : rawCents;

    lines.push({
      code: rate.code,
      label: rate.label,
      unit: rate.unit,
      quantity: qty,
      unitPriceCents,
      rawCents,
      amountCents,
      minimumApplied: minimumApplies,
      taxable: rate.taxable ?? true,
      ...(req.note ? { note: req.note } : {}),
    });
  }

  const subtotalCents = lines.reduce((n, l) => n + l.amountCents, 0);

  // A discount may not exceed the job. A negative total is not a refund, it is
  // a bug that would print "you owe -$40" on a document somebody signs.
  const discountCents = Math.min(Math.max(money(input.discountCents ?? 0), 0), subtotalCents);

  const taxableSubtotal = lines.filter((l) => l.taxable).reduce((n, l) => n + l.amountCents, 0);

  // Share the discount across taxable and non-taxable in proportion, so
  // discounting a job does not quietly change which part of it was taxed.
  const taxableShare = subtotalCents > 0 ? taxableSubtotal / subtotalCents : 0;
  const taxableBaseCents = Math.max(
    0,
    Math.round(taxableSubtotal - discountCents * taxableShare),
  );

  const rate = Number(input.taxRatePercent ?? 0);
  const taxRate = Number.isFinite(rate) && rate > 0 ? rate : 0;
  const taxCents = Math.round((taxableBaseCents * taxRate) / 100);

  const totalCents = subtotalCents - discountCents + taxCents;

  return {
    lines,
    unpriced,
    subtotalCents,
    discountCents,
    taxableBaseCents,
    taxCents,
    totalCents,
    complete: unpriced.length === 0,
  };
}

export type SendVerdict = { ok: true } | { ok: false; why: string };

/**
 * Whether this estimate may be put in front of a customer.
 *
 * Called before the gate, not instead of it. The gate asks "has a human
 * released this"; this asks "is it a real number at all". A quote can be
 * released by the right person and still be nonsense, and only one of those two
 * questions catches that.
 */
export function canSend(estimate: PricedEstimate): SendVerdict {
  if (estimate.unpriced.length > 0) {
    return {
      ok: false,
      why: `No rate on the card for ${estimate.unpriced.join(", ")}. Add the rate, or take the line off.`,
    };
  }
  if (estimate.lines.length === 0) {
    return { ok: false, why: "There is nothing on this estimate." };
  }
  if (estimate.totalCents <= 0) {
    // Zero is a legitimate thing to *do* and never a legitimate thing to send
    // by accident, so it needs a deliberate act rather than a silent pass.
    return { ok: false, why: "This estimate totals nothing. Price it, or send it as a note." };
  }
  return { ok: true };
}

/**
 * A human-readable reference, zero-padded.
 *
 * Sequential because customers ring up about "estimate forty-two" and a cuid is
 * not something anybody reads down a phone.
 */
export function estimateReference(n: number): string {
  const safe = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
  return `EST-${String(safe).padStart(4, "0")}`;
}

/**
 * How long a price stands.
 *
 * Quoting materials at last month's price is how a trade loses money on a job
 * it won. Thirty days is the trade default and the client can shorten it; what
 * matters is that an estimate carries an expiry at all rather than standing
 * forever by omission.
 */
export const DEFAULT_VALID_DAYS = 30;

export function expiryFor(from: Date, days = DEFAULT_VALID_DAYS): Date {
  const safe = Number.isFinite(days) && days > 0 ? Math.floor(days) : DEFAULT_VALID_DAYS;
  return new Date(from.getTime() + safe * 86_400_000);
}

export function isExpired(expiresAt: Date | null | undefined, now: Date): boolean {
  return Boolean(expiresAt && now >= expiresAt);
}

/**
 * What Gauge still needs before it can price the job.
 *
 * The estimator's counterpart to `missing()` on the call plan: it names the
 * gap rather than filling it in, which is the same refusal the unpriced rule
 * makes one level up.
 */
export function describeGap(estimate: PricedEstimate): string | null {
  if (estimate.unpriced.length === 0) return null;
  const codes = estimate.unpriced;
  return codes.length === 1
    ? `"${codes[0]}" is not on the rate card yet.`
    : `${codes.length} items are not on the rate card yet: ${codes.join(", ")}.`;
}
