/**
 * The upgrade catalogue.
 *
 * DIRECTION
 *   This site is not an agency and does not sell a growth programme.
 *   PHX/GROWTH does that at phxgrowth.com — "the autonomous media buyer that
 *   flies your ad spend to profit" — with three à la carte services and three
 *   managed flight plans on top of them.
 *
 *   PHX/GROWTH PLUS sells one thing: specialised upgrades that bolt onto those
 *   services. Every upgrade names the service it attaches to, because an
 *   upgrade that attaches to nothing is a second agency in disguise.
 *
 * THE RULES
 *   1. ATTACHED. Every upgrade names a real PHX/GROWTH service.
 *   2. ADDITIVE vs THE SERVICE. No upgrade may sell something that service
 *      already lists. `PARENT_SERVICES[].includes` is a verbatim copy of their
 *      own bullet list and `upgrades.test.ts` reads it.
 *   3. ADDITIVE vs THE ROSTER. No upgrade may sell what one of the ten named
 *      operators already does. This rule earned its place immediately: an
 *      AI-search upgrade, a map-pack upgrade, a reviews upgrade and a
 *      multi-channel inbox upgrade all turned out to be Herald, Echo and
 *      Closer's day jobs, and all four were cut. Selling a client something
 *      they already pay for is the fastest way to lose both the sale and the
 *      relationship, and the only reliable defence is a machine check.
 *
 *   The surviving upgrades are deliberately few. A short honest list beats a
 *   long one with four duplicates in it.
 *
 * THE 2027 FILTER
 *   Only work whose demand is visibly rising into 2027 belongs here, and each
 *   entry says *why* in `demandCase` — a mechanism, not a slogan. Three shifts
 *   everything is downstream of:
 *
 *     1. Answers replaced links. Buyers get a recommendation from an assistant
 *        instead of ten blue links, so being the source it quotes is a
 *        different job from ranking.
 *     2. Signal loss. Tracking built on third-party cookies keeps degrading, so
 *        measurement has to move onto data the business owns.
 *     3. Response time became the product. When every competitor advertises the
 *        same offer, the one that answers in seconds books the job.
 *
 *   Deliberately absent: invented statistics. Nothing here claims a percentage
 *   we cannot stand behind — a test enforces it.
 */

export type ServiceKey = "premium-ai-ads" | "ai-employees" | "website-creation";

export interface ParentService {
  key: ServiceKey;
  /** Exactly as PHX/GROWTH names it. */
  name: string;
  /** Their price, as their page states it. */
  priceLabel: string;
  /** Their performance fee line, where there is one. */
  feeLabel?: string;
  /** Their one-line description, near enough verbatim. */
  role: string;
  /** Their own bullet list. The additive rule is checked against this. */
  includes: string[];
  /** The limit of the service as sold — what the upgrades answer. */
  ceiling: string;
}

/**
 * What PHX/GROWTH already runs. Nothing here is ours and nothing on this site
 * replaces any of it — every upgrade assumes it is already flying.
 */
export const PARENT_SERVICES: ParentService[] = [
  {
    key: "premium-ai-ads",
    name: "Premium AI Ads",
    priceLabel: "from $7,500/mo",
    feeLabel: "+ 12% of ad spend",
    role: "Scroll-stopping ad copy, policy-cleared, with a visual brief — fresh on demand.",
    includes: [
      "Platform-native copy sets",
      "Policy compliance screen",
      "On-brand visual briefs",
      "Fresh creative on demand",
    ],
    ceiling:
      "It writes the ad and Prism briefs the visual. What no operator does is change the deal you're offering, put a real camera in front of anything, or lay the server-side plumbing Ledger has to read from.",
  },
  {
    key: "ai-employees",
    name: "AI Employees",
    priceLabel: "from $7,000/mo",
    role: "A crew of AI operators in your Slack, with a first-week deployment plan.",
    includes: [
      "Specialist agent crew",
      "First-week deployment plan",
      "Lives in your Slack",
      "Works 24/7",
    ],
    ceiling:
      "Ten operators cover strategy through reputation, and Closer works every lead across email, SMS and DM. Two things are still nobody's job: the phone when it rings, and grading the crew's own output against the deals that actually closed.",
  },
  {
    key: "website-creation",
    name: "Website Creation",
    priceLabel: "from $3,500 one-time",
    role: "A complete, conversion-built website — live, hosted and kept sharp on the PHXGrowth engine.",
    includes: [
      "Sitemap + conversion copy",
      "Responsive, accessible build",
      "Deployed to a live URL",
      "Hosted & managed by PHXGrowth",
    ],
    ceiling:
      "You get a fast site at a live URL, and Herald wins it rankings and the map pack. What nothing covers is the buyer who never reaches a results page — they ask an assistant — and the pages themselves never being tested once they're live.",
  },
];

