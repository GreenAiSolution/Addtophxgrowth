import { UPGRADES, OPERATORS, PARENT_SERVICES, FLIGHT_CHECK } from "@/lib/upgrades";

/**
 * The comparison — every upgrade, priced against the thing a buyer would
 * actually shop it against.
 *
 * DIRECTION
 *   A visitor reading a four-figure monthly price is not comparing it to zero.
 *   They are comparing it to a marketplace, an app, a software subscription, a
 *   dashboard or a retainer they have already seen an ad for — and if this page
 *   stays silent about those, the visitor runs the comparison alone, on the
 *   rival's landing page, with the rival writing both columns.
 *
 *   So the comparison happens here, in the open, and it is built to be the
 *   most honest one the visitor will find anywhere — including on the rivals'
 *   own sites. That is not decoration; it is the strategy. This site already
 *   refuses invented statistics and outcome claims, and the same posture is
 *   what makes a comparison believable: a page that can say plainly what the
 *   cheaper option is good at has standing to say what it leaves out.
 *
 * THE RULES (each enforced in `rivals.test.ts`)
 *   1. CATEGORIES, NOT COMPANIES. Every rival is a category — "a creator
 *      marketplace", "field-service software" — never a named vendor. A claim
 *      about a named company starts drifting false the day they change their
 *      pricing page, and nothing on this site is allowed to be a claim we
 *      cannot re-verify on every build. Categories stay true.
 *   2. STEELMAN REQUIRED. Every rival gets `credit`: what that route is
 *      genuinely good at, stated plainly. A comparison that cannot credit the
 *      other side is an advert wearing a table.
 *   3. THE EDGE IS STRUCTURAL. `edge` may not claim an outcome. It states a
 *      fact about how the upgrade is built — what it attaches to, who runs it,
 *      what you can see and stop — and it must name a real anchor: an operator,
 *      a parent service, another upgrade, or one of the site's own published
 *      mechanisms. An edge that anchors to nothing is a slogan.
 *   4. SAME HONESTY RULES AS EVERYTHING ELSE. No percentages, no multiples,
 *      no guaranteed results, anywhere in this file.
 *
 * WHY THIS MAKES US THE OBVIOUS CHOICE
 *   Not by shouting. Every rival on this list shares one structural fact: it
 *   starts from a blank intake form. It does not know the briefs Prism already
 *   wrote, the leads Closer is already working, the job history sitting in
 *   your records, or the site PHX/GROWTH already builds and hosts. Attachment
 *   is the one advantage a rival cannot copy without becoming the agency —
 *   so it is the spine of every edge below, and the scorecard hands the
 *   visitor the questions that surface it, to take to any vendor including us.
 */

export interface Rival {
  /** Which upgrade this is the alternative to. Validated against UPGRADES. */
  upgradeKey: string;
  /** The category a buyer would shop the upgrade against. Never a company. */
  route: string;
  /** What that route is genuinely good at. The steelman, required. */
  credit: string;
  /** What the buyer is left holding — the structural gap, not a smear. */
  holding: string;
  /** Why the upgrade wins here. A fact about construction, not an outcome. */
  edge: string;
  /**
   * The real thing the edge hangs on — an operator, service, upgrade or
   * published mechanism. The test verifies it exists and appears in `edge`,
   * so an edge can never quietly become a free-floating slogan.
   */
  anchor: string;
}

/**
 * Anchors an edge may claim, beyond names already defined in the catalogue.
 * Each is a mechanism this site actually publishes, on this page or in the
 * legal set — not a virtue word. Add to this list only with a surface that
 * states it.
 */
export const MECHANISM_ANCHORS = [
  FLIGHT_CHECK.label, // the parent's guarantee, quoted not invented
  "founding rate", // stated in PROOF_POSTURE
  "gate", // the builds' hold-for-you gate on anything that moves money
  "flight deck", // where transcripts and read-outs land
  "existing invoice", // FAIR_QUESTIONS: no second account to set up
  "inspectable node by node", // the parent's published automation standard
] as const;

