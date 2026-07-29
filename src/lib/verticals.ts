/**
 * Vertical packs — the same system, pre-tuned per trade.
 *
 * DIRECTION
 *   A generic "AI agent platform" makes a roofer do the translation work. A
 *   "Roofing Growth Desk" arrives already speaking their language. Identical
 *   modules, identical price — but the qualification rubric already knows what
 *   an insurance claim is, and the objection drill already knows the customer
 *   is getting three estimates. That is the whole idea: same product, far less
 *   distance between buying it and getting value from it.
 *
 * BLUEPRINTS
 *   A pack never adds or removes modules — the tier decides that. A pack only
 *   overrides *content*: the three ASSET bodies (voice profile, qualification
 *   rubric, escalation matrix) and any PLAYBOOK starter prompts it has a better
 *   version of. `verticals.test.ts` enforces that every override key names a
 *   module that actually exists, so a rename in systems.ts can't silently
 *   orphan a pack's copy.
 *
 * A note on the numbers below: `typicalJobValue` and the response windows in
 * each escalation matrix are deliberately conservative starting points for the
 * client to edit on day one, not researched benchmarks. They are framed that
 * way everywhere they surface.
 */

import { SYSTEM_BLUEPRINTS, type SystemModule } from "@/lib/systems";

export interface VerticalPack {
  key: string;
  /** What the client tells people they bought. */
  name: string;
  /** The trade, as a buyer would describe themselves. */
  trade: string;
  /** Lowercased fragments matched against ClientProfile.industry. */
  industryMatches: string[];
  headline: string;
  promise: string;
  /** The three things that actually cost this trade money. */
  painPoints: string[];
  /** Objections this trade hears on nearly every call. */
  objections: string[];
  /** Starting assumption for the ROI framing, in cents. Client edits it. */
  typicalJobValueCents: number;
  /**
   * How long, in days, before a past customer of this trade is due again — the
   * cadence The Comeback (lib/comeback.ts) times its re-approach against. Like
   * `typicalJobValueCents`, this is a conservative starting point the client
   * edits, not a researched benchmark: roofing runs long, seasonal trades run
   * short, and a per-client override on ClientProfile always wins.
   */
  serviceIntervalDays: number;
  /** Pre-filled bodies for the three ASSET modules, keyed by module key. */
  assetBodies: Record<string, string>;
  /** Better starter prompts for playbooks this trade uses differently. */
  playbookPrompts: Record<string, string>;
}

