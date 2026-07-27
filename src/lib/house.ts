/**
 * The house and the counter — what this site is for, and what it is not.
 *
 * DIRECTION
 *   There are two properties and they must never read as two agencies
 *   competing for the same click. phxgrowth.com is the front door: who we are,
 *   why hire us, and a conversation that ends in a proposal. This site is the
 *   counter: the same work laid out as product you can inspect to the last
 *   line item, price to the dollar, configure, and buy — without waiting for
 *   somebody to email you back.
 *
 *   That distinction is the whole strategic point. An agency site sells a
 *   relationship; a storefront sells a thing. Most agencies only have the
 *   first, which is why buying from them takes three weeks. Having the second
 *   is the advantage, and it is worth stating plainly rather than leaving a
 *   visitor to work out why there are two sites.
 *
 * BLUEPRINTS
 *   The allocation is modelled as one list of jobs, each assigned to exactly
 *   one owner, rather than two independent lists of claims. Two lists drift
 *   until both sites claim the same job; one list cannot, because a job has
 *   one owner by construction. `house.test.ts` enforces the rest: both sides
 *   are represented, no job is stated twice, and every assignment carries a
 *   reason rather than a slogan.
 */

import { BRAND } from "@/lib/brand";
import { blueprintFor } from "@/lib/systems";

/**
 * How many modules the widest tier actually contains. Counted rather than
 * typed, because the moment a number in marketing copy stops being generated
 * it starts being wrong.
 */
const COMMAND_MODULE_COUNT = blueprintFor("command")?.modules.length ?? 0;

export type HouseSide = "PARENT" | "PLUS";

export interface HouseRole {
  side: HouseSide;
  /** What to call it on screen. */
  name: string;
  /** Where it lives. Null for this site — it's already here. */
  url: string | null;
  /** The one-word role, used as an eyebrow. */
  role: string;
  /** What the site is for, in a sentence. */
  purpose: string;
}

export const HOUSE: Record<HouseSide, HouseRole> = {
  PARENT: {
    side: "PARENT",
    name: BRAND.parent.name,
    url: BRAND.parent.url,
    role: "The agency",
    purpose:
      "Where you meet us, tell us what you're trying to grow, and hire a team to run it. Campaigns, accounts, relationships — the work itself and the people who own it.",
  },
  PLUS: {
    side: "PLUS",
    name: BRAND.name,
    url: null,
    role: "The counter",
    purpose:
      "Where that work is laid out as product. Every system opened up module by module, every price on the wall, a configurator that adds it up in front of you, and a checkout at the end of it. No proposal, no waiting on a callback.",
  },
};

export interface Division {
  /** The job, phrased as something a visitor actually wants to do. */
  job: string;
  owner: HouseSide;
  /** Why it belongs on that side. Has to argue, not assert. */
  because: string;
}

/**
 * One job, one owner. Ordered so the two columns read as a journey rather
 * than a comparison chart — the early jobs are the parent's, the later ones
 * are ours, and the handover happens in the middle where it actually does.
 */
export const DIVISIONS: Division[] = [
  {
    job: "Work out whether we're the right people at all",
    owner: "PARENT",
    because:
      "That is a judgement about people, not a spec sheet. It needs the case studies, the team, and someone answering the phone — which is exactly what the agency site is built to do.",
  },
  {
    job: "Have somebody run your campaigns day to day",
    owner: "PARENT",
    because:
      "The service relationship lives with the agency. Nothing here replaces having a team; this tier is what that team is holding when they work on you.",
  },
  {
    job: "See exactly what a tier contains, module by module",
    owner: "PLUS",
    because: `An agency site says "full-service ad management". This one lists all ${COMMAND_MODULE_COUNT} things that switch on in the top tier and marks which arrive instantly and which get built with you. That level of detail is the product view, and it belongs on a storefront.`,
  },
  {
    job: "Know the price before speaking to anyone",
    owner: "PLUS",
    because:
      "Published pricing is a competitive act. Every price, every build fee and every add-on is on the wall here, so a buyer can qualify themselves in four minutes instead of sitting through a discovery call to find out they can't afford it.",
  },
  {
    job: "Assemble a package that is actually your shape",
    owner: "PLUS",
    because:
      "Three tiers is a guess at what you need. The configurator lets you take one line and not the other, add only the pairings you'll use, and watch the total assemble — the same arithmetic the invoice will use.",
  },
  {
    job: "Buy it now, without a proposal",
    owner: "PLUS",
    because:
      "This is the part agencies almost never offer. Checkout is live: you can go from reading a page to a provisioned workspace in one sitting, and the build is scheduled the same day.",
  },
  {
    job: "Add a service six months in without renegotiating anything",
    owner: "PLUS",
    because:
      "The add-on menu is priced and permanent. Wanting creative production in March shouldn't mean reopening a contract — you add it from the same counter you bought at.",
  },
  {
    job: "Sit down and rethink the whole growth strategy",
    owner: "PARENT",
    because:
      "Strategy is a conversation with humans who know your market. A storefront is the wrong instrument for it, and pretending otherwise would be selling software where advice is what's needed.",
  },
];

export function divisionsFor(owner: HouseSide): Division[] {
  return DIVISIONS.filter((d) => d.owner === owner);
}

/**
 * The single line that answers "why are there two sites?". Kept here so the
 * landing page, the metadata and the OG card cannot say different things.
 */
export const HOUSE_THESIS = {
  headline: "One agency. Two doors.",
  body: `${BRAND.parent.name} is where you hire a growth team. This is where you can see precisely what that team is holding, what each piece costs, and buy the exact combination you want without a proposal or a waiting period. Same house, same people — this door just opens onto the product instead of the pitch.`,
} as const;
