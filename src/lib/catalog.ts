/**
 * Product catalog — the single source of truth for the two product lines and
 * their six strategic tiers. Seeded into the DB and mirrored as Stripe
 * Products/Prices (see scripts/setup-stripe.ts). Stripe Price IDs are read
 * from env vars so the same catalog works across Stripe test/live modes.
 */

export type ProductLineKey = "AI_AGENTS" | "AD_OPS";

export interface PlanDef {
  key: string;
  line: ProductLineKey;
  name: string;
  priceMonthly: number; // cents
  /** Env var that holds the Stripe Price ID for this plan. */
  stripePriceEnv: string;
  tagline: string;
  features: string[];
  /** Metering limits. null = unlimited. */
  limits: {
    agents: number | null;
    agentRunsPerMonth: number | null;
    adAccounts: number | null;
  };
  /** Slugs of agents unlocked by this plan (AI_AGENTS line only). */
  unlockedAgents: string[];
  highlight?: boolean;
}

export const PRODUCT_LINES: Record<ProductLineKey, { name: string; blurb: string }> = {
  AI_AGENTS: {
    name: "AI Automation Agents",
    blurb: "A crew of specialist AI agents that qualify, write, follow up, and update — on tap.",
  },
  AD_OPS: {
    name: "Ad Operations Management",
    blurb: "Managed ad-ops: campaign management, spend monitoring, creative rotation, reporting.",
  },
};

export const ALL_AGENT_SLUGS = [
  "lead-qualifier",
  "ad-copy-copilot",
  "follow-up-sequencer",
  "crm-updater",
  "objection-handler",
] as const;

/**
 * Price ladder. All prices end in 7 and sit just under a psychological wall
 * ($2K, $3.5K, $4.5K, $8K) so each tier reads as a considered number rather
 * than a round one. The two `highlight` tiers (Scale, Operate) are deliberately
 * priced below a straight 3× of the original ladder — they are the tiers most
 * clients land on, so they stay the obvious-value pick, with the flagship
 * anchoring above them.
 */
export const PLANS: PlanDef[] = [
  // ---- AI Automation Agents ----
  {
    key: "launch",
    line: "AI_AGENTS",
    name: "Launch",
    priceMonthly: 89700,
    stripePriceEnv: "STRIPE_PRICE_LAUNCH",
    tagline: "Deploy your first agent.",
    features: ["1 agent", "500 agent runs / mo", "Email support"],
    limits: { agents: 1, agentRunsPerMonth: 500, adAccounts: null },
    unlockedAgents: ["lead-qualifier"],
  },
  {
    key: "scale",
    line: "AI_AGENTS",
    name: "Scale",
    priceMonthly: 199700,
    stripePriceEnv: "STRIPE_PRICE_SCALE",
    tagline: "A working squad of agents.",
    features: [
      "3 agents",
      "2,500 agent runs / mo",
      "Priority support",
      "Custom agent instructions",
    ],
    limits: { agents: 3, agentRunsPerMonth: 2500, adAccounts: null },
    unlockedAgents: ["lead-qualifier", "ad-copy-copilot", "follow-up-sequencer"],
    highlight: true,
  },
  {
    key: "command",
    line: "AI_AGENTS",
    name: "Command",
    priceMonthly: 449700,
    stripePriceEnv: "STRIPE_PRICE_COMMAND",
    tagline: "Full autonomy. All five agents.",
    features: [
      "All 5 agents",
      "10,000 agent runs / mo",
      "Dedicated Slack channel",
      "Monthly strategy call",
    ],
    limits: { agents: 5, agentRunsPerMonth: 10000, adAccounts: null },
    unlockedAgents: [...ALL_AGENT_SLUGS],
  },
  // ---- Ad Operations Management ----
  {
    key: "monitor",
    line: "AD_OPS",
    name: "Monitor",
    priceMonthly: 149700,
    stripePriceEnv: "STRIPE_PRICE_MONITOR",
    tagline: "Eyes on every dollar.",
    features: ["Spend tracking", "Weekly report", "1 ad account"],
    limits: { agents: null, agentRunsPerMonth: null, adAccounts: 1 },
    unlockedAgents: [],
  },
  {
    key: "operate",
    line: "AD_OPS",
    name: "Operate",
    priceMonthly: 349700,
    stripePriceEnv: "STRIPE_PRICE_OPERATE",
    tagline: "Hands on the controls.",
    features: [
      "Active campaign management",
      "Creative rotation",
      "3 ad accounts",
      "Bi-weekly strategy",
    ],
    limits: { agents: null, agentRunsPerMonth: null, adAccounts: 3 },
    unlockedAgents: [],
    highlight: true,
  },
  {
    key: "dominate",
    line: "AD_OPS",
    name: "Dominate",
    priceMonthly: 799700,
    stripePriceEnv: "STRIPE_PRICE_DOMINATE",
    tagline: "Own the whole funnel.",
    features: [
      "Full-funnel management",
      "Landing page optimization",
      "Unlimited accounts",
      "Weekly strategy",
    ],
    limits: { agents: null, agentRunsPerMonth: null, adAccounts: null },
    unlockedAgents: [],
  },
];

export function planByKey(key: string): PlanDef | undefined {
  return PLANS.find((p) => p.key === key);
}

export function plansForLine(line: ProductLineKey): PlanDef[] {
  return PLANS.filter((p) => p.line === line);
}