export const RIVALS: Rival[] = [
  {
    upgradeKey: "motion-unit",
    route: "A creator marketplace",
    credit:
      "Pay per video, order a handful, and real creators turn footage around in days. For a brand that just needs something filmed this month, it is cheap to try and easy to leave.",
    holding:
      "You write the brief, pick the creator, chase the delivery, check the licence and judge the cut yourself — then hand the result to an ad account that had no say in any of it. The marketplace sells footage; nobody on either side is accountable for whether it was the footage the testing machine needed.",
    edge:
      "The Motion Unit films the briefs Prism already wrote, so nothing gets shot that the genome didn't ask for — and the desk deciding what runs, scales and dies is the same desk that ordered the footage. The marketplace cannot know your account; this is run by it.",
    anchor: "Prism",
  },
  {
    upgradeKey: "voice-employee",
    route: "A receptionist app",
    credit:
      "Genuinely inexpensive — some are priced like a phone bill — and if you have the hours to write the scripts, keep them current and read the transcripts yourself, a good one answers calls competently.",
    holding:
      "It answers with whatever you last taught it. It knows nothing about your offers, your ads or your calendar unless you maintain all three by hand, and its transcript lands in an inbox nobody is paid to read — so the call gets answered and the lead still goes nowhere.",
    edge:
      "This is the eleventh operator on a crew that already knows your business: quoting rules and qualification bars are maintained for you, the caller is handed straight to Closer mid-cadence, and every transcript is on the flight deck before you wake up. An app takes the call; an operator takes it somewhere.",
    anchor: "Closer",
  },
  {
    upgradeKey: "job-runner",
    route: "Field-service software",
    credit:
      "Excellent record-keeping for a low subscription. If somebody in your office lives in it all day, it will hold the schedule, the quotes and the invoices faithfully — the good ones are genuinely good filing cabinets.",
    holding:
      "Software waits to be operated. Every quote still has to be raised by the person the subscription doesn't include, and the leak this upgrade exists to fix — the busy fortnight when nobody raises anything — is precisely the fortnight nobody opens the software either. You bought the cabinet; the clerk is still you.",
    edge:
      "The Job Runner is the operator, not the tool: quotes go out the same day, the customer is told who is coming, and invoices are raised and chased without anyone remembering to. Anything that moves money waits at a gate until you release it, and every step is inspectable — the standard the loops it runs beside already publish.",
    anchor: "gate",
  },
  {
    upgradeKey: "comeback",
    route: "An email tool and a spare afternoon",
    credit:
      "Newsletter tools are cheap, and the instinct is right — your past customers are the best list you own. A blast sent whenever someone finds the time genuinely does bring the odd job back.",
    holding:
      "The trigger for the next job is not a marketing calendar; it is a date already sitting in your records — a service interval, a warranty window, a season. A blast cannot know whose date fell due this week, and the spare afternoon never arrives in exactly the seasons when the reminders matter most.",
    edge:
      "The Comeback reads the dates your job history already holds — put there cleanly by the Job Runner, if it is running — and approaches each name when their work is genuinely due, with every message visible to you before it sends. A tool mails your list; this one reads your records.",
    anchor: "Job Runner",
  },
  {
    upgradeKey: "tuning-lab",
    route: "Leaving the crew on factory settings",
    credit:
      "It costs nothing, and for the first month it is indistinguishable from tuning — the crew ships with good defaults, and good defaults take a while to go stale.",
    holding:
      "Prompts written on day one are meeting the objections of day ninety. Drift is invisible precisely because every conversation still sounds fine — what changed is your offers, your prices and what buyers push back on, and nothing untouched is tracking any of it against the deals that closed.",
    edge:
      "The Tuning Lab grades the crew against data that exists nowhere but inside your account — the transcripts and what each deal actually did — then retunes monthly and writes down what changed. Tower keeps the crew healthy; this keeps it current, and no outside tool can, because no outside tool can see the deals.",
    anchor: "Tower",
  },
  {
    upgradeKey: "answer-engine",
    route: "A monitoring dashboard",
    credit:
      "Genuinely useful, at a software price: it will show you exactly what the assistants say about your category, on a schedule, with the sources they leaned on. As a diagnosis, hard to beat for the money.",
    holding:
      "A dashboard ends where the work begins. It can tell you that you are absent from the answer; it cannot write the answer pages, publish the machine-readable facts, or repair your entities across the places a model reads. You are buying the diagnosis, then hiring the cure separately — usually from someone who has never seen your site.",
    edge:
      "This is the cure with the diagnosis included: the facts published, the pages written and the consistency repaired, on the site Website Creation already builds and hosts — plus the monthly report of what the assistants actually say. One team touches the site and reads the results, so the fix and the measurement can never drift apart.",
    anchor: "Website Creation",
  },
  {
    upgradeKey: "citation-authority",
    route: "A general PR retainer",
    credit:
      "A good PR firm earns real coverage, and the best of it outperforms anything on this page. If you have the budget for a name firm and a story worth national press, take that seriously — it is not what this replaces.",
    holding:
      "General-purpose PR is scoped for brand campaigns, awards and readers. What a model needs is narrower and less glamorous: the trade press, local roundups, association directories and licensing records it actually cites — and most retainers were never pointed at those, because no human reader was asking for them.",
    edge:
      "Citation & Authority is scoped to exactly the sources assistants quote, and it runs beside Answer Engine Visibility — so what gets earned off your site corroborates what your own pages assert, instead of the two being bought from vendors who have never met. That pairing is the whole reason the Answer Stack exists.",
    anchor: "Answer Engine Visibility",
  },
];