export const VERTICAL_PACKS: VerticalPack[] = [
  {
    key: "roofing",
    name: "The Roofing Growth Desk",
    trade: "Roofing contractors",
    industryMatches: ["roofing", "roofer", "roof"],
    headline: "Storm hits Tuesday. Your competitor calls back Wednesday. You called back Tuesday.",
    promise:
      "Every storm lead scored, ranked by claim potential, and chased until they book — while your crews stay on the roof.",
    painPoints: [
      "Storm season buries you in leads for six weeks, then it goes quiet — and you staff for neither",
      "Homeowners collect three estimates and pick whoever answered first, not whoever was best",
      "Insurance-claim jobs and cash jobs need completely different conversations, and everyone runs them the same",
    ],
    objections: [
      "I'm getting three other estimates",
      "I need to talk to my insurance adjuster first",
      "That's more than the other guy quoted",
      "I want to wait until after storm season",
    ],
    typicalJobValueCents: 1_400_000,
    // A roof rarely needs replacing twice, so the re-approach is the annual
    // inspection — the moment to catch damage before it becomes a claim.
    serviceIntervalDays: 365,
    assetBodies: {
      "asset-voice-profile":
        "Pre-filled for roofing. Edit anything that isn't you — this is a starting point, not a rule.\n\n" +
        "• How we sound: straight-talking, no pressure, like a neighbour who happens to know roofs\n" +
        "• Words we use: inspection, decking, underlayment, claim, warranty, crew\n" +
        "• Words we never use: cheap, deal, act now, limited time\n" +
        "• Our promise to a new customer: a free inspection with photos, an honest answer about whether you even need a roof, and a written number that doesn't move\n" +
        "• Proof we can cite: years in business, licence number, manufacturer certification, warranty length",
      "asset-qualification-rubric":
        "Pre-filled for roofing. Change the definitions and every agent scores to your bar.\n\n" +
        "HOT — visible damage or active leak, homeowner is the decision-maker, inside your service radius, insurance claim filed or cash ready\n" +
        "WARM — real damage but the claim isn't filed, or one of two spouses is on the call, or the timeline is 'next few months'\n" +
        "COLD — curiosity inspection, no known damage, shopping a future replacement\n" +
        "DISQUALIFIED — renter with no owner authority, outside the service radius, or asking for a repair below your minimum job size\n\n" +
        "Roofing-specific signals worth weighting: storm date vs. claim deadline, age of the existing roof, whether an adjuster has already been out.",
      "asset-escalation-matrix":
        "Pre-filled for roofing. Tune the windows to your crew's real capacity.\n\n" +
        "Score 80-100 (HOT) — senior estimator calls within 15 minutes, inspection booked same week\n" +
        "Score 60-79 (WARM) — assigned rep calls same day, follow-up cadence starts, claim-help offered\n" +
        "Score 40-59 (COLD) — cadence only, re-check in 14 days, add to the storm-season list\n" +
        "Below 40 — nurture list, no estimator time\n\n" +
        "Override: any lead mentioning an active leak jumps straight to HOT regardless of score.",
    },
    playbookPrompts: {
      "playbook-score-inbound":
        "Score this roofing lead. Tell me whether this is a claim job or a cash job, whether the damage described is likely real, and who should get out there and by when.\n\nLead details:\n",
      "playbook-quote-followup":
        "We inspected and sent this estimate and heard nothing back. They're almost certainly holding two other bids. Write the follow-up sequence that reopens the conversation without dropping our price, ending with a clean break-up.\n\nEstimate context:\n",
      "playbook-objection-drill":
        "This is the objection costing us roofing jobs. Give me three rebuttal frameworks with scripts a estimator can say on a driveway, and tell me when to use each.\n\nObjection:\n",
    },
  },
  {
    key: "hvac",
    name: "The HVAC Growth Desk",
    trade: "HVAC contractors",
    industryMatches: ["hvac", "heating", "air conditioning", "ac repair", "furnace"],
    headline: "It's 108 degrees and their AC just died. Whoever answers first wins the job.",
    promise:
      "Emergency calls triaged in seconds, maintenance plans sold on autopilot, and the shoulder season filled before it empties.",
    painPoints: [
      "Peak-season phones ring faster than anyone can answer, and every missed call is a $9,000 system",
      "Repair calls get closed as repairs when half of them should have been replacements",
      "Maintenance-plan renewals lapse quietly because nobody has time to chase them",
    ],
    objections: [
      "Can you just repair it instead of replacing it?",
      "I want to get a second opinion",
      "That's a lot of money right now",
      "Can it wait until next season?",
    ],
    typicalJobValueCents: 900_000,
    // Two tune-ups a year — cooling before summer, heating before winter.
    serviceIntervalDays: 180,
    assetBodies: {
      "asset-voice-profile":
        "Pre-filled for HVAC. Edit anything that isn't you.\n\n" +
        "• How we sound: calm and fast — the people you want when the house is 90 degrees\n" +
        "• Words we use: system, tonnage, SEER, diagnostic, maintenance plan, financing\n" +
        "• Words we never use: cheap, upsell, you have to, act now\n" +
        "• Our promise to a new customer: a real diagnosis, both options priced honestly (repair vs replace), and a technician who shows up in the window we gave you\n" +
        "• Proof we can cite: same-day service, licensed and insured, parts warranty, financing available",
      "asset-qualification-rubric":
        "Pre-filled for HVAC. Change the definitions and every agent scores to your bar.\n\n" +
        "HOT — no heat or no cool right now, homeowner, inside the service area, system over 10 years old or already quoted\n" +
        "WARM — system is limping, or they're planning a replacement this season, or they're shopping a maintenance plan\n" +
        "COLD — general pricing question, no failure, no timeline\n" +
        "DISQUALIFIED — renter without landlord authority, outside the service radius, or a brand you don't service\n\n" +
        "HVAC-specific signals worth weighting: system age, whether it's a full outage or a partial, and whether they've already paid for a diagnostic elsewhere.",
      "asset-escalation-matrix":
        "Pre-filled for HVAC. Tune to your dispatch capacity.\n\n" +
        "Score 80-100 (HOT) — dispatch calls within 10 minutes, same-day slot offered\n" +
        "Score 60-79 (WARM) — call within the hour, book inside 48 hours, quote replacement alongside repair\n" +
        "Score 40-59 (COLD) — cadence only, maintenance-plan offer, re-check in 30 days\n" +
        "Below 40 — nurture list\n\n" +
        "Override: no heat in freezing weather, or no cool above 100 degrees, is always HOT — score is irrelevant.",
    },
    playbookPrompts: {
      "playbook-score-inbound":
        "Score this HVAC lead. Tell me if this is an emergency, whether it smells like a repair or a replacement, and how fast dispatch needs to move.\n\nLead details:\n",
      "playbook-triage-list":
        "Here are the calls that came in since yesterday. Rank them into today's dispatch order — outages first, then replacements at risk of going to a competitor — and flag anyone who has been waiting too long.\n\nLeads:\n",
      "playbook-objection-drill":
        "This is the objection costing us HVAC jobs. Give me three rebuttal frameworks with scripts a technician can say standing in someone's hallway, and tell me when to use each.\n\nObjection:\n",
    },
  },
  {
    key: "med-spa",
    name: "The Med Spa Growth Desk",
    trade: "Med spas and aesthetics clinics",
    industryMatches: ["med spa", "medspa", "aesthetic", "botox", "wellness clinic"],
    headline: "Beautiful ads, full inquiry inbox, half-empty treatment rooms.",
    promise:
      "Every consultation request answered in your voice within minutes, no-shows rescued automatically, and packages sold instead of single treatments.",
    painPoints: [
      "Instagram DMs and form fills pile up after hours, and the front desk starts the day already behind",
      "Consultation no-shows quietly burn a fifth of the calendar and nobody chases them",
      "Clients buy one treatment when the money is in the package and the rebook",
    ],
    objections: [
      "I'm still thinking about it",
      "It's more expensive than I expected",
      "I'm nervous about the results",
      "I need to check my schedule",
    ],
    typicalJobValueCents: 180_000,
    // Treatment cycles run quarterly — the rebook is the whole business model.
    serviceIntervalDays: 90,
    assetBodies: {
      "asset-voice-profile":
        "Pre-filled for aesthetics. Edit anything that isn't you.\n\n" +
        "• How we sound: warm, discreet, clinical when it matters — never hype\n" +
        "• Words we use: consultation, treatment plan, downtime, results timeline, provider\n" +
        "• Words we never use: cheap, flawless, guaranteed, miracle, anti-ageing cure\n" +
        "• Our promise to a new customer: an honest consultation about whether the treatment is right for you, realistic expectations about results and downtime, and no pressure to book on the day\n" +
        "• Proof we can cite: provider credentials, years practising, before-and-afters with consent, review count\n\n" +
        "Compliance note: no claim that a treatment is guaranteed, medical, or a cure. Keep every agent inside that line.",
      "asset-qualification-rubric":
        "Pre-filled for aesthetics. Change the definitions and every agent scores to your bar.\n\n" +
        "HOT — named a specific treatment, asked about availability or price, inside travel distance, no contraindication mentioned\n" +
        "WARM — exploring options, asked about results or downtime, no date in mind yet\n" +
        "COLD — price-shopping only, or asking about a treatment you don't offer\n" +
        "DISQUALIFIED — outside travel distance, under the age you treat, or describing a contraindication that needs a physician first\n\n" +
        "Aesthetics-specific signals worth weighting: named treatment vs vague interest, whether they've had the treatment before, and event-driven urgency (wedding, holiday, reunion).",
      "asset-escalation-matrix":
        "Pre-filled for aesthetics. Tune to your front-desk capacity.\n\n" +
        "Score 80-100 (HOT) — patient coordinator responds within 15 minutes, consultation offered inside 72 hours\n" +
        "Score 60-79 (WARM) — same-day reply, education-first cadence, soft consultation offer\n" +
        "Score 40-59 (COLD) — nurture cadence with results content, re-check in 30 days\n" +
        "Below 40 — newsletter only\n\n" +
        "Override: any message describing a complication or reaction goes straight to a provider, never to a cadence.",
    },
    playbookPrompts: {
      "playbook-score-inbound":
        "Score this aesthetics inquiry. Tell me which treatment they're actually asking about, how ready they are to book, and what the coordinator should say first. Stay inside compliance — no guarantees, no medical claims.\n\nInquiry:\n",
      "playbook-no-show-cadence":
        "This client booked a consultation and didn't show. Write the rescue cadence that gets them rebooked — warm, never guilt-trippy, and leading with education rather than the offer.\n\nContext:\n",
    },
  },
  {
    key: "dental",
    name: "The Dental Growth Desk",
    trade: "Dental and orthodontic practices",
    industryMatches: ["dental", "dentist", "orthodont", "oral surgery"],
    headline: "New-patient calls go to voicemail at 4:45pm. They call the next practice at 4:47pm.",
    promise:
      "New-patient inquiries qualified by insurance and treatment type before the front desk touches them, and every unscheduled treatment plan chased.",
    painPoints: [
      "The front desk is with a patient every time a new-patient call comes in",
      "Insurance questions eat the first five minutes of every conversation",
      "Diagnosed-but-unscheduled treatment sits in the software worth six figures and nobody has time to work it",
    ],
    objections: [
      "Do you take my insurance?",
      "I want to wait until my benefits reset",
      "I need to check with my spouse",
      "I've had a bad experience before",
    ],
    typicalJobValueCents: 320_000,
    // The six-month recall — the appointment the whole practice is built around.
    serviceIntervalDays: 180,
    assetBodies: {
      "asset-voice-profile":
        "Pre-filled for dental. Edit anything that isn't you.\n\n" +
        "• How we sound: reassuring, unhurried, never clinical-cold — a lot of people are anxious before they call\n" +
        "• Words we use: comfortable, treatment plan, benefits, financing, gentle\n" +
        "• Words we never use: painful, drill, cheap, you should have\n" +
        "• Our promise to a new patient: a clear explanation of what you need and what it costs before anything happens, and a team that takes anxiety seriously\n" +
        "• Proof we can cite: years in practice, technology, sedation options, review count",
      "asset-qualification-rubric":
        "Pre-filled for dental. Change the definitions and every agent scores to your bar.\n\n" +
        "HOT — in pain or has a specific treatment need, in network or willing to go out of network, asking about availability\n" +
        "WARM — due for a cleaning or exam, insurance verified, no urgency\n" +
        "COLD — price-shopping a single procedure, or benefits don't reset for months\n" +
        "DISQUALIFIED — outside the service area, or needs a specialty you don't offer and won't take a referral\n\n" +
        "Dental-specific signals worth weighting: pain (always urgent), insurance network status, and whether it's a new patient or a reactivation.",
      "asset-escalation-matrix":
        "Pre-filled for dental. Tune to your front-desk capacity.\n\n" +
        "Score 80-100 (HOT) — call back within 15 minutes, same-week appointment offered\n" +
        "Score 60-79 (WARM) — call back same day, book at their convenience\n" +
        "Score 40-59 (COLD) — cadence with benefits reminder, re-check before the plan year ends\n" +
        "Below 40 — recall list\n\n" +
        "Override: anything describing swelling, trauma, or severe pain is HOT and goes to a human immediately.",
    },
    playbookPrompts: {
      "playbook-score-inbound":
        "Score this dental inquiry. Tell me whether they're in pain, what treatment they likely need, what to verify about their insurance, and how fast the front desk should call back.\n\nInquiry:\n",
      "playbook-quote-followup":
        "We presented this treatment plan and it hasn't been scheduled. Write the follow-up sequence that gets it on the books — leading with the clinical reason to not wait, and offering financing without making it about money.\n\nTreatment plan context:\n",
    },
  },
  {
    key: "legal",
    name: "The Law Firm Growth Desk",
    trade: "Law firms",
    industryMatches: ["law", "legal", "attorney", "lawyer", "injury"],
    headline: "The case worth six figures came in at 11pm on a Saturday.",
    promise:
      "Every intake screened for merit, jurisdiction and statute before an attorney spends a minute on it.",
    painPoints: [
      "Attorneys burn billable hours screening inquiries that were never cases",
      "Genuinely good cases go to whoever called back first — often overnight or at the weekend",
      "Referrals out and conflicts checks happen late, after the relationship has already started",
    ],
    objections: [
      "How much is this going to cost me?",
      "I'm talking to a couple of firms",
      "I'm not sure I have a case",
      "I don't want to go to court",
    ],
    typicalJobValueCents: 750_000,
    // An annual review — estate, contracts, filings that quietly go stale.
    serviceIntervalDays: 365,
    assetBodies: {
      "asset-voice-profile":
        "Pre-filled for legal. Edit anything that isn't you.\n\n" +
        "• How we sound: measured, plain-English, never salesy — people contacting a lawyer are usually having a bad month\n" +
        "• Words we use: consultation, matter, jurisdiction, contingency, next step\n" +
        "• Words we never use: guarantee, win, easy money, sue\n" +
        "• Our promise to a new client: a straight answer about whether you have a matter worth pursuing, what it realistically involves, and what it costs\n" +
        "• Proof we can cite: years practising, bar admissions, case types handled, results where the jurisdiction permits stating them\n\n" +
        "Compliance note: agents must never predict an outcome, quote a settlement figure, or state anything that could read as legal advice. Every output ends with a human attorney reviewing it.",
      "asset-qualification-rubric":
        "Pre-filled for legal. Change the definitions and every agent scores to your bar.\n\n" +
        "HOT — matter type you practise, inside your jurisdiction, inside the statute of limitations, clear damages or clear liability\n" +
        "WARM — right matter type but facts are incomplete, or the timeline is tight but workable\n" +
        "COLD — matter type you practise but weak facts, or the person is still deciding whether to act\n" +
        "DISQUALIFIED — wrong jurisdiction, outside the statute, a conflict, or a practice area you refer out\n\n" +
        "Legal-specific signals worth weighting: date of incident against the statute, whether they've already retained counsel, and whether an insurer has already made contact.",
      "asset-escalation-matrix":
        "Pre-filled for legal. Tune to your intake capacity.\n\n" +
        "Score 80-100 (HOT) — intake attorney calls within 15 minutes, consultation booked same day\n" +
        "Score 60-79 (WARM) — paralegal calls same day to complete the facts, then re-score\n" +
        "Score 40-59 (COLD) — cadence with education, re-check in 14 days\n" +
        "Below 40 — referral out or a polite decline, sent the same day\n\n" +
        "Override: anything inside 30 days of a statute deadline is HOT regardless of score.",
    },
    playbookPrompts: {
      "playbook-score-inbound":
        "Screen this legal inquiry. Tell me the likely matter type, whether it's inside our jurisdiction and the statute of limitations, what facts are missing, and whether an attorney should take the call. Do not give legal advice or predict an outcome.\n\nInquiry:\n",
      "playbook-objection-drill":
        "This is the objection costing us signed matters. Give me three response frameworks with scripts an intake specialist can use, staying strictly inside ethical bounds — no outcome predictions, no guarantees.\n\nObjection:\n",
    },
  },
  {
    key: "remodeling",
    name: "The Remodeling Growth Desk",
    trade: "Remodelers and custom builders",
    industryMatches: ["remodel", "construction", "builder", "kitchen", "bath", "contractor"],
    headline: "Six months of design calls with people who were never going to spend $90,000.",
    promise:
      "Budget and readiness established before you drive out there, so every design consultation is with someone who can actually buy.",
    painPoints: [
      "Estimators spend their week on site visits for projects that die at the budget conversation",
      "Homeowners want a number before they'll say a budget, and the whole thing stalls",
      "Projects that do close take months of follow-up nobody has time to run",
    ],
    objections: [
      "That's way more than we budgeted",
      "We're getting a few more bids",
      "We want to wait until next year",
      "Can you break out the pricing?",
    ],
    typicalJobValueCents: 6_500_000,
    // A big remodel is a once-every-few-years event; the re-approach is the
    // next room, timed long so it never reads as pestering.
    serviceIntervalDays: 730,
    assetBodies: {
      "asset-voice-profile":
        "Pre-filled for remodeling. Edit anything that isn't you.\n\n" +
        "• How we sound: consultative and candid — we'd rather tell you the real number now than waste your Saturday\n" +
        "• Words we use: scope, allowance, timeline, change order, design phase\n" +
        "• Words we never use: cheap, ballpark, we'll figure it out, don't worry about it\n" +
        "• Our promise to a new customer: an honest range before we ever visit, a fixed scope before we start, and a schedule we hold ourselves to\n" +
        "• Proof we can cite: years building, licence, portfolio of comparable projects, references from the last 12 months",
      "asset-qualification-rubric":
        "Pre-filled for remodeling. Change the definitions and every agent scores to your bar.\n\n" +
        "HOT — budget stated and inside your range, homeowner, project starting inside 90 days, both decision-makers engaged\n" +
        "WARM — real project and right property, but budget is unstated or the timeline is 6+ months\n" +
        "COLD — early browsing, gathering ideas, no timeline\n" +
        "DISQUALIFIED — budget well below your minimum, outside the service area, renting, or shopping labour-only\n\n" +
        "Remodeling-specific signals worth weighting: whether a budget number was given at all, whether both partners are involved, and whether they already have drawings.",
      "asset-escalation-matrix":
        "Pre-filled for remodeling. Tune to your estimating capacity.\n\n" +
        "Score 80-100 (HOT) — owner or senior estimator calls within the hour, design consultation booked that week\n" +
        "Score 60-79 (WARM) — call same day specifically to establish budget, then re-score before booking a visit\n" +
        "Score 40-59 (COLD) — nurture cadence with project galleries, re-check in 45 days\n" +
        "Below 40 — nurture list, no site visit\n\n" +
        "Rule worth keeping: no site visit is booked from a WARM lead until a budget range has been said out loud.",
    },
    playbookPrompts: {
      "playbook-score-inbound":
        "Score this remodeling inquiry. Tell me whether a budget was actually stated, whether both decision-makers are involved, and whether this is worth a site visit or needs a budget call first.\n\nInquiry:\n",
      "playbook-quote-followup":
        "We proposed this project and it's gone quiet. They're comparing bids. Write the follow-up sequence that reopens it on scope and trust rather than price, ending with a clean break-up.\n\nProposal context:\n",
    },
  },
];

