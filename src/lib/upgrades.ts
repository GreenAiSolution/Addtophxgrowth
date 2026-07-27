/**
 * The upgrade catalogue.
 *
 * DIRECTION
 *   This site is not an agency and does not sell a growth programme. PHX Growth
 *   does that, at phxgrowth.com, across three services: AI Employees, Ad Growth
 *   Management, and Web / SEO / Paid Ads for local businesses.
 *
 *   PHX Growth Plus sells one thing: specialised upgrades that bolt onto those
 *   three. Every upgrade here must therefore name the service it attaches to —
 *   an upgrade that attaches to nothing is a second agency in disguise, which is
 *   what this rebuild exists to remove.
 *
 * THE 2027 FILTER
 *   Only work whose demand is visibly rising into 2027 belongs on this page,
 *   and each entry has to say *why* in `demandCase` — a mechanism, not a
 *   slogan. The three shifts everything here is downstream of:
 *
 *     1. Answers replaced links. Buyers increasingly get a recommendation from
 *        an AI assistant instead of a page of ten blue links, so being the
 *        source that assistant quotes is a different job from ranking.
 *     2. Signal loss. Tracking that depended on third-party cookies and browser
 *        identifiers keeps degrading, so measurement has to be rebuilt on data
 *        the business owns.
 *     3. Response time became the product. When every competitor advertises the
 *        same offer, the one that answers in seconds wins the job — and that is
 *        now a staffing problem software can solve.
 *
 *   Deliberately absent: invented statistics. Nothing here claims a percentage
 *   we cannot stand behind, because the entire pitch of this page is that it
 *   tells the truth about what it sells.
 */

export type ServiceKey = "ai-employees" | "ad-growth" | "web-seo-ads";

export interface ParentService {
  key: ServiceKey;
  /** Exactly as PHX Growth names it. */
  name: string;
  /** What the service does, so an upgrade reads as an addition to it. */
  role: string;
  /** The limit of the service as sold — what the upgrades are answering. */
  ceiling: string;
}

/**
 * What PHX Growth already runs. Nothing on this site replaces any of it; every
 * upgrade assumes it is in place and makes it do more.
 */
export const PARENT_SERVICES: ParentService[] = [
  {
    key: "ai-employees",
    name: "AI Employees",
    role: "Software that does a job a person used to do — answering, qualifying, following up, writing it down.",
    ceiling:
      "An AI employee is only as good as what it was taught and how much of the day it actually covers. Out of the box it handles the common case; the money is in the hours and channels nobody staffed.",
  },
  {
    key: "ad-growth",
    name: "Ad Growth Management",
    role: "A team on your ad accounts — budget, structure, bidding, and the reporting that explains it.",
    ceiling:
      "Management makes an account efficient. It cannot make a tired ad interesting, fix an offer nobody wants, or measure what the platforms have stopped reporting.",
  },
  {
    key: "web-seo-ads",
    name: "Web, SEO & Paid Ads",
    role: "The site, the search visibility and the paid traffic that bring local buyers to you in the first place.",
    ceiling:
      "Ranking on a page of links is a smaller prize every quarter. The visibility that matters now is being the answer — in the map pack, in the assistant, in the reviews someone reads before calling.",
  },
];

export type Billing = "monthly" | "one_time";

export interface Upgrade {
  key: string;
  name: string;
  /** Which PHX Growth service this bolts onto. */
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
  /** The single hardest thing this fixes — used as the card's kicker. */
  fixes: string;
  /** One per service: the one most clients take first. */
  leading?: boolean;
}

/**
 * Ordered most expensive first within each service, so the first price a
 * visitor reads is the highest one and everything after it is judged against
 * that reference rather than against zero.
 */
