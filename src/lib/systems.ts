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

export type ModuleKind =
  | "AGENT"
  | "PLAYBOOK"
  | "INTEGRATION"
  | "ASSET"
  | "MILESTONE"
  /** An automated check that runs against ad data without anyone asking. */
  | "MONITOR"
  /** A recurring deliverable that arrives on a schedule. */
  | "REPORT";

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
    key: "integration-phone-line",
    kind: "INTEGRATION",
    name: "AI Phone Line — Inbound",
    description:
      "A number that answers every call, day or night, qualifies the caller, and books or messages you — never voicemail.",
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
    key: "integration-phone-outbound",
    kind: "INTEGRATION",
    name: "AI Phone Line — Outbound & Estimates",
    description:
      "Calls back every missed lead on its own, and prices the job on the call from a rate card you control — the number never leaves without you releasing it.",
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

// ---------------------------------------------------------------------------
// Monitor — the spend watch
//
// The ad-ops line is a managed service, so the instinct is to sell hours. That
// is exactly why agencies get fired: the client can't see the work. Every
// INSTANT module below is a check the platform runs on its own and shows the
// client, so the value is visible on the days nothing goes wrong too.
// ---------------------------------------------------------------------------

const MONITOR_MODULES: SystemModule[] = [
  {
    key: "adops-integration-accounts",
    kind: "INTEGRATION",
    name: "Ad Account Connection",
    description: "Your accounts wired in, with daily spend and results flowing into one dashboard.",
    delivery: "INSTANT",
  },
  {
    key: "adops-monitor-pacing",
    kind: "MONITOR",
    name: "Budget Pacing Watch",
    description: "Catches an account burning the month's budget by the 12th — or barely spending at all.",
    delivery: "INSTANT",
  },
  {
    key: "adops-monitor-cpl-drift",
    kind: "MONITOR",
    name: "Cost-Per-Lead Drift Alarm",
    description: "Compares this week's cost per lead against the last month and flags the climb early.",
    delivery: "INSTANT",
  },
  {
    key: "adops-monitor-delivery-gap",
    kind: "MONITOR",
    name: "Delivery Gap Alarm",
    description: "Tells you the day an account stops spending, instead of at the end of the month.",
    delivery: "INSTANT",
  },
  {
    key: "adops-report-weekly",
    kind: "REPORT",
    name: "Weekly Performance Report",
    description: "Spend, leads, cost per lead and what changed — in plain English, every week.",
    delivery: "INSTANT",
  },
  {
    key: "adops-asset-metric-definitions",
    kind: "ASSET",
    name: "Metric Definitions Sheet",
    description: "What counts as a lead, what counts as a conversion. Agreed once, so no report is ever argued about.",
    delivery: "INSTANT",
    body:
      "Agree these once and every report means the same thing every month:\n\n" +
      "• A LEAD is: (e.g. a form fill or a call over 60 seconds)\n" +
      "• A QUALIFIED lead is: \n" +
      "• A CONVERSION is: \n" +
      "• Revenue is counted: (at close / at signature / at cash collected)\n" +
      "• Our target cost per lead: \n" +
      "• Our target cost per sale: \n\n" +
      "Anything not on this list is not counted in your reports.",
  },
  {
    key: "adops-milestone-audit",
    kind: "MILESTONE",
    name: "Account audit",
    description: "We go through every campaign, ad set and keyword and write down what's wasting money.",
    delivery: "BUILD",
  },
  {
    key: "adops-milestone-tracking",
    kind: "MILESTONE",
    name: "Conversion tracking repair",
    description: "Most accounts are measuring the wrong thing. We fix that before we optimise anything.",
    delivery: "BUILD",
  },
  {
    key: "adops-milestone-baseline",
    kind: "MILESTONE",
    name: "Baseline + target setting",
    description: "Where you are today, written down, so improvement is provable rather than claimed.",
    delivery: "BUILD",
  },
  {
    key: "adops-milestone-monthly-review",
    kind: "MILESTONE",
    name: "Monthly review call",
    description: "A standing call on what the numbers did and what we're changing because of it.",
    delivery: "BUILD",
  },
];

// ---------------------------------------------------------------------------
// Operate — the campaign desk (Monitor + hands on the controls)
// ---------------------------------------------------------------------------