export function verticalByKey(key: string | null | undefined): VerticalPack | undefined {
  if (!key) return undefined;
  return VERTICAL_PACKS.find((v) => v.key === key);
}

/**
 * Best-effort match of a free-text industry string to a pack. Used to suggest a
 * pack at onboarding — never to silently override an explicit choice.
 */
export function verticalForIndustry(industry: string | null | undefined): VerticalPack | undefined {
  if (!industry) return undefined;
  const needle = industry.toLowerCase();
  return VERTICAL_PACKS.find((v) => v.industryMatches.some((m) => needle.includes(m)));
}

/**
 * Resolve the pack for a client: an explicit choice wins, otherwise fall back
 * to matching whatever they typed as their industry.
 */
export function resolveVertical(client: {
  verticalKey?: string | null;
  industry?: string | null;
}): VerticalPack | undefined {
  return verticalByKey(client.verticalKey) ?? verticalForIndustry(client.industry);
}

/**
 * Pure: return the module a client should actually be provisioned, with the
 * pack's copy swapped in where it has a better version. Never changes a
 * module's key, kind or delivery — the tier owns those, the pack owns content.
 */
export function applyVertical(module: SystemModule, pack: VerticalPack | undefined): SystemModule {
  if (!pack) return module;

  if (module.kind === "ASSET") {
    const body = pack.assetBodies[module.key];
    return body ? { ...module, body } : module;
  }
  if (module.kind === "PLAYBOOK") {
    const prompt = pack.playbookPrompts[module.key];
    return prompt ? { ...module, prompt } : module;
  }
  return module;
}

/** Every module key any pack claims to override — used by the tests. */
export function allOverrideKeys(): string[] {
  const keys = new Set<string>();
  for (const pack of VERTICAL_PACKS) {
    Object.keys(pack.assetBodies).forEach((k) => keys.add(k));
    Object.keys(pack.playbookPrompts).forEach((k) => keys.add(k));
  }
  return [...keys];
}

/** Every module key that exists in any tier. */
export function knownModuleKeys(): Set<string> {
  const keys = new Set<string>();
  for (const b of SYSTEM_BLUEPRINTS) {
    for (const m of b.modules) keys.add(m.key);
  }
  return keys;
}