export const UPGRADES: Upgrade[] = [
  // ---- Web, SEO & Paid Ads ----
  {
    key: "answer-engine",
    name: "AI Search Visibility",
    attachesTo: "web-seo-ads",
    promise: "Be the business the assistant names when someone asks it who to call.",
    demandCase:
      "A buyer who once typed a query and scanned ten results now asks an assistant and gets a short list of two or three. Ranking fourth on a page nobody opens is worth nothing in that world. Being cited as the source is a different discipline — structured facts, verifiable claims, and consistent answers across every place a model reads you — and almost nobody is doing it yet, which is exactly why it is worth doing now.",
    delivers: [
      "Your services, areas, hours, prices and credentials published as machine-readable facts",
      "Answer pages written for the questions buyers actually ask an assistant",
      "Entity and citation consistency repaired everywhere a model reads you",
      "Monthly report of what the major assistants say when asked about your category",
    ],
    price: 240000,
    billing: "monthly",
    fixes: "Invisible in AI answers",
    leading: true,
  },
  {
    key: "map-pack",
    name: "Map Pack & Local Service Ads",
    attachesTo: "web-seo-ads",
    promise: "Own the three results that appear above everything else in your city.",
    demandCase:
      "For local trades, the map pack and the paid local slots above it take the majority of the intent before an organic result is ever seen. That real estate is fought over on proximity, review velocity and profile completeness — operational work, not a clever page. It stays valuable precisely because it cannot be automated away.",
    delivers: [
      "Google Business Profile run properly: categories, services, products, weekly posts",
      "Local Service Ads set up, verified, and managed against booked-job cost",
      "A page per service, per suburb you actually serve — built to compete, not to exist",
      "Rank tracking by keyword and by map grid, reported monthly",
    ],
    price: 160000,
    billing: "monthly",
    fixes: "Beaten locally by smaller shops",
  },
  {
    key: "review-engine",
    name: "Review Velocity Engine",
    attachesTo: "web-seo-ads",
    promise: "A steady arrival of real reviews, answered fast, without anyone remembering to ask.",
    demandCase:
      "Reviews now do double duty: they move local ranking, and they are the summary an AI assistant repeats when it describes you. Both reward recency, so a business with two hundred old reviews loses to one with forty recent ones. That makes review flow an ongoing system rather than a campaign you run once.",
    delivers: [
      "Review requests fired automatically at the moment a job completes",
      "Replies drafted in your voice, every review answered within a day",
      "Anything under four stars escalated to a human before it hardens",
      "Velocity and rating tracked against your three closest competitors",
    ],
    price: 90000,
    billing: "monthly",
    fixes: "Reviews that arrive by accident",
  },

  // ---- AI Employees ----
  {
    key: "voice-employee",
    name: "The Voice Employee",
    attachesTo: "ai-employees",
    promise: "Every call answered on the first ring, at 9pm on a Sunday, and booked.",
    demandCase:
      "Most local businesses lose more money to unanswered calls than to any ad decision — and the caller who reaches voicemail simply dials the next number. Answering has been a staffing cost nobody could justify around the clock. It is now a software cost, which is why this is the upgrade demand is moving to fastest.",
    delivers: [
      "Inbound calls answered 24/7 in your business's voice",
      "Qualification, quoting rules and calendar booking handled on the call",
      "Missed-call text-back within seconds, every time",
      "Full transcript and recording written to your CRM before you wake up",
    ],
    price: 140000,
    billing: "monthly",
    fixes: "Calls going to voicemail",
    leading: true,
  },
  {
    key: "training-lab",
    name: "AI Employee Training Lab",
    attachesTo: "ai-employees",
    promise: "Your AI employees get measurably better every month instead of drifting.",
    demandCase:
      "An AI employee deployed and left alone degrades — the business changes, the offers change, and the script does not. The teams getting compounding returns are the ones grading real transcripts against real outcomes and retraining on what actually closed. That work is ongoing by nature, and it is what separates a demo from an asset.",
    delivers: [
      "Every conversation graded against what the deal actually did",
      "Prompts, qualification bars and escalation rules retuned monthly",
      "New objections and offers taught the week they appear",
      "A written read-out of what changed and what it moved",
    ],
    price: 120000,
    billing: "monthly",
    fixes: "An assistant stuck at day one",
  },
  {
    key: "inbox-employee",
    name: "The Inbox Employee",
    attachesTo: "ai-employees",
    promise: "Every message — web chat, Instagram, Facebook, SMS — answered in under a minute.",
    demandCase:
      "Enquiries have scattered across channels that nobody owns, and each one has its own expectation of speed. A form submission can wait an hour; a DM cannot. Covering all of them with people means hiring for the quietest hour of the week, which is why this work is moving to software.",
    delivers: [
      "Web chat, Instagram, Facebook, Google and SMS answered from one brain",
      "Qualified, quoted and booked without a hand-off where the rules allow it",
      "Anything unusual escalated to a named human with the context attached",
      "Every thread filed to your CRM against the right contact",
    ],
    price: 110000,
    billing: "monthly",
    fixes: "Messages sitting unread",
  },

  // ---- Ad Growth Management ----
  {
    key: "offer-lab",
    name: "The Offer Lab",
    attachesTo: "ad-growth",
    promise: "Fix what you're selling before spending another dollar amplifying it.",
    demandCase:
      "When every competitor buys the same impressions with the same targeting, media skill converges and the offer becomes the only real variable left. As advertising costs rise, the businesses that hold their margins are the ones that changed the deal, not the bid — and that is a strategic exercise, not an optimisation.",
    delivers: [
      "Two weeks rebuilding what you actually sell, not how you describe it",
      "Pricing, guarantee and risk reversal designed together",
      "Bonus and bundle structure with the margin worked out first",
      "The new offer rewritten across ads, landing page and phone script",
    ],
    price: 390000,
    billing: "one_time",
    fixes: "An offer nobody's arguing with",
  },
  {
    key: "creative-studio",
    name: "The Creative Refresh",
    attachesTo: "ad-growth",
    promise: "A fresh ad ready before the current one dies, every single month.",
    demandCase:
      "Feeds reward new creative and punish repetition, and the cycle keeps shortening. Accounts do not stall because the strategy was wrong; they stall because nothing new was ready on the day the winner wore out. Production capacity, not cleverness, is what the ceiling is made of now.",
    delivers: [
      "12 net-new ads a month — static, motion and vertical video",
      "Five hook variants cut against whatever is currently winning",
      "Fatigue watched on click-through, so refresh happens before cost rises",
      "A monthly teardown of what worked and what is being retired",
    ],
    price: 240000,
    billing: "monthly",
    fixes: "The same ad running too long",
    leading: true,
  },
  {
    key: "signal-rebuild",
    name: "Signal & Attribution Rebuild",
    attachesTo: "ad-growth",
    promise: "Know which dollar produced which booked job — not which click.",
    demandCase:
      "The measurement most accounts still run was built for third-party cookies and device identifiers that keep being taken away. Platforms increasingly optimise on data you send them rather than data they collect, so businesses that own their first-party signal get better delivery than those that do not. This is a rebuild with a deadline attached.",
    delivers: [
      "Server-side conversion tracking you own, not rented from a browser",
      "Meta CAPI and Google enhanced conversions sending real revenue back",
      "Call tracking joined to the ad, the keyword and the eventual job value",
      "One reporting view where spend and booked work sit on the same line",
    ],
    price: 180000,
    billing: "one_time",
    fixes: "Reporting you can't trust",
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

/** Cheapest monthly upgrade on the page, for the "from" line in the hero. */
export function entryPrice(): number {
  return Math.min(...UPGRADES.filter((u) => u.billing === "monthly").map((u) => u.price));
}

/**
 * The promise the page is held to. Stated here so the hero, the metadata and
 * the share card cannot say three different things.
 */
export const THESIS = {
  eyebrow: "Upgrades for PHX Growth clients",
  headline: "The parts of 2027 nobody has staffed yet.",
  body: "PHX Growth runs your AI employees, your ad growth and your search. This is where you bolt on the specialised work that is about to decide who wins locally — being the answer an assistant gives, owning the map, answering every call in one ring, and measuring it on data you actually own.",
} as const;

/**
 * What a client is committing to. Deliberately blunt and deliberately short —
 * on a page selling four-figure monthly upgrades, the terms are a conversion
 * asset, not fine print, and hiding them is what makes people leave.
 */
export const TERMS: { term: string; detail: string }[] = [
  {
    term: "Month to month",
    detail:
      "No contract and no minimum term on anything monthly. Stop it at the end of any month and nothing else you have with PHX Growth changes.",
  },
  {
    term: "Nothing charged today",
    detail:
      "This page takes an enquiry, not a payment. You will see the exact scope and the exact number in writing before anything is invoiced.",
  },
  {
    term: "It bolts on",
    detail:
      "Every upgrade assumes the PHX Growth service it attaches to is already running. Nothing here replaces your team, and nothing needs re-onboarding.",
  },
  {
    term: "You own the assets",
    detail:
      "Tracking, profiles, content and creative are built in your accounts, in your name. If you ever leave, they stay with you.",
  },
];
