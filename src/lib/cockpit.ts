/**
 * The cockpit configurator — pricing.
 *
 * DIRECTION
 *   A pricing grid asks "which of these three am I?". A configurator asks
 *   "what do I actually need?" — and the second question is the one a buyer
 *   spending five figures a month is already asking themselves. It also lets
 *   someone who only wants ad-ops, or only wants agents, buy without feeling
 *   like they're taking the wrong package.
 *
 * BLUEPRINTS
 *   Every number the page shows comes from `priceCockpit`, which is pure and
 *   fully tested. The running total a client watches assemble is the same
 *   arithmetic the invoice will use — if those two ever disagree, the trust
 *   cost is enormous and permanent, so there is exactly one implementation.
 *
 *   Deliberately honest about the bundle: selecting all three foundations
 *   individually silently applies the bundle price rather than charging the
 *   higher à la carte sum. A configurator that lets you pay more than the
 *   advertised bundle for the identical basket is a dark pattern.
 */

import { PLANS, planByKey, type PlanDef } from "@/lib/catalog";
import { ADDONS, ADDON_BUNDLE, addonByKey, type AddonDef } from "@/lib/addons";

export interface CockpitSelection {
  /** Agent tier key, or null for "no automation crew". */
  agentsPlan?: string | null;
  /** Ad-ops tier key, or null for "no managed ad-ops". */
  adOpsPlan?: string | null;
  /** Add-on keys. */
  addons?: string[];
  /** Industry pack — included at no cost; recorded so onboarding knows. */
  verticalKey?: string | null;
}

export type LineKind = "SUBSCRIPTION" | "BUILD" | "ADDON_MONTHLY" | "ADDON_ONCE" | "INCLUDED";

export interface CockpitLine {
  key: string;
  label: string;
  detail: string;
  kind: LineKind;
  /** Cents. Zero for INCLUDED lines. */
  amount: number;
}

export interface CockpitQuote {
  lines: CockpitLine[];
  /** Recurring, every month. */
  monthlyTotal: number;
  /** Charged once, on the first invoice. */
  oneTimeTotal: number;
  /** What actually leaves the account on day one. */
  firstInvoiceTotal: number;
  /** Saving versus buying the same basket à la carte. */
  bundleSaving: number;
  /** True once anything chargeable is selected. */
  isEmpty: boolean;
}

/** Add-ons that the bundle replaces when all of them are selected. */
const BUNDLE_MEMBERS: readonly string[] = ADDON_BUNDLE.includes;

function planLine(plan: PlanDef): CockpitLine {
  return {
    key: `plan-${plan.key}`,
    label: plan.name,
    detail: plan.tagline,
    kind: "SUBSCRIPTION",
    amount: plan.priceMonthly,
  };
}

function buildLine(plan: PlanDef): CockpitLine | null {
  if (!plan.setupFee) return null;
  return {
    key: `build-${plan.key}`,
    label: `${plan.name} build`,
    detail: "One-time. Never charged again, even if you change tiers.",
    kind: "BUILD",
    amount: plan.setupFee,
  };
}

function addonLine(addon: AddonDef): CockpitLine {
  return {
    key: `addon-${addon.key}`,
    label: addon.name,
    detail: addon.blurb,
    kind: addon.billing === "monthly" ? "ADDON_MONTHLY" : "ADDON_ONCE",
    amount: addon.price,
  };
}

/**
 * Pure: turn a selection into the exact quote the client will be invoiced.
 * Unknown keys are ignored rather than throwing — a stale link from an old
 * price list should degrade to a smaller cockpit, not a broken page.
 */
export function priceCockpit(selection: CockpitSelection): CockpitQuote {
  const lines: CockpitLine[] = [];

  const agents = selection.agentsPlan ? planByKey(selection.agentsPlan) : undefined;
  const adOps = selection.adOpsPlan ? planByKey(selection.adOpsPlan) : undefined;

  // Guard against a selection that names a plan from the wrong line.
  const agentsPlan = agents?.line === "AI_AGENTS" ? agents : undefined;
  const adOpsPlan = adOps?.line === "AD_OPS" ? adOps : undefined;

  if (agentsPlan) {
    lines.push(planLine(agentsPlan));
    const build = buildLine(agentsPlan);
    if (build) lines.push(build);
  }
  if (adOpsPlan) {
    lines.push(planLine(adOpsPlan));
    const build = buildLine(adOpsPlan);
    if (build) lines.push(build);
  }

  // De-duplicate and drop anything we don't sell.
  const requested = [...new Set(selection.addons ?? [])].filter((k) => addonByKey(k));

  // If every foundation is selected, charge the bundle price, not the sum.
  const hasWholeBundle = BUNDLE_MEMBERS.every((k) => requested.includes(k));
  let bundleSaving = 0;

  if (hasWholeBundle) {
    const listPrice = BUNDLE_MEMBERS.reduce((sum, k) => sum + (addonByKey(k)?.price ?? 0), 0);
    bundleSaving = Math.max(0, listPrice - ADDON_BUNDLE.price);
    lines.push({
      key: `addon-${ADDON_BUNDLE.key}`,
      label: ADDON_BUNDLE.name,
      detail: "All three foundations, built together — priced below the sum of its parts.",
      kind: "ADDON_ONCE",
      amount: ADDON_BUNDLE.price,
    });
  }

  for (const key of requested) {
    if (hasWholeBundle && BUNDLE_MEMBERS.includes(key)) continue; // folded into the bundle
    const addon = addonByKey(key);
    if (addon) lines.push(addonLine(addon));
  }

  if (selection.verticalKey) {
    lines.push({
      key: `vertical-${selection.verticalKey}`,
      label: "Industry pack",
      detail: "Your rubric, escalation rules and playbooks arrive pre-written. No charge.",
      kind: "INCLUDED",
      amount: 0,
    });
  }

  const monthlyTotal = lines
    .filter((l) => l.kind === "SUBSCRIPTION" || l.kind === "ADDON_MONTHLY")
    .reduce((sum, l) => sum + l.amount, 0);

  const oneTimeTotal = lines
    .filter((l) => l.kind === "BUILD" || l.kind === "ADDON_ONCE")
    .reduce((sum, l) => sum + l.amount, 0);

  return {
    lines,
    monthlyTotal,
    oneTimeTotal,
    firstInvoiceTotal: monthlyTotal + oneTimeTotal,
    bundleSaving,
    isEmpty: monthlyTotal === 0 && oneTimeTotal === 0,
  };
}

