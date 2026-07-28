/**
 * THE QUERY FAN — engine.
 *
 * WHAT IT READS
 *   Which of the questions an assistant actually gets asked you are currently
 *   a candidate for.
 *
 *   Instrument 01 shows what a model can determine about you. This shows what
 *   that costs. Every question below carries a filter — "open now" needs
 *   hours, "licensed" needs a credential, "under $500" needs a price range —
 *   and a business missing that attribute is not ranked poorly for the
 *   question, it is excluded from consideration before ranking happens. Owners
 *   consistently understand the first and not the second.
 *
 * WHY THIS IS HONEST
 *   This is set membership, not prediction. A question is winnable when every
 *   attribute it filters on is present, and unwinnable when one is missing.
 *   No volume is claimed for any question, no ranking is forecast, and no
 *   number here is anything other than a count of the list above it.
 *
 *   The questions themselves are phrasings, not measurements. `QUERIES` is
 *   labelled as illustrative in the UI for exactly that reason: we did not
 *   measure these, we wrote them, and pretending otherwise would be the
 *   invented statistic this whole site refuses to print.
 */

import { ENTITY_ATTRIBUTES, type EntityAnswers } from "./entity";

export type QueryIntent = "urgent" | "compare" | "budget" | "trust" | "discover";

export interface Query {
  /** How somebody actually phrases it out loud. */
  text: string;
  intent: QueryIntent;
  /** Entity attribute keys this question filters on. All must be present. */
  needs: string[];
}

export const INTENTS: Record<QueryIntent, { label: string; hue: number }> = {
  urgent: { label: "Urgent", hue: 340 },
  compare: { label: "Comparison", hue: 265 },
  budget: { label: "Budget", hue: 42 },
  trust: { label: "Trust", hue: 158 },
  discover: { label: "Discovery", hue: 190 },
};

/**
 * The questions, and what each one silently requires.
 *
 * Kept deliberately in a trade voice — this is how somebody talks to a phone
 * in a van, not how a marketer writes a keyword.
 */
export const QUERIES: Query[] = [
  { text: "who's open right now near me", intent: "urgent", needs: ["category", "area", "hours"] },
  { text: "emergency callout tonight", intent: "urgent", needs: ["category", "area", "hours", "phone"] },
  { text: "someone who can come out today", intent: "urgent", needs: ["category", "area", "hours"] },
  { text: "best rated in my area", intent: "compare", needs: ["category", "area", "reviews"] },
  { text: "compare two local companies", intent: "compare", needs: ["name", "category", "reviews", "sameAs"] },
  { text: "who does this specific job", intent: "compare", needs: ["category", "services"] },
  { text: "roughly what does this cost", intent: "budget", needs: ["category", "services", "price"] },
  { text: "anyone under my budget", intent: "budget", needs: ["category", "area", "price"] },
  { text: "is there a call-out fee", intent: "budget", needs: ["price", "services"] },
  { text: "are they licensed and insured", intent: "trust", needs: ["credentials", "sameAs"] },
  { text: "is this a real business", intent: "trust", needs: ["name", "phone", "sameAs"] },
  { text: "have other people used them", intent: "trust", needs: ["reviews", "sameAs"] },
  { text: "who does this in my town", intent: "discover", needs: ["category", "area"] },
  { text: "give me three options", intent: "discover", needs: ["category", "area", "name"] },
  { text: "what else do they do", intent: "discover", needs: ["services"] },
  { text: "book me in for next week", intent: "urgent", needs: ["category", "area", "hours", "services"] },
];

export interface QueryReading {
  query: Query;
  winnable: boolean;
  /** Attribute labels that lock this question, in the order they are listed. */
  missing: string[];
}

export interface FanReading {
  readings: QueryReading[];
  winnable: number;
  locked: number;
  total: number;
  /**
   * The single attribute that unlocks the most questions right now.
   *
   * Reported because the useful move is almost never "fix everything" — one
   * missing field is usually holding a disproportionate share of the fan, and
   * an owner cannot see which from a list of ten toggles.
   */
  keystone: { key: string; label: string; unlocks: number } | null;
}

const LABELS = new Map(ENTITY_ATTRIBUTES.map((a) => [a.key, a.label]));

export function readFan(answers: EntityAnswers): FanReading {
  const present = (k: string) => Boolean(answers[k]?.stated);

  const readings: QueryReading[] = QUERIES.map((query) => {
    const missing = query.needs.filter((k) => !present(k));
    return {
      query,
      winnable: missing.length === 0,
      missing: missing.map((k) => LABELS.get(k) ?? k),
    };
  });

  // Which single absent attribute would flip the most questions to winnable?
  let keystone: FanReading["keystone"] = null;
  for (const attr of ENTITY_ATTRIBUTES) {
    if (present(attr.key)) continue;
    const unlocks = readings.filter(
      (r) => !r.winnable && r.query.needs.includes(attr.key) && r.query.needs.every((k) => k === attr.key || present(k)),
    ).length;
    if (unlocks > 0 && (!keystone || unlocks > keystone.unlocks)) {
      keystone = { key: attr.key, label: attr.label, unlocks };
    }
  }

  return {
    readings,
    winnable: readings.filter((r) => r.winnable).length,
    locked: readings.filter((r) => !r.winnable).length,
    total: readings.length,
    keystone,
  };
}

/**
 * Fan geometry. Deterministic, so the same answers always draw the same fan
 * and a screenshot stays true.
 *
 * Grouped by intent into arcs, because the shape of what you are locked out of
 * carries information — a business missing only `price` loses a contiguous
 * wedge, and seeing a wedge go dark is a different experience from reading
 * "3 of 16".
 */
export interface FanNode {
  text: string;
  intent: QueryIntent;
  winnable: boolean;
  angle: number;
  /** 0–1 outward from the hub. Winnable sit further out — they are reachable. */
  reach: number;
}

export function fanLayout(reading: FanReading): FanNode[] {
  const order: QueryIntent[] = ["urgent", "compare", "budget", "trust", "discover"];
  const grouped = order.flatMap((intent) =>
    reading.readings.filter((r) => r.query.intent === intent),
  );
  const n = grouped.length || 1;

  return grouped.map((r, i) => ({
    text: r.query.text,
    intent: r.query.intent,
    winnable: r.winnable,
    // Three-quarter fan opening upward, so labels have room and it reads as a
    // radar sweep rather than a pie chart.
    angle: -Math.PI * 1.25 + (i / (n - 1 || 1)) * Math.PI * 1.5,
    reach: r.winnable ? 1 : 0.58,
  }));
}
