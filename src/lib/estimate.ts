/**
 * The phone desk's price arithmetic.
 *
 * DIRECTION
 *   An estimate given over the phone is a claim about a stranger's money, said
 *   by a voice that sounds confident whether or not it should be. `spend-watch.ts`
 *   already drew this line for ad spend — "no model anywhere in it" — and it
 *   applies harder here, because a Spend Watch alert is read by the client
 *   before it costs anyone anything, and a phone quote is said out loud to a
 *   customer in real time. So the model never invents a number. It extracts
 *   what the caller said (job type, quantity, urgency); this file turns that
 *   into a range with arithmetic a human wrote down in advance, per trade.
 *
 * BLUEPRINTS
 *   `computeEstimate` is pure and total — every vertical falls back to a wide,
 *   clearly-labelled range off `typicalJobValueCents`-style anchors when the
 *   job type doesn't match a rate-card line, and the function never throws.
 *   Nothing here sends anything to a customer; see lib/voice-agent.ts (creates
 *   the DRAFT row and proposes it through the gate) and
 *   lib/executors/estimate-send.ts (the "quote.send" executor that delivers it
 *   once a human releases it).
 */

export interface RateCardLine {
  /** Matched against the caller's stated job type, case-insensitively. */
  jobType: string;
  label: string;
  /** Cents per unit (sq ft, ton, item — whatever `unit` says). */
  lowPerUnit: number;
  highPerUnit: number;
  unit: string;
  /** Used when the caller didn't give (or the agent didn't parse) a quantity. */
  defaultQuantity: number;
  /** A flat range is used instead of quantity math when true. */
  flat?: boolean;
}

export interface VerticalRateCard {
  key: string;
  lines: RateCardLine[];
  /** No matching line and no override — the generic range is this wide, each
   * side a multiple of this anchor. Kept far apart on purpose: a wrong wide
   * range is honest, a wrong narrow one is a liability. */
  fallbackAnchorCents: number;
}

/**
 * Deliberately conservative starting points, same spirit as
 * `typicalJobValueCents` in lib/verticals.ts — day-one numbers the client is
 * expected to tune once real jobs come through, not researched benchmarks.
 * Stated everywhere this surfaces.
 */
export const RATE_CARDS: VerticalRateCard[] = [
  {
    key: "roofing",
    fallbackAnchorCents: 1_400_000,
    lines: [
      {
        jobType: "roof replacement",
        label: "Full roof replacement",
        lowPerUnit: 450,
        highPerUnit: 950,
        unit: "sq ft",
        defaultQuantity: 2200,
      },
      {
        jobType: "roof repair",
        label: "Roof repair",
        lowPerUnit: 0,
        highPerUnit: 0,
        unit: "job",
        defaultQuantity: 1,
        flat: true,
      },
      {
        jobType: "inspection",
        label: "Inspection",
        lowPerUnit: 0,
        highPerUnit: 0,
        unit: "job",
        defaultQuantity: 1,
        flat: true,
      },
    ],
  },
  {
    key: "hvac",
    fallbackAnchorCents: 900_000,
    lines: [
      {
        jobType: "ac replacement",
        label: "AC / system replacement",
        lowPerUnit: 400_000,
        highPerUnit: 1_200_000,
        unit: "system",
        defaultQuantity: 1,
        flat: true,
      },
      {
        jobType: "ac repair",
        label: "AC / furnace repair",
        lowPerUnit: 15_000,
        highPerUnit: 90_000,
        unit: "job",
        defaultQuantity: 1,
        flat: true,
      },
      {
        jobType: "maintenance",
        label: "Maintenance visit",
        lowPerUnit: 9_000,
        highPerUnit: 25_000,
        unit: "job",
        defaultQuantity: 1,
        flat: true,
      },
    ],
  },
  {
    key: "med-spa",
    fallbackAnchorCents: 180_000,
    lines: [
      {
        jobType: "consultation",
        label: "Consultation",
        lowPerUnit: 0,
        highPerUnit: 0,
        unit: "job",
        defaultQuantity: 1,
        flat: true,
      },
      {
        jobType: "treatment package",
        label: "Treatment package",
        lowPerUnit: 60_000,
        highPerUnit: 400_000,
        unit: "package",
        defaultQuantity: 1,
        flat: true,
      },
    ],
  },
  {
    key: "dental",
    fallbackAnchorCents: 320_000,
    lines: [
      {
        jobType: "cleaning",
        label: "Cleaning / exam",
        lowPerUnit: 8_000,
        highPerUnit: 25_000,
        unit: "job",
        defaultQuantity: 1,
        flat: true,
      },
      {
        jobType: "procedure",
        label: "Treatment plan / procedure",
        lowPerUnit: 50_000,
        highPerUnit: 500_000,
        unit: "plan",
        defaultQuantity: 1,
        flat: true,
      },
    ],
  },
  {
    key: "legal",
    fallbackAnchorCents: 0,
    lines: [
      {
        jobType: "consultation",
        label: "Initial consultation",
        lowPerUnit: 0,
        highPerUnit: 0,
        unit: "job",
        defaultQuantity: 1,
        flat: true,
      },
    ],
  },
  {
    key: "remodeling",
    fallbackAnchorCents: 6_500_000,
    lines: [
      {
        jobType: "kitchen remodel",
        label: "Kitchen remodel",
        lowPerUnit: 15_000,
        highPerUnit: 45_000,
        unit: "sq ft",
        defaultQuantity: 250,
      },
      {
        jobType: "bathroom remodel",
        label: "Bathroom remodel",
        lowPerUnit: 20_000,
        highPerUnit: 60_000,
        unit: "sq ft",
        defaultQuantity: 60,
      },
      {
        jobType: "addition",
        label: "Room addition",
        lowPerUnit: 25_000,
        highPerUnit: 55_000,
        unit: "sq ft",
        defaultQuantity: 300,
      },
    ],
  },
];

