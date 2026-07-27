/**
 * À la carte add-ons — the services clients most often need alongside a
 * membership, and the agency's highest-margin expansion revenue.
 *
 * Presentation is deliberately menu-like rather than a second wall of pricing
 * cards, and the ordering is not accidental:
 *
 * - ANCHORING — the most expensive item in each group is listed first, so
 *   everything after it is judged against a higher reference point.
 * - COMPROMISE / CENTER-STAGE EFFECT — exactly one item per group carries
 *   `mostPaired`, which reliably pulls choice toward it.
 * - BUNDLING — `ADDON_BUNDLE` prices three foundations together at a visible
 *   saving, which raises attach rate and makes per-item comparison harder.
 * - CHOICE ARCHITECTURE — `pairsWith` narrows the decision to the one or two
 *   items relevant to the plan a client already holds, instead of asking them
 *   to evaluate the whole list.
 *
 * Deliberately absent: countdown timers, fake "2 slots left" scarcity, and
 * strike-through prices that were never charged. Those lift short-term
 * conversion and cost trust — the wrong trade for a premium retainer.
 */

export type AddonBilling = "one_time" | "monthly";

export type AddonGroupKey = "foundations" | "growth" | "capacity";

export interface AddonDef {
  key: string;
  name: string;
  /** One line on what it is, in client language. */
  blurb: string;
  price: number; // cents
  billing: AddonBilling;
  group: AddonGroupKey;
  /** What's actually delivered — kept concrete so the price reads as earned. */
  includes: string[];
  /** Plan names this is most often added to; drives the pairing hint. */
  pairsWith: string;
  /** Exactly one per group. */
  mostPaired?: boolean;
}

export const ADDON_GROUPS: Record<
  AddonGroupKey,
  { label: string; note: string }
> = {
  foundations: {
    label: "Foundations",
    note: "Built once, then they compound. Most clients start here.",
  },
  growth: {
    label: "Growth Services",
    note: "Ongoing work that runs alongside your membership.",
  },
  capacity: {
    label: "Capacity",
    note: "More room on the plan you already have.",
  },
};