const OPERATE_MODULES: SystemModule[] = [
  ...MONITOR_MODULES,
  {
    key: "adops-monitor-creative-fatigue",
    kind: "MONITOR",
    name: "Creative Fatigue Radar",
    description: "Watches click-through decay so an ad gets refreshed before it starts costing you.",
    delivery: "INSTANT",
  },
  {
    key: "adops-monitor-cpa-guardrail",
    kind: "MONITOR",
    name: "Target CPA Guardrail",
    description: "Your target cost per sale, enforced — we're told the moment an account drifts past it.",
    delivery: "INSTANT",
  },
  {
    key: "adops-report-action-log",
    kind: "REPORT",
    name: "Change Log",
    description: "Every change we make to your account, dated and explained. No black box.",
    delivery: "INSTANT",
  },
  {
    key: "adops-asset-testing-framework",
    kind: "ASSET",
    name: "Creative Testing Framework",
    description: "How we test, what wins, and when we kill it — written down before we spend a dollar on it.",
    delivery: "INSTANT",
    body:
      "One variable at a time. No exceptions.\n\n" +
      "• Minimum spend before a verdict: 3× your target cost per lead\n" +
      "• Minimum run time: 7 days (covers a full week's day-of-week pattern)\n" +
      "• Winner threshold: beats control on cost per lead, not on click-through\n" +
      "• Kill rule: 2× target cost per lead with no conversions\n" +
      "• Refresh trigger: click-through down 25% from its first-week average\n\n" +
      "Change these numbers to match your risk appetite and we test to them.",
  },
  {
    key: "adops-asset-naming",
    kind: "ASSET",
    name: "Campaign Naming Convention",
    description: "The structure that makes your account readable — by us, by you, by whoever comes next.",
    delivery: "INSTANT",
    body:
      "PLATFORM_OBJECTIVE_AUDIENCE_OFFER_DATE\n\n" +
      "Example: META_LEADS_HOMEOWNERS-35-65_FREE-INSPECTION_2026-07\n\n" +
      "Why it matters: you can filter, compare and hand the account to anyone without a\n" +
      "translation call. An account nobody else can read is how agencies hold clients hostage.",
  },
  {
    key: "adops-milestone-restructure",
    kind: "MILESTONE",
    name: "Account restructure",
    description: "Rebuilt to the naming convention and the testing framework, not left as we found it.",
    delivery: "BUILD",
  },
  {
    key: "adops-milestone-creative-pipeline",
    kind: "MILESTONE",
    name: "Creative pipeline setup",
    description: "A standing queue of concepts so there is always a fresh ad ready before fatigue hits.",
    delivery: "BUILD",
  },
  {
    key: "adops-milestone-biweekly-strategy",
    kind: "MILESTONE",
    name: "Bi-weekly strategy call",
    description: "Every two weeks with your dedicated ad-ops manager, not a rotating account exec.",
    delivery: "BUILD",
  },
];

// ---------------------------------------------------------------------------
// Dominate — the full-funnel command (Operate + the rest of the funnel)
// ---------------------------------------------------------------------------

const DOMINATE_MODULES: SystemModule[] = [
  ...OPERATE_MODULES,
  {
    key: "adops-monitor-roas-trend",
    kind: "MONITOR",
    name: "ROAS Trend Watch",
    description: "Return on ad spend tracked against target, with the trend called before the month ends.",
    delivery: "INSTANT",
  },
  {
    key: "adops-monitor-anomaly",
    kind: "MONITOR",
    name: "Daily Anomaly Sweep",
    description: "Every account checked every morning for anything that broke overnight.",
    delivery: "INSTANT",
  },
  {
    key: "adops-report-executive",
    kind: "REPORT",
    name: "Executive Monthly Report",
    description: "The one-page version for whoever signs the cheques — spend in, revenue out, what's next.",
    delivery: "INSTANT",
  },
  {
    key: "adops-asset-funnel-map",
    kind: "ASSET",
    name: "Full-Funnel Map",
    description: "Every step from impression to signed deal, with the drop-off rate at each one.",
    delivery: "INSTANT",
    body:
      "Fill in your real numbers and the leaks become obvious:\n\n" +
      "Impressions → Clicks         (click-through rate: ____%)\n" +
      "Clicks      → Leads          (landing page conversion: ____%)\n" +
      "Leads       → Contacted      (speed to lead: ____ minutes)\n" +
      "Contacted   → Appointments   (booking rate: ____%)\n" +
      "Appointments→ Sales          (close rate: ____%)\n\n" +
      "The cheapest win is almost never more traffic. It is the worst percentage on this page.",
  },
  {
    key: "adops-integration-slack",
    kind: "INTEGRATION",
    name: "Dedicated Slack Channel",
    description: "A shared channel with your ad-ops lead and strategist. No ticket queue.",
    delivery: "BUILD",
  },
  {
    key: "adops-milestone-landing-pages",
    kind: "MILESTONE",
    name: "Landing page optimization",
    description: "We test the page, not just the ad — where most of the wasted spend actually dies.",
    delivery: "BUILD",
  },
  {
    key: "adops-milestone-weekly-strategy",
    kind: "MILESTONE",
    name: "Weekly strategy call",
    description: "Every week, with the person actually running your account.",
    delivery: "BUILD",
  },
  {
    key: "adops-milestone-roadmap",
    kind: "MILESTONE",
    name: "Quarterly growth roadmap",
    description: "What we're doing next quarter and what it should be worth, agreed in advance.",
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
      "Every call gets answered, day or night — never voicemail",
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
      "Missed calls get called back on their own — no lead just goes cold",
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
  {
    planKey: "monitor",
    systemName: "The Spend Watch",
    promise:
      "Every dollar accounted for, and every problem caught the day it starts — not in next month's report.",
    outcomes: [
      "You find out an account stopped delivering the same day, not three weeks later",
      "Rising cost per lead gets flagged while it's still fixable",
      "One number for what you spent and what it bought, agreed in advance",
    ],
    modules: MONITOR_MODULES,
  },
  {
    planKey: "operate",
    systemName: "The Campaign Desk",
    promise:
      "Everything in the Spend Watch, plus somebody with their hands on the controls every single day.",
    outcomes: [
      "Creative gets refreshed before fatigue starts costing you money",
      "Every change to your account is logged, dated and explained",
      "Your account is structured so anyone can read it — including you",
    ],
    modules: OPERATE_MODULES,
  },
  {
    planKey: "dominate",
    systemName: "The Full-Funnel Command",
    promise:
      "The whole funnel owned end to end — impression to signed deal — with the drop-off at every step on one page.",
    outcomes: [
      "The leak gets fixed where it actually is, which is rarely the ad",
      "Return on ad spend tracked against target, called before the month closes",
      "A quarterly roadmap agreed in advance, so nobody is guessing what's next",
    ],
    modules: DOMINATE_MODULES,
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
