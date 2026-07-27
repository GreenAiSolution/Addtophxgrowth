/**
 * System blueprints — what each subscription tier actually deploys.
 *
 * DIRECTION
 *   A tier is not a price, it is a system. The moment a payment clears, every
 *   INSTANT module below is provisioned automatically (see lib/provisioning.ts)
 *   and the client can use it immediately; every BUILD module is human work
 *   scheduled during the one-time build.
 *
 * BLUEPRINTS
 *   Tiers compose: SCALE_MODULES spreads LAUNCH_MODULES, COMMAND_MODULES
 *   spreads SCALE_MODULES. Upgrading is therefore always additive — a client
 *   never loses a system they were provisioned. `systems.test.ts` enforces the
 *   superset property, unique keys, and that the AGENT modules in a blueprint
 *   match exactly the agents the catalog unlocks for that plan (the two files
 *   drift otherwise, and the client would be promised an agent they can't run).
 */

import { ALL_AGENT_SLUGS } from "@/lib/catalog";

export type ModuleKind = "AGENT" | "PLAYBOOK" | "INTEGRATION" | "ASSET" | "MILESTONE";

/**
 * INSTANT — provisioned by the platform on payment, live in seconds.
 * BUILD    — delivered by the team during the one-time build engagement.
 */
export type ModuleDelivery = "INSTANT" | "BUILD";

export interface SystemModule {
  key: string;
  kind: ModuleKind;
  name: string;
  description: string;
  delivery: ModuleDelivery;
  /** AGENT / PLAYBOOK modules bind to an agent in the roster. */
  agentSlug?: string;
  /** PLAYBOOK modules seed a one-click starter prompt into the workspace. */
  prompt?: string;
  /** ASSET modules carry the delivered artifact. */
  body?: string;
}

export interface SystemBlueprint {
  planKey: string;
  /** The system's name — what the client tells people they bought. */
  systemName: string;
  promise: string;
  /** Concrete business outcomes, not features. */
  outcomes: string[];
  modules: SystemModule[];
}

// ---------------------------------------------------------------------------
// Launch — the inbound response system
// ---------------------------------------------------------------------------

const LAUNCH_MODULES: SystemModule[] = [
  {
    key: "agent-lead-qualifier",
    kind: "AGENT",
    name: "Lead Qualifier (QUALI-7)",
    description: "Scores every inbound lead and tells your team who to call first.",
    delivery: "INSTANT",
    agentSlug: "lead-qualifier",
  },
  {
    key: "agent-follow-up-sequencer",
    kind: "AGENT",
    name: "Follow-Up Sequencer (ECHO-4)",
    description: "Drafts the multi-touch cadence that chases the lead you didn't reach.",
    delivery: "INSTANT",
    agentSlug: "follow-up-sequencer",
  },
  {
    key: "playbook-score-inbound",
    kind: "PLAYBOOK",
    name: "Score an inbound form fill",
    description: "Paste a raw form submission, get a score, a tier, and the next action.",
    delivery: "INSTANT",
    agentSlug: "lead-qualifier",
    prompt:
      "Score this inbound lead and tell me exactly who should contact them, how, and by when.\n\nLead details:\n",
  },
  {
    key: "playbook-triage-list",
    kind: "PLAYBOOK",
    name: "Triage yesterday's leads",
    description: "Drop in a batch of leads and get them ranked into a call order.",
    delivery: "INSTANT",
    agentSlug: "lead-qualifier",
    prompt:
      "Here are the leads that came in since yesterday. Rank them into the order my team should work them today, and flag anyone at risk of going cold.\n\nLeads:\n",
  },
  {
    key: "playbook-no-show-cadence",
    kind: "PLAYBOOK",
    name: "Rescue a no-show",
    description: "Turn a missed appointment into a booked one with a 5-touch cadence.",
    delivery: "INSTANT",
    agentSlug: "follow-up-sequencer",
    prompt:
      "This lead booked and didn't show. Write the follow-up cadence that gets them rebooked without sounding desperate.\n\nContext:\n",
  },
  {
    key: "playbook-quote-followup",
    kind: "PLAYBOOK",
    name: "Chase an unanswered quote",
    description: "A cadence for the estimate that went quiet, ending in a clean break-up.",
    delivery: "INSTANT",
    agentSlug: "follow-up-sequencer",
    prompt:
      "We sent this quote and heard nothing back. Write the follow-up sequence, ending with a break-up message.\n\nQuote context:\n",
  },
  {
    key: "asset-voice-profile",
    kind: "ASSET",
    name: "Brand Voice Profile",
    description: "Your tone, captured once — every agent writes from it on every run.",
    delivery: "INSTANT",
    body:
      "Fill this in under Settings and every agent inherits it:\n\n" +
      "• How we sound: (e.g. direct, warm, never salesy)\n" +
      "• Words we use: \n" +
      "• Words we never use: \n" +
      "• Our promise to a new customer: \n" +
      "• Proof we can cite: ",
  },
  {
    key: "integration-lead-intake",
    kind: "INTEGRATION",
    name: "Lead Intake Webhook",
    description: "A live endpoint your forms post to, so new leads reach the agents on their own.",
    delivery: "INSTANT",
  },
  {
    key: "milestone-kickoff",
    kind: "MILESTONE",
    name: "Build kickoff call",
    description: "45 minutes to capture your offer, your voice, and your qualification bar.",
    delivery: "BUILD",
  },
  {
    key: "milestone-prompt-tuning",
    kind: "MILESTONE",
    name: "Prompt tuning on your real leads",
    description: "We run your last 20 leads through the agents and tune until the output ships.",
    delivery: "BUILD",
  },
  {
    key: "milestone-pilot",
    kind: "MILESTONE",
    name: "Supervised pilot week",
    description: "Every agent output reviewed by us before it reaches a customer.",
    delivery: "BUILD",
  },
];