export function rateCardFor(verticalKey: string | null | undefined): VerticalRateCard | undefined {
  if (!verticalKey) return undefined;
  return RATE_CARDS.find((c) => c.key === verticalKey);
}

/** Case-insensitive, substring-tolerant so "roof replace" still matches. */
function matchLine(card: VerticalRateCard, jobType: string): RateCardLine | undefined {
  const needle = jobType.toLowerCase().trim();
  if (!needle) return undefined;
  return (
    card.lines.find((l) => l.jobType === needle) ??
    card.lines.find((l) => needle.includes(l.jobType) || l.jobType.includes(needle))
  );
}

export interface EstimateInput {
  verticalKey: string | null | undefined;
  jobType: string;
  /** Sq ft, tonnage, whatever unit the matched line uses. Ignored for flat lines. */
  quantity?: number | null;
  urgency?: "STANDARD" | "EMERGENCY";
}

export interface EstimateResult {
  priceLowCents: number;
  priceHighCents: number;
  unit: string;
  quantity: number;
  basis: string;
  /** RATE_CARD = matched a real line item for this trade. FALLBACK = no
   * match, so a deliberately wide generic range off the trade's typical job
   * value — always disclosed as rough in `basis`. */
  confidence: "RATE_CARD" | "FALLBACK";
}

const EMERGENCY_MULTIPLIER = 1.25;

/**
 * Pure and total. Never throws, never returns a negative or inverted range,
 * never invents a number the rate card didn't produce.
 */
export function computeEstimate(input: EstimateInput): EstimateResult {
  const card = rateCardFor(input.verticalKey);
  const urgencyMult = input.urgency === "EMERGENCY" ? EMERGENCY_MULTIPLIER : 1;

  if (!card) {
    // No vertical pack at all — the widest possible honest answer.
    const low = 15_000;
    const high = 500_000;
    return {
      priceLowCents: low,
      priceHighCents: high,
      unit: "job",
      quantity: 1,
      confidence: "FALLBACK",
      basis:
        "No trade pricing configured for this account yet, so this is a placeholder range only — " +
        "an admin needs to set it up before a real number goes out.",
    };
  }

  const line = matchLine(card, input.jobType);

  if (!line) {
    const low = Math.round(card.fallbackAnchorCents * 0.2 * urgencyMult);
    const high = Math.round(card.fallbackAnchorCents * 1.8 * urgencyMult);
    return {
      priceLowCents: low,
      priceHighCents: high,
      unit: "job",
      quantity: 1,
      confidence: "FALLBACK",
      basis:
        `"${input.jobType}" didn't match a priced line item, so this is a wide placeholder range ` +
        `rather than a real quote — flag it for a human to price by hand.`,
    };
  }

  if (line.flat) {
    const low = Math.round(line.lowPerUnit * urgencyMult);
    const high = Math.round(line.highPerUnit * urgencyMult);
    return {
      priceLowCents: low,
      priceHighCents: high,
      unit: line.unit,
      quantity: 1,
      confidence: "RATE_CARD",
      basis:
        `${line.label}: flat range from the rate card` +
        (input.urgency === "EMERGENCY" ? ", with the emergency-callout rate applied." : "."),
    };
  }

  const quantity =
    input.quantity != null && Number.isFinite(input.quantity) && input.quantity > 0
      ? Math.round(input.quantity)
      : line.defaultQuantity;

  const low = Math.round(line.lowPerUnit * quantity * urgencyMult);
  const high = Math.round(line.highPerUnit * quantity * urgencyMult);

  return {
    priceLowCents: low,
    priceHighCents: high,
    unit: line.unit,
    quantity,
    confidence: "RATE_CARD",
    basis:
      `${line.label}: ${quantity} ${line.unit} × $${(line.lowPerUnit / 100).toFixed(2)}–$${(
        line.highPerUnit / 100
      ).toFixed(2)} per ${line.unit}` +
      (input.quantity == null
        ? " (no quantity given on the call, so this uses a typical job size — confirm it before sending)"
        : "") +
      (input.urgency === "EMERGENCY" ? ", with the emergency-callout rate applied." : "."),
  };
}

/** Cents to a plain "$1,234" string, for transcript-facing copy. */
export function formatCents(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

export function formatRange(low: number, high: number): string {
  return `${formatCents(low)}–${formatCents(high)}`;
}
