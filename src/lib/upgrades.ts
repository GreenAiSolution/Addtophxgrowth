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
 * THE TWO RULES
 *   1. ATTACHED. Every upgrade names a real PHX/GROWTH service.
 *   2. ADDITIVE. No upgrade may sell something that service already includes.
 *      `PARENT_SERVICES[].includes` is a verbatim copy of their own bullet
 *      list, and `upgrades.test.ts` reads it — so if the parent ever starts
 *      shipping call answering as standard, the Voice Employee has to change
 *      or go. Selling a client something they are already paying for is the
 *      fastest way to lose both the sale and the relationship.
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
      "It writes the ad and briefs the visual. What it cannot do is change what you're actually selling, put a camera on it, or tell you which spend produced which booked job.",
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
      "The crew works 24/7 inside Slack. The channels your customers actually arrive on — the phone at 9pm, the Instagram DM, the web chat — are not Slack, and nobody is staffing them.",
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
      "You get a fast, well-built site at a live URL. Whether anyone ever finds it — in the map pack, in an AI answer, in the reviews they read before calling — is a separate job that runs every month.",
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
    promise: "Fix what you're selling before flying another dollar behind it.",
    demandCase:
      "When every competitor buys the same impressions with the same targeting and the same class of AI creative, media skill converges and the offer becomes the only real variable left. As costs rise, the businesses holding their margins are the ones that changed the deal, not the bid — and no ad engine can do that for you, because it is a decision about your business rather than your copy.",
    delivers: [
      "Two weeks rebuilding what you actually sell, not how you describe it",
      "Pricing, guarantee and risk reversal designed together",
      "Bonus and bundle structure with the margin worked out first",
      "The new offer rewritten across ads, landing page and phone script",
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
    promise: "Actual video — shot, cut and captioned — not a brief for one.",
    demandCase:
      "Every feed that matters now rewards video and punishes static, and the cycle keeps shortening. A visual brief tells someone what to make; it does not put a camera in front of anything. Production capacity is what the ceiling is made of once the copy is already good, and it is the one part of the pipeline that has stayed stubbornly human.",
    delivers: [
      "10 finished video ads a month, cut from your footage or shot by us",
      "Five hook variants against whatever is currently winning",
      "Vertical, square and in-feed versions of everything",
      "Captions burned in, thumbnails designed, delivered ready to fly",
    ],
    price: 420000,
    billing: "monthly",
    fixes: "Briefs that never became video",
    leading: true,
  },
  {
    key: "instrument-rebuild",
    name: "Instrument Rebuild",
    attachesTo: "premium-ai-ads",
    promise: "Know which dollar produced which booked job — not which click.",
    demandCase:
      "The measurement most accounts still run was built for third-party cookies and device identifiers that keep being withdrawn. Platforms increasingly optimise on the data you send them rather than the data they can collect, so an advertiser who owns their first-party signal gets better delivery than one who does not. This is a rebuild with a deadline attached.",
    delivers: [
      "Server-side conversion tracking you own, not rented from a browser",
      "Meta CAPI and Google enhanced conversions sending real revenue back",
      "Call tracking joined to the ad, the keyword and the eventual job value",
      "One view where spend and booked work sit on the same line",
    ],
    price: 280000,
    billing: "one_time",
    fixes: "Numbers you can't trust",
  },

  // ---- On AI Employees ----
  {
    key: "voice-employee",
    name: "The Voice Employee",
    attachesTo: "ai-employees",
    promise: "Every call answered on the first ring, at 9pm on a Sunday, and booked.",
    demandCase:
      "Most local businesses lose more money to unanswered calls than to any bidding decision, and the caller who reaches voicemail simply dials the next number. A crew that lives in Slack cannot pick up a phone. Answering around the clock has always been a staffing cost nobody could justify; it is now a software cost, which is why demand is moving here fastest.",
    delivers: [
      "Inbound calls answered 24/7 in your business's voice",
      "Qualification, quoting rules and calendar booking handled on the call",
      "Missed-call text-back within seconds, every time",
      "Full transcript and recording in your CRM before you wake up",
    ],
    price: 190000,
    billing: "monthly",
    fixes: "Calls going to voicemail",
    leading: true,
  },
  {
    key: "training-lab",
    name: "The Training Lab",
    attachesTo: "ai-employees",
    promise: "Your crew gets measurably better every month instead of drifting.",
    demandCase:
      "A first-week deployment plan is the start line, not the finish. An AI employee left alone degrades — the business changes, the offers change, the script does not. The teams getting compounding returns are grading real transcripts against real closed deals and retraining on what actually worked. That is ongoing by nature, and it is what separates an asset from a demo.",
    delivers: [
      "Every conversation graded against what the deal actually did",
      "Prompts, qualification bars and escalation rules retuned monthly",
      "New objections and offers taught the week they appear",
      "A written read-out of what changed and what it moved",
    ],
    price: 160000,
    billing: "monthly",
    fixes: "A crew stuck at week one",
  },
  {
    key: "inbox-employee",
    name: "The Inbox Employee",
    attachesTo: "ai-employees",
    promise: "Web chat, Instagram, Facebook and SMS answered in under a minute.",
    demandCase:
      "Enquiries have scattered across channels nobody owns, and each has its own expectation of speed — a form can wait an hour, a DM cannot. Covering all of them with people means hiring for the quietest hour of the week. The crew already works 24/7; this simply gives it the doors your customers are actually knocking on.",
    delivers: [
      "Web chat, Instagram, Facebook, Google and SMS from one brain",
      "Qualified, quoted and booked without a hand-off where the rules allow",
      "Anything unusual escalated to a named human with the context attached",
      "Every thread filed to your CRM against the right contact",
    ],
    price: 140000,
    billing: "monthly",
    fixes: "Messages sitting unread",
  },

  // ---- On Website Creation ----
  {
    key: "answer-engine",
    name: "AI Search Visibility",
    attachesTo: "website-creation",
    promise: "Be the business the assistant names when someone asks who to call.",
    demandCase:
      "A buyer who once typed a query and scanned ten results now asks an assistant and gets a short list of two or three. A fast, well-built site that is never cited is invisible in that world. Being the source a model quotes is a different discipline — structured facts, verifiable claims, consistent answers everywhere it reads you — and almost nobody is doing it yet, which is precisely why it is worth doing now.",
    delivers: [
      "Your services, areas, hours, prices and credentials published as machine-readable facts",
      "Answer pages written for the questions buyers actually ask an assistant",
      "Entity and citation consistency repaired everywhere a model reads you",
      "Monthly report of what the major assistants say about your category",
    ],
    price: 290000,
    billing: "monthly",
    fixes: "Invisible in AI answers",
    leading: true,
  },
  {
    key: "map-pack",
    name: "Map Pack & Local Service Ads",
    attachesTo: "website-creation",
    promise: "Own the three results that sit above everything else in your city.",
    demandCase:
      "For local businesses the map pack and the paid local slots above it take the majority of the intent before an organic result is ever seen. That real estate is won on proximity, review velocity and profile completeness — operational work rather than a clever page — which is exactly why it holds its value while everything else gets automated.",
    delivers: [
      "Google Business Profile run properly: categories, services, products, weekly posts",
      "Local Service Ads set up, verified and managed against booked-job cost",
      "A page per service, per suburb you actually serve — built to compete",
      "Rank tracking by keyword and by map grid, reported monthly",
    ],
    price: 210000,
    billing: "monthly",
    fixes: "Beaten locally by smaller shops",
  },
  {
    key: "review-engine",
    name: "Review Velocity Engine",
    attachesTo: "website-creation",
    promise: "A steady arrival of real reviews, answered fast, without anyone remembering.",
    demandCase:
      "Reviews now do double duty: they move local ranking, and they are the summary an assistant repeats when it describes you. Both reward recency, so a business with two hundred old reviews loses to one with forty recent ones. That turns review flow from a campaign you run once into a system that has to keep running.",
    delivers: [
      "Review requests fired automatically the moment a job completes",
      "Replies drafted in your voice, every review answered within a day",
      "Anything under four stars escalated to a human before it hardens",
      "Velocity and rating tracked against your three closest competitors",
    ],
    price: 120000,
    billing: "monthly",
    fixes: "Reviews that arrive by accident",
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
