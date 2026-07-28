/**
 * The contents page for the instrument deck.
 *
 * WHY THIS IS NOT IN THE PAGE
 *   It was, and it drifted the first time the deck was re-ordered. The page
 *   printed one order, the deck rendered another, and the numbers a visitor
 *   read down the left-hand side of the site belonged to whichever file had
 *   been edited last. Nothing errored — a contents page cannot tell that its
 *   anchors point somewhere else.
 *
 *   So the index lives here, the deck renders in this order, and
 *   `consistency.test.ts` reads both and fails if they disagree.
 *
 * `folded` marks the tools behind the "more tools" disclosure. They are listed
 * anyway and their links work — the deck opens whichever fold contains the
 * target. Quietly dropping them to make the index look shorter would trade an
 * honest page for three fewer rows.
 */
export interface DeckEntry {
  /** Printed down the left of the module. "◇" for the map, which is not a tool. */
  n: string;
  /** The anchor the instrument renders. */
  id: string;
  name: string;
  /** One line: what does looking at this tell you? */
  reads: string;
  /** True when it lives behind the "more tools" fold. */
  folded?: boolean;
}

export const DECK_INDEX: DeckEntry[] = [
  { n: "◇", id: "map", name: "The System Map", reads: "The whole thing in one object" },
  { n: "00", id: "matrix", name: "What You're Already Paying For", reads: "Who covers what today" },
  { n: "01", id: "inspector", name: "Can AI Find You?", reads: "What ChatGPT knows about you" },
  { n: "02", id: "clock", name: "What a Missed Call Costs", reads: "In dollars, on your numbers" },
  { n: "03", id: "compose", name: "Build Your Package", reads: "What it all adds up to" },
  {
    n: "04",
    id: "fan",
    name: "The Questions You Lose",
    reads: "Where you're not even in the running",
    folded: true,
  },
  {
    n: "05",
    id: "web",
    name: "Does Anyone Back You Up?",
    reads: "Whether other sites agree",
    folded: true,
  },
  {
    n: "06",
    id: "marginal",
    name: "Where Your Next Ad Dollar Goes",
    reads: "Which channel has room left",
    folded: true,
  },
];

/** The map is the shape of the machine, not one of the tools it holds. */
export const TOOL_IDS = DECK_INDEX.filter((d) => d.id !== "map").map((d) => d.id);