export const ADDONS: AddonDef[] = [
  // ---- Foundations (one-time) — anchor first ----
  {
    key: "funnel-build",
    name: "Conversion Funnel Build",
    blurb: "A landing page engineered for the traffic we're about to send it.",
    price: 450000,
    billing: "one_time",
    group: "foundations",
    pairsWith: "Operate & Dominate",
    includes: [
      "Offer and message architecture",
      "Designed + built landing page",
      "Form, CRM, and agent hand-off wired",
      "Two rounds of post-launch iteration",
    ],
    mostPaired: true,
  },
  {
    key: "crm-build",
    name: "CRM Migration & Automation",
    blurb: "Your pipeline rebuilt so the agents have somewhere clean to write.",
    price: 240000,
    billing: "one_time",
    group: "foundations",
    pairsWith: "Scale & Command",
    includes: [
      "HubSpot or GoHighLevel build-out",
      "Pipeline, stages, and fields mapped",
      "Historic data migrated and de-duped",
      "Agent → CRM automation tested end to end",
    ],
  },
  {
    key: "tracking-setup",
    name: "Tracking & Attribution",
    blurb: "Know which dollar produced which customer — not which click.",
    price: 180000,
    billing: "one_time",
    group: "foundations",
    pairsWith: "Any ad-ops plan",
    includes: [
      "GA4 + server-side conversion tracking",
      "Meta CAPI and Google enhanced conversions",
      "Call tracking with source attribution",
      "Single reporting view in your dashboard",
    ],
  },

  // ---- Growth services (monthly) — anchor first ----
  {
    key: "ugc-program",
    name: "UGC Creator Program",
    blurb: "Real people holding your product, on a monthly cadence.",
    price: 320000,
    billing: "monthly",
    group: "growth",
    pairsWith: "Operate & Dominate",
    includes: [
      "8 creator-shot videos per month",
      "Creator sourcing, briefing, and licensing",
      "Hook variants cut for each video",
      "Performance-led briefs for next month",
    ],
  },
  {
    key: "creative-studio",
    name: "Creative Studio",
    blurb: "Fresh creative every month, because fatigue is what kills accounts.",
    price: 240000,
    billing: "monthly",
    group: "growth",
    pairsWith: "Operate & Dominate",
    includes: [
      "12 net-new ad creatives per month",
      "Static, motion, and story formats",
      "Copy written by your Ad Copy Co-Pilot, art-directed by us",
      "Monthly creative performance teardown",
    ],
    mostPaired: true,
  },
  {
    key: "lifecycle",
    name: "Lifecycle Email & SMS",
    blurb: "The revenue sitting in the list you already paid to build.",
    price: 190000,
    billing: "monthly",
    group: "growth",
    pairsWith: "Any membership",
    includes: [
      "Core automated flows built and maintained",
      "Weekly campaign calendar, written and sent",
      "List health, segmentation, and deliverability",
      "Revenue attributed per flow and per send",
    ],
  },
  {
    key: "local-visibility",
    name: "Local Visibility",
    blurb: "Own the map pack in every city you actually serve.",
    price: 160000,
    billing: "monthly",
    group: "growth",
    pairsWith: "Any membership",
    includes: [
      "Google Business Profile management",
      "Local landing pages per service area",
      "Citation and directory consistency",
      "Local rank tracking by keyword and city",
    ],
  },
  {
    key: "voice-agent",
    name: "Speed-to-Lead Voice Agent",
    blurb: "Answers in one ring at 9pm, books the job, logs it to the CRM.",
    price: 140000,
    billing: "monthly",
    group: "growth",
    pairsWith: "Scale & Command",
    includes: [
      "AI voice agent answering inbound calls 24/7",
      "Missed-call text-back within seconds",
      "Calendar booking and qualification",
      "Full transcripts written to your CRM",
    ],
  },
  {
    key: "reputation",
    name: "Reputation Engine",
    blurb: "More reviews, answered fast, without anyone remembering to ask.",
    price: 90000,
    billing: "monthly",
    group: "growth",
    pairsWith: "Any membership",
    includes: [
      "Automated review requests after each job",
      "Response drafting in your brand voice",
      "Alerting on anything under four stars",
      "Review velocity reported monthly",
    ],
  },

  // ---- Capacity (monthly) ----
  {
    key: "extra-agent",
    name: "Additional Agent",
    blurb: "Unlock one more specialist from the crew.",
    price: 50000,
    billing: "monthly",
    group: "capacity",
    pairsWith: "Launch & Scale",
    includes: ["One additional agent unlocked", "Included in your usage meter"],
  },
  {
    key: "run-pack",
    name: "Agent Run Pack",
    blurb: "5,000 more runs a month, for when the crew earns its keep.",
    price: 40000,
    billing: "monthly",
    group: "capacity",
    pairsWith: "Launch & Scale",
    includes: ["+5,000 agent runs per month", "Stacks as many times as you need"],
    mostPaired: true,
  },
  {
    key: "extra-ad-account",
    name: "Additional Ad Account",
    blurb: "Another platform or another location, fully managed.",
    price: 60000,
    billing: "monthly",
    group: "capacity",
    pairsWith: "Monitor & Operate",
    includes: ["One more managed ad account", "Included in dashboards and reporting"],
  },
];

/** Bundled foundations — priced below the sum of its parts. */
export const ADDON_BUNDLE = {
  key: "growth-foundation",
  name: "The Growth Foundation",
  blurb:
    "All three foundations, built together in one engagement — the way they work best.",
  includes: ["funnel-build", "crm-build", "tracking-setup"],
  price: 720000,
} as const;

export function addonsByGroup(group: AddonGroupKey): AddonDef[] {
  return ADDONS.filter((a) => a.group === group);
}

/** Sum of the bundle's parts, for an honest saving figure. */
export function bundleListPrice(): number {
  return ADDON_BUNDLE.includes.reduce((sum, key) => {
    const addon = ADDONS.find((a) => a.key === key);
    return sum + (addon?.price ?? 0);
  }, 0);
}

export function addonByKey(key: string): AddonDef | undefined {
  return ADDONS.find((a) => a.key === key);
}