/** Their managed tiers, shown so a visitor can see where upgrades sit. */
export interface FlightPlan {
  key: string;
  /** Their eyebrow — PILOT / SQUADRON / FLEET. */
  code: string;
  name: string;
  promise: string;
  price: string;
  fee: string;
  ceilingNote: string;
  badge?: string;
}

export const FLIGHT_PLANS: FlightPlan[] = [
  {
    key: "pilot",
    code: "Pilot",
    name: "Pilot",
    promise: "One channel, fully flown to profit",
    price: "$5,000/mo",
    fee: "+ 8% of ad spend",
    ceilingNote: "Up to $50k/mo managed",
  },
  {
    key: "squadron",
    code: "Squadron",
    name: "Squadron",
    promise: "The full media mix, flown as one portfolio",
    price: "$12,500/mo",
    fee: "+ 6% of ad spend",
    ceilingNote: "Up to $250k/mo managed",
    badge: "Most flown",
  },
  {
    key: "fleet",
    code: "Fleet",
    name: "Fleet Command",
    promise: "No ceiling. Your own air force.",
    price: "$30,000/mo",
    fee: "+ 4% of ad spend",
    ceilingNote: "Unlimited spend managed",
    badge: "Apex",
  },
];


/**
 * The roster. Ten named operators, exactly as the AI Employees page lists them.
 *
 * This is not decoration — it is the thing every upgrade is checked against.
 * PHX/GROWTH's crew is far more complete than an outsider would guess, and
 * three upgrades that looked obviously additive turned out to be work Herald
 * and Echo already do. Keeping the roster here, in the same file as the
 * catalogue, is what makes that collision impossible to miss.
 */
export interface Operator {
  name: string;
  role: string;
  /** Their eyebrow: STRATEGY, MEDIA BUYING, CREATIVE… */
  domain: string;
  /** Their chip: FLIGHT PLAN, CONTROL STICK, TOP SLOT… */
  chip: string;
  /** What it does, near enough verbatim — the additive rule reads this. */
  covers: string;
}