// ---------------------------------------------------------------------------
// Scale — the demand engine (Launch + paid acquisition + CRM hygiene)
// ---------------------------------------------------------------------------

const SCALE_MODULES: SystemModule[] = [
  ...LAUNCH_MODULES,
  {
    key: "agent-ad-copy-copilot",
    kind: "AGENT",
    name: "Ad Copy Co-Pilot (MUSE-9)",
    description: "Platform-native ad variants with hooks, headlines, and CTAs on demand.",
    delivery: "INSTANT",
    agentSlug: "ad-copy-copilot",
  },
  {
    key: "agent-crm-updater",
    kind: "AGENT",
    name: "CRM Updater (LEDGER-3)",
    description: "Turns messy call notes into a clean, structured CRM record.",
    delivery: "INSTANT",
    agentSlug: "crm-updater",
  },
  {
    key: "playbook-campaign-launch",
    kind: "PLAYBOOK",
    name: "Launch a new campaign",
    description: "Offer in, three angled variant sets out, ready to load into Ads Manager.",
    delivery: "INSTANT",
    agentSlug: "ad-copy-copilot",
    prompt:
      "Write the ad set for a new campaign. Give me three variant sets on different angles, sized for the platform.\n\nOffer:\nAudience:\nPlatform:\n",
  },
  {
    key: "playbook-fatigue-refresh",
    kind: "PLAYBOOK",
    name: "Refresh fatigued creative",
    description: "Rewrite the ad whose CPL is climbing, keeping what still works.",
    delivery: "INSTANT",
    agentSlug: "ad-copy-copilot",
    prompt:
      "This ad's cost per lead is climbing. Keep what's working and rewrite the rest into fresh variants.\n\nCurrent ad:\nWhat we know about performance:\n",
  },
  {
    key: "playbook-call-notes",
    kind: "PLAYBOOK",
    name: "File call notes to CRM",
    description: "Freeform notes in, structured contact + deal + next step out.",
    delivery: "INSTANT",
    agentSlug: "crm-updater",
    prompt:
      "Turn these call notes into a clean CRM record with a contact, deal stage, and next step.\n\nNotes:\n",
  },
  {
    key: "integration-crm-delivery",
    kind: "INTEGRATION",
    name: "CRM Delivery Hook",
    description: "Send-to-CRM wired to your pipeline, so agent output lands where your team works.",
    delivery: "INSTANT",
  },
  {
    key: "asset-qualification-rubric",
    kind: "ASSET",
    name: "Qualification Rubric",
    description: "The written bar the Lead Qualifier scores against — yours to change.",
    delivery: "INSTANT",
    body:
      "HOT — ready to buy, has budget, decision-maker engaged, timeline inside 30 days\n" +
      "WARM — real need and authority, timeline or budget still soft\n" +
      "COLD — interested, no timeline or no budget confirmed\n" +
      "DISQUALIFIED — outside service area, wrong product fit, or no authority\n\n" +
      "Edit these definitions and the agent scores to your bar, not a generic one.",
  },
  {
    key: "milestone-crm-mapping",
    kind: "MILESTONE",
    name: "CRM field mapping",
    description: "We map every agent output field to your pipeline and test it end to end.",
    delivery: "BUILD",
  },
];

// ---------------------------------------------------------------------------
// Command — the autonomous growth desk (Scale + objection handling + ops)
// ---------------------------------------------------------------------------