export function rivalFor(upgradeKey: string): Rival | undefined {
  return RIVALS.find((r) => r.upgradeKey === upgradeKey);
}

/** Every anchor an edge is allowed to claim, resolved from the catalogue. */
export function allowedAnchors(): Set<string> {
  return new Set([
    ...OPERATORS.map((o) => o.name),
    ...PARENT_SERVICES.map((s) => s.name),
    ...UPGRADES.map((u) => u.name.replace(/^The /, "")),
    ...UPGRADES.map((u) => u.name),
    ...MECHANISM_ANCHORS,
  ]);
}

/**
 * The scorecard — the questions that decide the comparison, handed to the
 * visitor to take to any vendor. Including us.
 *
 * This is the closing argument, and it works only because every answer below
 * is checkable on this site today: the additive rules are tests, the prices
 * are public and machine-readable, the gate is stated per build, and the
 * guarantee is the parent's own. A scorecard we could not grade ourselves
 * against in public would be the logo wall with extra steps.
 */
export const SCORECARD: { q: string; us: string }[] = [
  {
    q: "Does it attach to marketing that's already running?",
    us: "Every upgrade bolts onto a PHX/GROWTH service already flying — the briefs, transcripts, job records and site it works from exist before day one. A vendor starting from a blank intake form spends its first quarter learning what your account already knows.",
  },
  {
    q: "Who operates it — you, or someone accountable?",
    us: "The same team already flying your account, in the same Slack war room, with the specialists each upgrade needs. Nothing on this page is a login and a wish; if it were software for you to run, it would say so and cost what software costs.",
  },
  {
    q: "Can it sell you something you already pay for?",
    us: "Not here, by construction: every upgrade is checked by machine against the parent's own published bullet lists, its ten-operator roster and its twelve-item Manifest, and seven upgrades have been cut for overlapping. Ask any other vendor what stops them re-selling you your own stack.",
  },
  {
    q: "Is every price public?",
    us: "All of them — every upgrade and bundle is priced on this page and published machine-readably at /api/catalogue, so an assistant quotes the same figure a human reads. No call required to learn a number, here or in writing.",
  },
  {
    q: "What can you see, and what can you stop?",
    us: "The automation builds are inspectable node by node — the parent's published standard, not a brochure line — and anything that moves money waits at a gate until you release it. Ask a rival to show you the loop; a black box at a lower price is still a black box.",
  },
  {
    q: "What are the results claims resting on?",
    us: "Ours rest on nothing yet, and the page says so out loud: no numbers, no multiples, no testimonials anywhere, enforced by a test that fails the build. A vendor opening with a wall of logos and big claims should be able to show you the maths behind them — ask.",
  },
  {
    q: "What happens if it doesn't work?",
    us: `${FLIGHT_CHECK.label} — the parent's own guarantee rather than a second one invented here. Month to month, no lock-in, and your accounts and data leave with you. A rival's answer to this question is usually in their cancellation clause; read it before the demo.`,
  },
];

/** The section's framing, held with the data so the page cannot re-argue it. */
export const VERSUS = {
  eyebrow: "Against the alternatives",
  headline: "Shop this page against anything.",
  body:
    "Every upgrade here has a cheaper rival, and this page names them — including what each one is genuinely good at, because a comparison that can't credit the other side isn't one. What none of them can do is attach: to the account already spending, the crew already answering, the records already kept, and the invoice you already pay. That is the whole difference, and it is the one a rival cannot copy without becoming the agency.",
} as const;