export const OPERATORS: Operator[] = [
  {
    name: "Atlas",
    role: "Growth Strategist",
    domain: "Strategy",
    chip: "Flight Plan",
    covers:
      "Researches the product, market, competitors, offers, personas, objections and channel fit before a single dollar leaves the runway.",
  },
  {
    name: "Vector",
    role: "Autonomous Media Buyer",
    domain: "Media Buying",
    chip: "Control Stick",
    covers:
      "Flies Meta, Google and TikTok as one portfolio and shifts spend by marginal return on your P&L, lifecycle-aware, on a 15-minute optimisation loop.",
  },
  {
    name: "Prism",
    role: "Creative Genome Director",
    domain: "Creative",
    chip: "Forge Lead",
    covers:
      "Breaks creative into hooks, frames, pacing, claims and emotional arcs, then recombines the winning genes into render-ready briefs for the Creative Forge.",
  },
  {
    name: "Ledger",
    role: "Profit & Attribution Analyst",
    domain: "Economics",
    chip: "Ground Truth",
    covers:
      "Reconciles platform-reported ROAS against Shopify orders, returns, COGS, LTV and QuickBooks so the buyer steers by contribution profit.",
  },
  {
    name: "Shield",
    role: "Compliance Guard",
    domain: "Trust",
    chip: "Preflight",
    covers:
      "Reviews copy, targeting, landing pages and creative against platform-sensitive categories before anything goes live.",
  },
  {
    name: "Relay",
    role: "Automation Engineer",
    domain: "Automation",
    chip: "Wiring Bay",
    covers:
      "Owns the app routes, connector registry, n8n webhooks and Zapier handoffs that turn agent decisions into external actions.",
  },
  {
    name: "Tower",
    role: "Operations Commander",
    domain: "Operations",
    chip: "Mission Control",
    covers:
      "Coordinates the specialist agents, checks builds and production health, and turns incidents into clear next actions.",
  },
  {
    name: "Closer",
    role: "AI Sales Closer",
    domain: "Sales",
    chip: "Approach",
    covers:
      "Reads each inbound lead the second it lands, qualifies on fit and intent, and runs a persistent follow-up cadence across email, SMS and DM until the deal is booked or dead.",
  },
  {
    name: "Herald",
    role: "SEO & Local Rank Commander",
    domain: "Search",
    chip: "Top Slot",
    covers:
      "Hunts the keywords your buyers type, ships the pages and Google Business updates that win them, and watches the map pack daily.",
  },
  {
    name: "Echo",
    role: "Reputation & Reviews Concierge",
    domain: "Reputation",
    chip: "Five Star",
    covers:
      "Times the review ask for the moment a customer is happiest, routes them to a public review, catches unhappy ones privately, and answers every review in your voice.",
  },
];

export function operatorByName(name: string): Operator | undefined {
  return OPERATORS.find((o) => o.name === name);
}

export type Billing = "monthly" | "one_time";

export interface Upgrade {
  key: string;
  name: string;
  /** Which PHX/GROWTH service this bolts onto. */
  attachesTo: ServiceKey;
  /** One line, in the owner's language, on what changes. */
  promise: string;
  /** Why demand for this is rising into 2027. A mechanism, not a slogan. */
  demandCase: string;
  /** Exactly what is delivered. Concrete enough that the price reads as earned. */
  delivers: string[];
  /** Cents. */
  price: number;
  billing: Billing;
  /** The single hardest thing this fixes — the card's kicker. */
  fixes: string;
  /** One per service: the one most clients take first. */
  leading?: boolean;
  /** The apex upgrade — gets the gold treatment, exactly one on the page. */
  apex?: boolean;
}

/**
 * Ordered most expensive first within each service, so the first price read is
 * the highest and everything after is judged against that rather than zero.
 */
