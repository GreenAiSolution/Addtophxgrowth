/**
 * Turning a textarea into a playbook, and back.
 *
 * WHY A TEXTAREA AND NOT A ROW EDITOR
 *   The thing being edited is a list of questions and a list of rates. A
 *   drag-and-drop row builder for that needs client-side state, and client-side
 *   state on this screen means a half-saved playbook — the operator's rulebook,
 *   the one thing that must never be ambiguous. Twelve lines of pipe-separated
 *   text posts in one atomic form, works with no JavaScript, and can be pasted
 *   in from a spreadsheet, which is where most of these numbers already live.
 *
 * WHY IT NEVER SILENTLY DROPS A LINE
 *   A line the parser cannot read comes back as an error the screen shows, and
 *   the save is refused. The alternative — skipping it — means an owner types a
 *   rate, presses save, sees a green tick, and finds out three weeks later that
 *   the operator has been booking visits instead of quoting it.
 */

import { qualifierSchema, type Qualifier } from "@/lib/voice";
import { priceItemSchema, UNIT_LABELS, type PriceItem, type Unit } from "@/lib/estimates";

export interface ParseResult<T> {
  values: T[];
  errors: string[];
}

/** One item per line, blanks and duplicates removed, order kept. */
export function parseList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\n,]/)) {
    const v = raw.trim();
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out;
}

export function serialiseList(values: string[]): string {
  return values.join("\n");
}

const SLOT_HINT = "lowercase letters, digits and underscores";

/** `slot | question | required` — required defaults to yes. */
export function parseQualifiers(text: string): ParseResult<Qualifier> {
  const values: Qualifier[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const n = i + 1;
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length < 2) {
      errors.push(`Line ${n}: needs at least "slot | question".`);
      return;
    }
    const [slot, ask, required] = parts;
    if (seen.has(slot!)) {
      errors.push(`Line ${n}: "${slot}" is listed twice.`);
      return;
    }
    const optional = /^(no|optional|false|nice)/i.test(required ?? "");
    const parsed = qualifierSchema.safeParse({
      slot,
      ask,
      required: !optional,
      expects: "text",
    });
    if (!parsed.success) {
      errors.push(`Line ${n}: ${parsed.error.issues[0]?.message ?? `a slot key is ${SLOT_HINT}`}`);
      return;
    }
    seen.add(parsed.data.slot);
    values.push(parsed.data);
  });

  return { values, errors };
}

export function serialiseQualifiers(qs: Qualifier[]): string {
  return qs.map((q) => `${q.slot} | ${q.ask}${q.required ? "" : " | optional"}`).join("\n");
}

/** `key | label | unit | rate | minimum` — rate in dollars, as people type it. */
export function parsePriceItems(text: string): ParseResult<PriceItem> {
  const values: PriceItem[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  const units = Object.keys(UNIT_LABELS) as Unit[];

  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const n = i + 1;
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length < 4) {
      errors.push(`Line ${n}: needs "key | label | unit | rate".`);
      return;
    }
    const [key, label, unit, rate, min] = parts;
    if (seen.has(key!)) {
      errors.push(`Line ${n}: "${key}" is listed twice.`);
      return;
    }
    if (!units.includes(unit as Unit)) {
      errors.push(`Line ${n}: "${unit}" is not a unit. Use one of: ${units.join(", ")}.`);
      return;
    }
    const dollars = Number((rate ?? "").replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(dollars)) {
      errors.push(`Line ${n}: "${rate}" is not a rate.`);
      return;
    }
    const parsed = priceItemSchema.safeParse({
      key,
      label,
      unit,
      rateCents: Math.round(dollars * 100),
      minQty: min ? Number(min.replace(/[^0-9.]/g, "")) || 0 : 0,
      aliases: [],
    });
    if (!parsed.success) {
      errors.push(`Line ${n}: ${parsed.error.issues[0]?.message ?? `an item key is ${SLOT_HINT}`}`);
      return;
    }
    seen.add(parsed.data.key);
    values.push(parsed.data);
  });

  return { values, errors };
}

export function serialisePriceItems(items: PriceItem[]): string {
  return items
    .map((i) =>
      [
        i.key,
        i.label,
        i.unit,
        (i.rateCents / 100).toFixed(2).replace(/\.00$/, ""),
        i.minQty || "",
      ]
        .filter((p, idx) => idx < 4 || p !== "")
        .join(" | "),
    )
    .join("\n");
}

/** Dollars as typed → integer cents. Blank is zero, not an error. */
export function dollarsToCents(text: string | null | undefined): number {
  const n = Number(String(text ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function centsToDollars(cents: number): string {
  return cents ? (cents / 100).toFixed(2).replace(/\.00$/, "") : "";
}