/**
 * Curated starting points. Most people don't want a blank configurator — they
 * want a good default they can then argue with, which is a far easier decision
 * than assembling from nothing.
 */
export interface SignatureBuild {
  key: string;
  name: string;
  /** Who it's for, in their words rather than ours. */
  forWhom: string;
  pitch: string;
  selection: CockpitSelection;
  highlight?: boolean;
}

export const SIGNATURE_BUILDS: SignatureBuild[] = [
  {
    key: "first-seat",
    name: "The First Seat",
    forWhom: "You're drowning in inbound and answering it yourself",
    pitch:
      "Two agents working every lead the moment it lands, with the tracking wired up properly so you can finally see what's working.",
    selection: {
      agentsPlan: "launch",
      adOpsPlan: null,
      addons: ["tracking-setup"],
    },
  },
  {
    key: "house-favourite",
    name: "The House Favourite",
    forWhom: "You're spending real money on ads and want both sides handled",
    pitch:
      "The full demand engine plus a human desk on your accounts every day, and the three foundations built together so nothing leaks between them.",
    selection: {
      agentsPlan: "scale",
      adOpsPlan: "operate",
      addons: ["funnel-build", "crm-build", "tracking-setup"],
    },
    highlight: true,
  },
  {
    key: "chefs-table",
    name: "The Chef's Table",
    forWhom: "You want the whole funnel owned and answered for",
    pitch:
      "Every agent, every check, every morning — plus creative production and speed-to-lead voice so nothing waits on a human being available.",
    selection: {
      agentsPlan: "command",
      adOpsPlan: "dominate",
      addons: ["funnel-build", "crm-build", "tracking-setup", "creative-studio", "voice-agent"],
    },
  },
];

export function signatureByKey(key: string): SignatureBuild | undefined {
  return SIGNATURE_BUILDS.find((b) => b.key === key);
}

/**
 * Does this selection match a signature build exactly? Used to show "you're on
 * a signature build" rather than silently treating a preset as custom.
 */
export function matchesSignature(selection: CockpitSelection): SignatureBuild | undefined {
  const norm = (s: CockpitSelection) =>
    JSON.stringify({
      agentsPlan: s.agentsPlan ?? null,
      adOpsPlan: s.adOpsPlan ?? null,
      addons: [...new Set(s.addons ?? [])].sort(),
    });
  const target = norm(selection);
  return SIGNATURE_BUILDS.find((b) => norm(b.selection) === target);
}

/** Which line a cockpit should check out against first. Agents lead. */
export function primaryPlanKey(selection: CockpitSelection): string | null {
  if (selection.agentsPlan && planByKey(selection.agentsPlan)) return selection.agentsPlan;
  if (selection.adOpsPlan && planByKey(selection.adOpsPlan)) return selection.adOpsPlan;
  return null;
}

/** Plain-text build sheet, for the request the agency picks up. */
export function buildSheet(selection: CockpitSelection, quote: CockpitQuote): string {
  const money = (c: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
      .format(c / 100);

  return [
    "COCKPIT BUILD SHEET",
    "",
    ...quote.lines.map(
      (l) => `• ${l.label} — ${l.kind === "INCLUDED" ? "included" : money(l.amount)}`,
    ),
    "",
    `Monthly: ${money(quote.monthlyTotal)}`,
    `One-time: ${money(quote.oneTimeTotal)}`,
    `First invoice: ${money(quote.firstInvoiceTotal)}`,
    quote.bundleSaving > 0 ? `Bundle saving applied: ${money(quote.bundleSaving)}` : "",
    selection.verticalKey ? `Industry pack: ${selection.verticalKey}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Every key the configurator is allowed to accept, for input validation. */
export const VALID_AGENT_PLANS = PLANS.filter((p) => p.line === "AI_AGENTS").map((p) => p.key);
export const VALID_ADOPS_PLANS = PLANS.filter((p) => p.line === "AD_OPS").map((p) => p.key);
export const VALID_ADDONS = ADDONS.map((a) => a.key);