export const UPGRADES: Upgrade[] = [
  // ---- On Premium AI Ads ----
  {
    key: "offer-lab",
    name: "The Offer Lab",
    attachesTo: "premium-ai-ads",
    promise: "Change what you're selling, not how it's worded.",
    demandCase:
      "Atlas researches your offer against the market; nobody rebuilds it. That distinction matters more every quarter: when every competitor buys the same impressions with the same targeting and the same class of AI creative, media skill converges and the deal itself becomes the only real variable left. This is two weeks of humans arguing about price, guarantee and margin — a decision about your business, which is not a job to hand an agent.",
    delivers: [
      "Two weeks rebuilding the deal itself — price, terms, guarantee, risk reversal",
      "Bonus and bundle structure with the margin modelled before it ships",
      "Tested against your last hundred lost deals, not against a persona",
      "Handed to Atlas and Prism as the new brief once it's signed off",
    ],
    price: 590000,
    billing: "one_time",
    fixes: "An offer nobody argues with",
    apex: true,
  },
  {
    key: "motion-unit",
    name: "The Motion Unit",
    attachesTo: "premium-ai-ads",
    promise: "Footage. Real people, real cameras — the part a brief can't produce.",
    demandCase:
      "Prism decides what the winning ad should be and hands a render-ready brief to the Forge. What it cannot do is put a human in front of a lens. Feeds keep tilting toward footage that looks captured rather than generated, and the accounts that stall are the ones with a full brief queue and nothing shot. This is the camera at the end of that pipeline.",
    delivers: [
      "Ten filmed spots a month — creator, founder or customer, sourced and directed",
      "Shot to Prism's brief, so the genome work isn't wasted",
      "Vertical, square and in-feed cuts of every winner",
      "Licensing, usage rights and raw footage handed to you",
    ],
    price: 420000,
    billing: "monthly",
    fixes: "A brief queue with nothing shot",
    leading: true,
  },
  {
    key: "instrument-rebuild",
    name: "Instrument Rebuild",
    attachesTo: "premium-ai-ads",
    promise: "Build the plumbing Ledger reads from — server-side, and yours.",
    demandCase:
      "Ledger reconciles what the platforms report against your books, which makes the numbers honest. It does not lay the pipe. Most accounts still feed the platforms through browser-side tags built for third-party cookies that keep being withdrawn, so the signal degrading is upstream of any analysis of it. Platforms increasingly optimise on data you send rather than data they collect, which makes this infrastructure with a deadline attached.",
    delivers: [
      "Server-side tagging you own, running in your cloud, not a browser",
      "Meta CAPI and Google enhanced conversions posting real revenue",
      "Call and form events joined to ad, keyword and eventual job value",
      "Wired into Ledger and Relay so the crew reads it the day it's live",
    ],
    price: 280000,
    billing: "one_time",
    fixes: "Signal that decays upstream",
  },

  // ---- On AI Employees ----
  {
    key: "voice-employee",
    name: "The Voice Employee",
    attachesTo: "ai-employees",
    promise: "The eleventh operator: the one that picks up the phone.",
    demandCase:
      "Closer works every lead across email, SMS and DM and is usually first — but it cannot answer a ringing phone, and for most local businesses the phone is still where the money calls. A caller who reaches voicemail dials the next number, so this leaks more revenue than any bidding decision. Answering around the clock was a staffing cost nobody could justify; it is now a software cost, which is why demand is moving here fastest.",
    delivers: [
      "Inbound calls answered 24/7 in your business's voice, first ring",
      "Qualification, quoting rules and calendar booking handled on the call",
      "Missed-call text-back within seconds, handed straight to Closer",
      "Full transcript and recording on the flight deck before you wake up",
    ],
    price: 190000,
    billing: "monthly",
    fixes: "The phone nobody answers",
    leading: true,
  },
  {
    key: "training-lab",
    name: "The Training Lab",
    attachesTo: "ai-employees",
    promise: "Grade the crew against closed deals and retrain on what actually won.",
    demandCase:
      "Tower keeps the crew coordinated and healthy — that is an operations job, not a coaching one. Nobody is reading last month's transcripts against what the deals actually did and rewriting the prompts accordingly. A crew left untuned drifts as your offers and objections change, and the teams getting compounding returns are the ones closing that loop deliberately every month.",
    delivers: [
      "Every conversation graded against what the deal actually did",
      "Prompts, qualification bars and escalation rules retuned monthly",
      "New objections and offers taught the week they appear",
      "A written read-out of what changed and what it moved",
    ],
    price: 160000,
    billing: "monthly",
    fixes: "A crew that drifts",
  },

  // ---- On Website Creation ----
  {
    key: "answer-engine",
    name: "Answer Engine Visibility",
    attachesTo: "website-creation",
    promise: "Herald owns Google. This owns the assistants that answer instead of it.",
    demandCase:
      "Herald hunts keywords, ships pages and watches the map pack — that is search, and it is handled. A growing share of buyers never reach a results page at all: they ask an assistant and act on two or three names. Being cited there is a different discipline from ranking — structured, verifiable facts a model can quote, consistent everywhere it reads you — and almost nobody is doing it yet, which is exactly why it is worth doing now.",
    delivers: [
      "Services, areas, hours, prices and credentials published as machine-readable facts",
      "Answer pages written for what buyers ask an assistant, not what they type into Google",
      "Entity and citation consistency repaired everywhere a model reads you",
      "Monthly report of what the major assistants say when asked about your category",
    ],
    price: 290000,
    billing: "monthly",
    fixes: "Absent from AI answers",
    leading: true,
  },
  {
    key: "conversion-lab",
    name: "The Conversion Lab",
    attachesTo: "website-creation",
    promise: "A structured test running against your live pages every single month.",
    demandCase:
      "Website Creation ships a conversion-built site and keeps it hosted; Herald adds pages that win rankings. Neither runs experiments on what is already live. As traffic gets more expensive to buy, the cheapest growth left is converting more of what you have already paid for — and that only compounds if somebody is testing continuously rather than redesigning once a year.",
    delivers: [
      "One structured page test live at all times, with the win condition set first",
      "Session recordings and scroll maps read by a human, monthly",
      "Winners promoted into the control and handed to Herald and Prism",
      "Conversion rate reported against the month it replaced",
    ],
    price: 240000,
    billing: "monthly",
    fixes: "A site that never gets tested",
  },
];

