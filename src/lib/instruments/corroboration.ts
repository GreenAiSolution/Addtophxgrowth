/**
 * THE CORROBORATION WEB — engine.
 *
 * WHAT IT READS
 *   Whether anybody except you says you exist.
 *
 *   A business's own website is a single source making claims about itself. No
 *   assistant treats that as evidence, for the same reason no journalist would.
 *   What turns a claim into a fact is independent restatement: the same name,
 *   the same number, the same address, on domains the business does not
 *   control.
 *
 * WHY THIS IS HONEST
 *   There is no authority score here and no ranking prediction. Two structural
 *   quantities are computed, both of them countable:
 *
 *     REACH        how many independent domains carry a record of you.
 *     CONSISTENCY  of those, how many carry the SAME name, address and phone.
 *
 *   The second is the one that matters and the one nobody checks. Twelve
 *   listings that disagree about your suite number are not twelve
 *   corroborations — they are twelve reasons for a resolver to give up, because
 *   conflicting records of one entity look exactly like records of several.
 *   That is why `conflicts` is reported separately and never netted off.
 */

export type SourceKind = "map" | "directory" | "trade" | "social" | "press";

export interface CitationSource {
  key: string;
  name: string;
  kind: SourceKind;
  /**
   * Whether a resolver treats this domain as load-bearing for local entities.
   * Not a weight — a boolean, so nothing here is a fabricated coefficient.
   */
  anchor: boolean;
  note: string;
}

/**
 * The sources a local resolver actually consults. Anchors first.
 *
 * `anchor` marks the handful whose absence is itself a signal: a real business
 * of any age is on the maps, and a resolver reads a gap there as doubt rather
 * than as missing data.
 */
export const CITATION_SOURCES: CitationSource[] = [
  { key: "gbp", name: "Google Business Profile", kind: "map", anchor: true, note: "The spine of local resolution." },
  { key: "apple", name: "Apple Business Connect", kind: "map", anchor: true, note: "Every iPhone map query resolves here." },
  { key: "bing", name: "Bing Places", kind: "map", anchor: true, note: "Feeds assistants that do not use Google." },
  { key: "yelp", name: "Yelp", kind: "directory", anchor: true, note: "Widely ingested as a structured record." },
  { key: "bbb", name: "Better Business Bureau", kind: "directory", anchor: false, note: "Independent, and carries a trading name." },
  { key: "chamber", name: "Local chamber of commerce", kind: "directory", anchor: false, note: "A local domain that is not yours." },
  { key: "trade", name: "Trade body or licence register", kind: "trade", anchor: false, note: "The only source that can corroborate a licence." },
  { key: "supplier", name: "Manufacturer or supplier locator", kind: "trade", anchor: false, note: "Rarely claimed, and unusually credible." },
  { key: "linkedin", name: "LinkedIn company page", kind: "social", anchor: false, note: "Corroborates the entity, not the location." },
  { key: "facebook", name: "Facebook page", kind: "social", anchor: false, note: "Carries hours and phone in a readable form." },
  { key: "press", name: "Local press or blog mention", kind: "press", anchor: false, note: "Unstructured, but genuinely independent." },
  { key: "nextdoor", name: "Nextdoor business page", kind: "social", anchor: false, note: "Neighbourhood-level, hard to fake." },
];

/** Per source: do you have a record there, and does it match your site exactly? */
export interface SourceState {
  present: boolean;
  /** Same name, same address, same phone as the site. */
  consistent: boolean;
}

export type CorroborationAnswers = Record<string, SourceState>;

export interface CorroborationReading {
  /** Independent domains carrying a record. */
  reach: number;
  /** Of those, how many agree with the site. */
  consistent: number;
  /** Records that exist and disagree. Never netted against `consistent`. */
  conflicts: number;
  /** Anchor sources with no record at all. */
  missingAnchors: CitationSource[];
  /** Anchor sources whose record disagrees — worse than absent. */
  conflictingAnchors: CitationSource[];
  /**
   * Can an independent resolver confirm this is one business?
   *
   * The rule, stated rather than scored: every anchor present, and no anchor
   * in conflict. A conflicting anchor fails this on its own, because one
   * authoritative record disagreeing with another is the exact condition that
   * splits an entity in two.
   */
  corroborated: boolean;
}

export function readCorroboration(answers: CorroborationAnswers): CorroborationReading {
  const state = (s: CitationSource) => answers[s.key] ?? { present: false, consistent: false };
  const present = CITATION_SOURCES.filter((s) => state(s).present);
  const consistent = present.filter((s) => state(s).consistent);
  const anchors = CITATION_SOURCES.filter((s) => s.anchor);

  const missingAnchors = anchors.filter((s) => !state(s).present);
  const conflictingAnchors = anchors.filter((s) => state(s).present && !state(s).consistent);

  return {
    reach: present.length,
    consistent: consistent.length,
    conflicts: present.length - consistent.length,
    missingAnchors,
    conflictingAnchors,
    corroborated: missingAnchors.length === 0 && conflictingAnchors.length === 0,
  };
}

/**
 * Graph geometry for the web, computed rather than art-directed.
 *
 * Sources are placed on concentric rings by kind so the picture means
 * something: anchors sit closest to the centre because they are what a
 * resolver reaches for first. Deterministic — no randomness, so the same
 * answers always draw the same web and a screenshot stays true.
 */
export interface WebNode {
  key: string;
  label: string;
  x: number;
  y: number;
  present: boolean;
  consistent: boolean;
  anchor: boolean;
}

export function webLayout(answers: CorroborationAnswers, radius: number): WebNode[] {
  const anchors = CITATION_SOURCES.filter((s) => s.anchor);
  const outer = CITATION_SOURCES.filter((s) => !s.anchor);

  const place = (list: CitationSource[], r: number, offset: number): WebNode[] =>
    list.map((s, i) => {
      const angle = offset + (i / list.length) * Math.PI * 2;
      const st = answers[s.key] ?? { present: false, consistent: false };
      return {
        key: s.key,
        label: s.name,
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        present: st.present,
        consistent: st.consistent,
        anchor: s.anchor,
      };
    });

  return [
    ...place(anchors, radius * 0.5, -Math.PI / 2),
    ...place(outer, radius, -Math.PI / 2 + Math.PI / outer.length),
  ];
}
