/**
 * CONVERSATION INTELLIGENCE — redaction.
 *
 * DIRECTION
 *   Transcripts are the most sensitive text this system will ever hold. A
 *   qualified lead's form fill contains what somebody chose to type into a
 *   box. A recorded call contains whatever they happened to say, which in this
 *   trade routinely includes a card number read aloud, a gate code, and where
 *   they will be on Thursday.
 *
 *   `retrieval.ts` indexes client-owned text for semantic search. The moment
 *   transcripts go into that index, a card number read aloud on a call in
 *   March is retrievable by anybody with access to the workspace, forever.
 *
 * WHAT THIS FILE HONESTLY DOES AND DOES NOT DO
 *   It removes the structured identifiers — card numbers, government numbers,
 *   emails, phone numbers, street addresses. Those have shapes, and shapes can
 *   be matched.
 *
 *   It does NOT remove names, and it must not be described as if it does.
 *   Names have no shape; "Bill" is a name and a noun, and a redactor confident
 *   enough to strip names would either destroy transcripts or miss most of
 *   them. The transcript is the customer's own conversation with a business
 *   they contacted, held by that business, and the name is the least
 *   surprising thing in it. The card number is not, and that is the
 *   distinction this file draws.
 *
 *   Everything here runs BEFORE storage, not before display. Redacting at
 *   render time means the raw text is on disk and one missing call site away
 *   from a screen.
 *
 * BLUEPRINTS
 *   Pure. Text in, text out, plus a count of what was removed so a client can
 *   be told their transcripts are being scrubbed rather than having to trust
 *   it.
 */

export type RedactionKind =
  | "CARD"
  | "GOV_ID"
  | "EMAIL"
  | "PHONE"
  | "ADDRESS"
  | "ACCOUNT";

export interface Redaction {
  kind: RedactionKind;
  count: number;
}

interface Rule {
  kind: RedactionKind;
  pattern: RegExp;
  replacement: string;
}

/**
 * Order matters. Card numbers run before phone numbers, because a 16-digit
 * string written with spaces will otherwise be partially eaten by the phone
 * pattern and the remainder left on disk — which is worse than not matching at
 * all, since it looks redacted.
 */
const RULES: Rule[] = [
  {
    // 13–19 digits, optionally separated. Covers every major card format.
    kind: "CARD",
    pattern: /\b(?:\d[ -]?){13,19}\b/g,
    replacement: "[card removed]",
  },
  {
    // US SSN / ITIN shape.
    kind: "GOV_ID",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: "[id removed]",
  },
  {
    kind: "EMAIL",
    pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g,
    replacement: "[email removed]",
  },
  {
    // North American numbers, spoken or written, with or without country code.
    kind: "PHONE",
    pattern: /(?:\+?1[ .-]?)?\(?\b\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b/g,
    replacement: "[phone removed]",
  },
  {
    // Street address. Number, then words, then a street-type suffix — the
    // suffix is what keeps this from eating "I have 3 dogs".
    kind: "ADDRESS",
    pattern:
      /\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){0,4}(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|circle|cir|way|place|pl|terrace|ter|parkway|pkwy|highway|hwy)\b\.?/gi,
    replacement: "[address removed]",
  },
  {
    // "account number 4471", "acct #99201" — a labelled reference.
    //
    // The lookahead requiring a digit is load-bearing, and this trade is
    // exactly why. Without it, `[A-Z0-9-]{4,}` matches ordinary words under
    // the `i` flag, so "insurance claim being processed" redacts as
    // "insurance [account removed] processed" — and storm-damage roofing
    // transcripts say "claim" in almost every call.
    kind: "ACCOUNT",
    pattern:
      /\b(?:account|acct|policy|claim)\s*(?:number|no\.?|#)?\s*[:#]?\s*(?=[A-Z0-9-]*\d)[A-Z0-9-]{4,}\b/gi,
    replacement: "[account removed]",
  },
];

export interface RedactResult {
  text: string;
  redactions: Redaction[];
}

/** Pure: strip structured identifiers, and report what was taken out. */
export function redact(input: string): RedactResult {
  let text = input;
  const redactions: Redaction[] = [];

  for (const rule of RULES) {
    let count = 0;
    text = text.replace(rule.pattern, () => {
      count += 1;
      return rule.replacement;
    });
    if (count > 0) redactions.push({ kind: rule.kind, count });
  }

  return { text, redactions };
}

/** Whether anything was removed. Used to badge a transcript in the UI. */
export function wasRedacted(result: RedactResult): boolean {
  return result.redactions.length > 0;
}

/** One line for a client: what we took out of their transcripts. */
export function describeRedactions(redactions: Redaction[]): string {
  if (redactions.length === 0) return "Nothing sensitive was found to remove.";

  const labels: Record<RedactionKind, string> = {
    CARD: "card number",
    GOV_ID: "government ID",
    EMAIL: "email address",
    PHONE: "phone number",
    ADDRESS: "street address",
    ACCOUNT: "account reference",
  };

  const parts = redactions.map(
    (r) => `${r.count} ${labels[r.kind]}${r.count === 1 ? "" : "s"}`,
  );
  return `Removed before storage: ${parts.join(", ")}. Names are kept — see redact.ts for why.`;
}