export function serviceByKey(key: ServiceKey): ParentService | undefined {
  return PARENT_SERVICES.find((s) => s.key === key);
}

export function upgradesFor(service: ServiceKey): Upgrade[] {
  return UPGRADES.filter((u) => u.attachesTo === service);
}

export function upgradeByKey(key: string): Upgrade | undefined {
  return UPGRADES.find((u) => u.key === key);
}

/** Cheapest monthly upgrade, for the "from" line in the hero. */
export function entryPrice(): number {
  return Math.min(...UPGRADES.filter((u) => u.billing === "monthly").map((u) => u.price));
}

/**
 * The promise the page is held to. Stated here so the hero, the metadata and
 * the share card cannot say three different things.
 */
export const THESIS = {
  eyebrow: "Upgrades & Add-Ons",
  headline: "Every upgrade. One flight plan.",
  body: "PHX/GROWTH flies your account. This is the specialised work that bolts onto it — the parts of 2027 nobody has staffed yet. Nothing here replaces your crew, restarts your onboarding, or duplicates a single thing you already pay for.",
} as const;

/**
 * The guarantee, matched word-for-word in substance to the parent's 30-Day
 * Flight Check. Offering a *different* guarantee on the upgrade counter would
 * make a client wonder which one applies — so it is the same one.
 */
export const FLIGHT_CHECK = {
  label: "The 30-Day Flight Check",
  body: "Every upgrade runs under the same flight check as the rest of your account. Fly it for 30 days. If it hasn't cut waste and shipped work that moves your numbers, we'll make it right or part as friends — no lock-in, and your accounts and data leave with you.",
} as const;

/**
 * The fine print, in plain English — the parent's own section title. On
 * four-figure monthly work the commitment is the objection, so answering it in
 * public is worth more than any badge.
 */
export const FAIR_QUESTIONS: { q: string; a: string }[] = [
  {
    q: "How does this bill?",
    a: "Monthly upgrades are month-to-month with no lock-in — cancel ahead of any renewal. One-time builds are billed up front and you own the result. Upgrades appear on your existing PHX/GROWTH invoice; there is no second account to set up.",
  },
  {
    q: "Do I need to be a PHX/GROWTH client?",
    a: "Yes. Every upgrade bolts onto a service that has to already be running — Premium AI Ads, AI Employees or Website Creation, à la carte or inside a managed flight plan. If you're not flying with PHX/GROWTH yet, start there and come back.",
  },
  {
    q: "Does this change my performance fee?",
    a: "No. The performance fee is a percentage of the ad spend PHX/GROWTH actively manages — 8% on Pilot, 6% on Squadron, 4% on Fleet Command. Upgrades are flat and sit outside it entirely.",
  },
  {
    q: "Will this duplicate something I already pay for?",
    a: "It can't. Each upgrade is written against the exact bullet list of the service it attaches to, and anything already included is out of scope by construction. If you think you're being sold something twice, say so and we'll cut it.",
  },
  {
    q: "Who actually does the work?",
    a: "The same team already flying your account, with the specialists a given upgrade needs — a producer for the Motion Unit, a local search lead for the map pack. You keep one point of contact and the same Slack war room.",
  },
];
