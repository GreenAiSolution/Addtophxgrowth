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
  /**
   * One-time onboarding/build fee in cents, billed on the first invoice
   * alongside the first month. Omit for plans with no build phase.
   */
  setupFee?: number;
  /** Env var holding the Stripe one-time Price ID for the build fee. */
  setupPriceEnv?: string;
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
 * Price ladder. Every price ends in 7 and sits just under a psychological wall
 * ($1.3K / $3K / $7K on the agents line, $1.5K / $3.5K / $8K on ad-ops), so
 * each tier reads as a considered number rather than a round one.
 *
 * The agents line climbs in consistent ~2.3× steps ($1,297 → $2,997 → $6,997).
 * Even steps make each tier feel like a deliberate leap rather than an
 * arbitrary markup, and the Command anchor at the top makes Scale — the tier
 * most clients land on — read as the sensible middle.
 *
 * Command stays just below Ad Ops' Dominate ($7,997): fully-managed human
 * ad-ops remains the top of the house, with the all-agents package just under.
 */
export const PLANS: PlanDef[] = [
  // ---- AI Automation Agents ----
  {
    key: "launch",
    line: "AI_AGENTS",
    name: "Launch",
    priceMonthly: 129700,
    stripePriceEnv: "STRIPE_PRICE_LAUNCH",
    setupFee: 250000,
    setupPriceEnv: "STRIPE_PRICE_LAUNCH_SETUP",
    tagline: "Two agents, working your inbound.",
    features: [
      "2 agents — Lead Qualifier + Follow-Up Sequencer",
      "2,000 agent runs / mo",
      "Saved brand voice",
      "Email support",
    ],
    limits: { agents: 2, agentRunsPerMonth: 2000, adAccounts: null },
    unlockedAgents: ["lead-qualifier", "follow-up-sequencer"],
  },
  {
    key: "scale",
    line: "AI_AGENTS",
    name: "Scale",
    priceMonthly: 299700,
    stripePriceEnv: "STRIPE_PRICE_SCALE",
    setupFee: 300000,
    setupPriceEnv: "STRIPE_PRICE_SCALE_SETUP",
    tagline: "A working squad of agents.",
    features: [
      "4 agents",
      "10,000 agent runs / mo",
      "Custom agent instructions",
      "CRM + Zapier delivery",
      "Priority support + quarterly strategy call",
    ],
    limits: { agents: 4, agentRunsPerMonth: 10000, adAccounts: null },
    unlockedAgents: [
      "lead-qualifier",
      "ad-copy-copilot",
      "follow-up-sequencer",
      "crm-updater",
    ],
    highlight: true,
  },
  {
    key: "command",
    line: "AI_AGENTS",
    name: "Command",
    priceMonthly: 699700,
    stripePriceEnv: "STRIPE_PRICE_COMMAND",
    setupFee: 350000,
    setupPriceEnv: "STRIPE_PRICE_COMMAND_SETUP",
    tagline: "Full autonomy. All five agents.",
    features: [
      "All 5 agents",
      "Unlimited agent runs (fair use)",
      "Per-agent custom prompts",
      "Dedicated Slack channel",
      "Monthly strategy call + white-glove onboarding",
    ],
    limits: { agents: 5, agentRunsPerMonth: null, adAccounts: null },
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
    features: [
      "2 ad accounts",
      "Spend + pacing tracking",
      "Weekly performance report",
      "Monthly review call",
    ],
    limits: { agents: null, agentRunsPerMonth: null, adAccounts: 2 },
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
      "5 ad accounts",
      "Active campaign management",
      "Creative rotation + testing",
      "Dedicated ad-ops manager",
      "Bi-weekly strategy call",
    ],
    limits: { agents: null, agentRunsPerMonth: null, adAccounts: 5 },
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
      "Unlimited ad accounts",
      "Full-funnel management",
      "Landing page optimization + A/B testing",
      "Weekly strategy call + dedicated Slack",
      "Quarterly growth roadmap",
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