const COMMAND_MODULES: SystemModule[] = [
  ...SCALE_MODULES,
  {
    key: "agent-objection-handler",
    kind: "AGENT",
    name: "Objection Handler (AEGIS-5)",
    description: "Rebuttal frameworks in your voice, ready before the call.",
    delivery: "INSTANT",
    agentSlug: "objection-handler",
  },
  {
    key: "playbook-objection-drill",
    kind: "PLAYBOOK",
    name: "Drill the objection you keep losing to",
    description: "Three frameworks and ready-to-say scripts for your most common stall.",
    delivery: "INSTANT",
    agentSlug: "objection-handler",
    prompt:
      "This is the objection costing us the most deals. Give me three rebuttal frameworks with scripts, and tell me when to use each.\n\nObjection:\n",
  },
  {
    key: "playbook-weekly-review",
    kind: "PLAYBOOK",
    name: "Weekly pipeline review",
    description: "Paste the week's leads and get a prioritised action list for Monday.",
    delivery: "INSTANT",
    agentSlug: "lead-qualifier",
    prompt:
      "Here is everything that came in this week. Give me a prioritised action list for Monday, and tell me what we're at risk of losing.\n\nThis week:\n",
  },
  {
    key: "asset-escalation-matrix",
    kind: "ASSET",
    name: "Escalation Matrix",
    description: "Who touches a lead, at what score, within what window.",
    delivery: "INSTANT",
    body:
      "Score 80-100 (HOT) — senior closer, phone call within 15 minutes\n" +
      "Score 60-79 (WARM) — assigned rep, call same day + cadence starts\n" +
      "Score 40-59 (COLD) — cadence only, review in 14 days\n" +
      "Below 40 — nurture list, no rep time\n\n" +
      "Tune the thresholds to your team's capacity and the agents follow them.",
  },
  {
    key: "integration-slack-channel",
    kind: "INTEGRATION",
    name: "Dedicated Slack Channel",
    description: "A shared channel with your ad-ops lead and strategist. No ticket queue.",
    delivery: "BUILD",
  },
  {
    key: "milestone-custom-prompts",
    kind: "MILESTONE",
    name: "Per-agent custom prompts",
    description: "Each of the five agents rewritten against your business, not a template.",
    delivery: "BUILD",
  },
  {
    key: "milestone-white-glove",
    kind: "MILESTONE",
    name: "White-glove onboarding",
    description: "We sit with your team until they're running the desk without us.",
    delivery: "BUILD",
  },
  {
    key: "milestone-monthly-strategy",
    kind: "MILESTONE",
    name: "Monthly strategy call",
    description: "A standing session on what the numbers say to do next.",
    delivery: "BUILD",
  },
];

export const SYSTEM_BLUEPRINTS: SystemBlueprint[] = [
  {
    planKey: "launch",
    systemName: "The Inbound Response System",
    promise:
      "Every lead scored, ranked, and followed up — before your competitor picks up the phone.",
    outcomes: [
      "No inbound lead goes more than minutes without a response",
      "Your team works the right leads first, every morning",
      "Quotes and no-shows get chased without anyone remembering to",
    ],
    modules: LAUNCH_MODULES,
  },
  {
    planKey: "scale",
    systemName: "The Demand Engine",
    promise:
      "Everything in Launch, plus the creative that fills the funnel and the hygiene that keeps it clean.",
    outcomes: [
      "New campaigns launch in an afternoon, not a fortnight",
      "Creative gets refreshed before fatigue costs you money",
      "Your CRM stays accurate without a single manual entry",
    ],
    modules: SCALE_MODULES,
  },
  {
    planKey: "command",
    systemName: "The Autonomous Growth Desk",
    promise:
      "The full crew, tuned to your business, running your funnel with your team in the loop — not in the weeds.",
    outcomes: [
      "Every stage of the funnel has an agent accountable for it",
      "Objections get answered with your best argument, not your newest rep's",
      "Unlimited runs — the system scales past your busiest month",
    ],
    modules: COMMAND_MODULES,
  },
];

export function blueprintFor(planKey: string): SystemBlueprint | undefined {
  return SYSTEM_BLUEPRINTS.find((b) => b.planKey === planKey);
}

export function modulesByKind(b: SystemBlueprint, kind: ModuleKind): SystemModule[] {
  return b.modules.filter((m) => m.kind === kind);
}

export function modulesByDelivery(b: SystemBlueprint, delivery: ModuleDelivery): SystemModule[] {
  return b.modules.filter((m) => m.delivery === delivery);
}

/** Playbooks for one agent — surfaced as one-click starters in the workspace. */
export function playbooksForAgent(planKey: string, agentSlug: string): SystemModule[] {
  const b = blueprintFor(planKey);
  if (!b) return [];
  return b.modules.filter((m) => m.kind === "PLAYBOOK" && m.agentSlug === agentSlug);
}

export { ALL_AGENT_SLUGS };
