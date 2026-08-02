/**
 * THE FOLLOW-UP DECK.
 *
 * DIRECTION
 *   This is the presentation we screen-share on the Zoom that follows the cold
 *   call. It is the same deck every time — a routine, not a bespoke pitch —
 *   because the second call has one job: show the owner the whole machine,
 *   in order, and let them see where their own business falls inside it.
 *
 *   Five acts, and the order is load-bearing:
 *
 *     1. THE RECAP     — repeat what was promised on the phone, out loud.
 *     2. THE HOUSE     — phxgrowth.com, page by page. Everything already flying.
 *     3. THE MONEY     — the mechanisms revenue actually moves through, then
 *                        the exact sentence where the parent's coverage stops.
 *     4. THE COUNTER   — PHX/GROWTH PLUS, page by page. What sits in that gap.
 *     5. THE PATH      — what happens after the call ends.
 *
 *   The hinge is act three. Acts one and two spend eleven slides describing
 *   somebody else's product in detail and sell nothing, which is the only
 *   reason act four is believed. An owner who has been pitched four times this
 *   year can feel a deck that is only describing the problem it happens to
 *   solve, and discounts everything downstream of it.
 *
 * NOTHING HERE IS TYPED
 *   Every price, fee, service name, operator, manifest item, loop, upgrade and
 *   bundle is read from `@/lib/upgrades` — the same module the public price
 *   list and `/api/catalogue` render from. A deck is the worst possible place
 *   for a hand-typed figure: it is shown to the person paying, it gets
 *   screenshotted, and nobody re-reads slide fourteen when the catalogue moves.
 *   `presentation.test.ts` reads this file and fails on a literal dollar
 *   amount or percentage.
 *
 * THE TALK TRACK IS NOT IN HERE
 *   What the rep says lives in `@/lib/run-sheet`, and the stage never imports
 *   it. Two reasons: the run sheet carries our own economics, which must not
 *   be one keystroke away from a shared screen; and the person presenting
 *   wants the script on a second device, not layered over the slide.
 */

import {
  PARENT_SERVICES,
  FLIGHT_PLANS,
  OPERATORS,
  MANIFEST,
  AUTOMATION_LOOPS,
  LAUNCH_TIMELINE,
  FLAGSHIP,
  REVENUE_LEVERS,
  UPGRADES,
  BUNDLES,
  PROOF_POSTURE,
  FLIGHT_CHECK,
  FAIR_QUESTIONS,
  HOUSE_STRIP,
  CREATION_DISCLAIMER,
  AUTOMATION_SPINE,
  bundleListPrice,
  bundleSaving,
  bundleMembers,
  serviceByKey,
  entryPrice,
} from "@/lib/upgrades";
import { DECK_INDEX } from "@/lib/deck";
import { CLIENT_NAV } from "@/lib/nav";
import { computeLeak } from "@/lib/leak";
import { BRAND } from "@/lib/brand";
import { formatCurrency, formatNumber } from "@/lib/utils";

/* ── The five acts ──────────────────────────────────────────────────────── */

export const ACTS = [
  { key: "recap", label: "The recap" },
  { key: "house", label: "The house" },
  { key: "money", label: "The money" },
  { key: "counter", label: "The counter" },
  { key: "path", label: "The path" },
] as const;

export type ActKey = (typeof ACTS)[number]["key"];

/* ── Layouts ────────────────────────────────────────────────────────────── */

export type Accent = "cyan" | "violet" | "magenta" | "gold" | "signal";

export interface Row {
  /** Printed in mono down the left — a number, a price, a timestamp. */
  lead: string;
  title: string;
  body: string;
  /** Optional right-hand chip: which service, which domain. */
  tag?: string;
}

export interface Card {
  eyebrow?: string;
  title: string;
  /** Already formatted. Never a raw number — the caller owns the units. */
  price?: string;
  priceNote?: string;
  lines: string[];
  note?: string;
  accent?: Accent;
}

export type SlideBody =
  | { kind: "title"; statement: string; strip: string[] }
  | { kind: "list"; rows: Row[]; dense?: boolean }
  | { kind: "cards"; columns: 2 | 3 | 4; cards: Card[] }
  | {
      kind: "chain";
      chains: { name: string; cadence: string; detail: string; nodes: string[] }[];
    }
  | {
      kind: "split";
      claim: string;
      points: { title: string; body: string }[];
      footnote?: string;
      accent?: Accent;
    }
  | {
      kind: "math";
      caption: string;
      rows: { label: string; value: string; note?: string }[];
      total?: { label: string; value: string; note?: string };
      footnote: string;
    };

export interface Slide {
  /** Stable — the run sheet keys its talk track off this. */
  id: string;
  act: ActKey;
  eyebrow: string;
  title: string;
  lede?: string;
  /** Minutes to spend here. `RUNNING_TIME` sums them; nothing is guessed. */
  minutes: number;
  body: SlideBody;
}

/* ── Derived figures. Computed once, never retyped. ─────────────────────── */

/** The apex bundle. Gold on the page, gold here. */
const APEX_BUNDLE = BUNDLES.find((b) => b.apex)!;

/** The middle flight plan — the one the parent badges "Most flown". */
const REFERENCE_PLAN = FLIGHT_PLANS.find((p) => p.badge) ?? FLIGHT_PLANS[1]!;

/** Their fee rate, lifted out of their own label rather than restated. */
const REFERENCE_FEE_RATE = REFERENCE_PLAN.fee.match(/(\d+)%/)![1]!;

/**
 * Managed spend used in the worked example, in cents. Chosen because it sits
 * inside the reference plan's stated ceiling and is a round number an owner can
 * re-do in their head — not because it is anybody's average.
 */
const EXAMPLE_SPEND = 10_000_000;

const EXAMPLE_FEE = Math.round((EXAMPLE_SPEND * Number(REFERENCE_FEE_RATE)) / 100);

/**
 * The parent publishes its plan prices as display strings, not as cents — they
 * are their figures, quoted, and this repository deliberately does not restate
 * them as numbers it could get wrong. The worked example has to add one up, so
 * it is parsed back out of the label rather than typed beside it. Parsed, the
 * total can only ever be wrong in the same direction as the quote it came from.
 */
function planPriceCents(label: string): number {
  return Number(label.replace(/[^\d]/g, "")) * 100;
}

/**
 * The illustrative account for the Response Clock hand-off.
 *
 * These five numbers are the visitor's to supply — the tool asks for them and
 * multiplies them, and on the call we replace every one of them live. They are
 * here so the slide has a shape to point at while it is being replaced, and
 * the arithmetic below runs through the same `computeLeak` the site uses, so
 * the number on the slide cannot disagree with the number on the screen.
 */
export const EXAMPLE_ACCOUNT = {
  callsPerMonth: 180,
  missedPct: 20,
  jobValue: 90_000,
  closeRate: 30,
  recovery: 0.5,
} as const;

const VOICE = UPGRADES.find((u) => u.key === "voice-employee")!;
const EXAMPLE_LEAK = computeLeak({ ...EXAMPLE_ACCOUNT }, VOICE.price);

/** Total running time, summed from the slides rather than asserted. */
export function runningTime(slides: Slide[] = SLIDES): number {
  return slides.reduce((n, s) => n + s.minutes, 0);
}

/* ── The routine ────────────────────────────────────────────────────────── */

export const SLIDES: Slide[] = [
  /* ── Act 1 · The recap ────────────────────────────────────────────────── */
  {
    id: "open",
    act: "recap",
    eyebrow: `${BRAND.parent.name} · follow-up`,
    title: "The whole machine, in one call.",
    minutes: 1,
    body: {
      kind: "title",
      statement: BRAND.parent.tagline,
      strip: HOUSE_STRIP,
    },
  },
  {
    id: "agenda",
    act: "recap",
    eyebrow: "Agenda",
    title: "Five parts. You can stop me in any of them.",
    lede: "Nothing is sold until part four. The first three are so you can judge part four.",
    minutes: 1,
    body: {
      kind: "list",
      rows: [
        {
          lead: "01",
          title: "The recap",
          body: "What I said on the phone, repeated out loud so you can hold me to it.",
        },
        {
          lead: "02",
          title: `The house — ${BRAND.domain}`,
          body: "Every page, every service, every price, and the crew that flies it. This is the part that is already running.",
        },
        {
          lead: "03",
          title: "The money",
          body: "The three mechanisms revenue actually moves through — and the exact sentence where all of it stops.",
        },
        {
          lead: "04",
          title: `The counter — ${BRAND.name}`,
          body: `The ${UPGRADES.length} things nobody on your account is doing yet, what each costs, and what they cost stacked.`,
        },
        {
          lead: "05",
          title: "The path",
          body: "What happens between hanging up and going live. No card today, nothing charged.",
        },
      ],
    },
  },
  {
    id: "recap",
    act: "recap",
    eyebrow: "Where we left it",
    title: "What I told you on the phone.",
    minutes: 2,
    body: {
      kind: "split",
      claim:
        "Two businesses, one company. One of them flies your ad account. The other sells the specific work that account cannot reach — and it will only sell you something the first one does not already do.",
      points: [
        {
          title: `${BRAND.parent.name} is the flight plan`,
          body: `${PARENT_SERVICES.length} services à la carte, ${FLIGHT_PLANS.length} managed plans on top of them, ${OPERATORS.length} named operators flying it, and a published ${MANIFEST.length}-item manifest of what "everything" means.`,
        },
        {
          title: `${BRAND.name} is the upgrade counter`,
          body: `${UPGRADES.length} upgrades and ${BUNDLES.length} stacks that bolt onto those services. Every one names the service it attaches to. An upgrade that attaches to nothing is a second agency in disguise.`,
        },
        {
          title: "What this call is not",
          body: "There is no close on this call and no card taken. You get a price in writing afterwards, and you decide with the numbers in front of you.",
        },
      ],
      footnote: PROOF_POSTURE.headline,
    },
  },

  /* ── Act 2 · The house ────────────────────────────────────────────────── */
  {
    id: "house-map",
    act: "house",
    eyebrow: `${BRAND.domain} · site map`,
    title: "The house, page by page.",
    lede: "Nine surfaces. I am going to walk all of them before I sell you anything.",
    minutes: 3,
    body: {
      kind: "list",
      dense: true,
      rows: [
        {
          lead: "/",
          title: "Home — the cockpit",
          body: "Opens with a live demo and math you can audit rather than a logo wall. Carries the credential strip, the Growth Calculator and the flight check.",
          tag: "Front door",
        },
        {
          lead: "/ads",
          title: "Ad Management — the Manifest",
          body: `The ${MANIFEST.length} numbered items under "what 'everything' means, in writing", plus the two revenue levers. States plainly: "${CREATION_DISCLAIMER}"`,
          tag: "Scope",
        },
        {
          lead: "/crew",
          title: "AI Employees — the roster",
          body: `${OPERATORS.length} named operators from strategy to reputation, deployed in your Slack in the first week and working around the clock.`,
          tag: "Crew",
        },
        {
          lead: "/web",
          title: "Website Creation",
          body: `${serviceByKey("website-creation")!.role}`,
          tag: "Build",
        },
        {
          lead: "/auto",
          title: "Automation — the Spine",
          body: `${AUTOMATION_LOOPS.length} published loops, each printed node by node. ${AUTOMATION_SPINE.body}`,
          tag: "Loops",
        },
        {
          lead: "/apex",
          title: `${FLAGSHIP.name} — the flagship`,
          body: `${FLAGSHIP.access}. ${FLAGSHIP.scoping}`,
          tag: "Private",
        },
        {
          lead: "/plans",
          title: "Flight plans",
          body: `${FLIGHT_PLANS.map((p) => `${p.name} ${p.price}`).join(" · ")} — each with its own performance fee and managed-spend ceiling.`,
          tag: "Pricing",
        },
        {
          lead: "/calc",
          title: "The Growth Calculator",
          body: "Projects forward from your spend and your margins, states its assumptions out loud, and tells you when the math does not yet cover the retainer.",
          tag: "Tool",
        },
        {
          lead: "/proof",
          title: "Results",
          body: PROOF_POSTURE.body,
          tag: "Posture",
        },
      ],
    },
  },
  {
    id: "services",
    act: "house",
    eyebrow: "À la carte",
    title: `${PARENT_SERVICES.length} services. Buy one, or buy the plan that flies them together.`,
    minutes: 3,
    body: {
      kind: "cards",
      columns: 3,
      cards: PARENT_SERVICES.map((s, i) => ({
        eyebrow: s.role,
        title: s.name,
        price: s.priceLabel,
        priceNote: s.feeLabel,
        lines: s.includes,
        accent: (["cyan", "violet", "magenta"] as const)[i],
      })),
    },
  },
  {
    id: "plans",
    act: "house",
    eyebrow: "Managed",
    title: "Three flight plans. The fee falls as the spend rises.",
    lede: "The performance fee is a share of the ad spend we actively manage — it is not charged on anything else.",
    minutes: 2,
    body: {
      kind: "cards",
      columns: 3,
      cards: FLIGHT_PLANS.map((p) => ({
        eyebrow: p.badge ?? p.code,
        title: p.name,
        price: p.price,
        priceNote: p.fee,
        lines: [p.promise, p.ceilingNote],
        accent: p.badge === "Apex" ? "gold" : p.badge ? "violet" : "cyan",
      })),
    },
  },
  {
    id: "roster",
    act: "house",
    eyebrow: "The crew",
    title: `${OPERATORS.length} operators, each with one job.`,
    lede: "This is the list I check every upgrade against. If one of these already does it, we do not sell it to you.",
    minutes: 3,
    body: {
      kind: "list",
      dense: true,
      rows: OPERATORS.map((o) => ({
        lead: o.name,
        title: o.role,
        body: o.covers,
        tag: o.domain,
      })),
    },
  },
  {
    id: "manifest",
    act: "house",
    eyebrow: "The Manifest",
    title: "What “everything” means, in writing.",
    lede: "Published on their own page, numbered. Most agencies will not write this down.",
    minutes: 3,
    body: {
      kind: "list",
      dense: true,
      rows: MANIFEST.map((m) => ({ lead: m.n, title: m.title, body: m.detail })),
    },
  },
  {
    id: "spine",
    act: "house",
    eyebrow: AUTOMATION_SPINE.eyebrow,
    title: AUTOMATION_SPINE.headline,
    lede: AUTOMATION_SPINE.body,
    minutes: 3,
    body: {
      kind: "chain",
      chains: AUTOMATION_LOOPS.map((l) => ({
        name: l.name,
        cadence: l.cadence,
        detail: l.detail,
        nodes: l.nodes,
      })),
    },
  },
  {
    id: "launch",
    act: "house",
    eyebrow: "Zero to live",
    title: "One URL to live ads, in under an hour.",
    lede: "This is the onboarding. There is no kickoff call and no intake form.",
    minutes: 2,
    body: {
      kind: "list",
      rows: LAUNCH_TIMELINE.map((t) => ({ lead: t.at, title: t.title, body: t.detail })),
    },
  },
  {
    id: "flagship",
    act: "house",
    eyebrow: FLAGSHIP.badge,
    title: FLAGSHIP.tagline,
    lede: FLAGSHIP.summary,
    minutes: 2,
    body: {
      kind: "split",
      accent: "gold",
      claim: FLAGSHIP.scoping,
      points: FLAGSHIP.includes.map((line) => ({ title: line, body: "" })),
      footnote: `Access: ${FLAGSHIP.access}. If you commission this, anything on the upgrade counter can be engineered into it — I would rather say that than have you find it out later.`,
    },
  },

  /* ── Act 3 · The money ────────────────────────────────────────────────── */
  {
    id: "mechanisms",
    act: "money",
    eyebrow: "How the money moves",
    title: "Three mechanisms. Everything else is downstream of these.",
    lede: "Nothing on this slide is a claim about results. Each one is a description of what the machine does to a dollar.",
    minutes: 3,
    body: {
      kind: "cards",
      columns: 3,
      cards: [
        {
          eyebrow: AUTOMATION_LOOPS[0]!.cadence,
          title: "Same spend, sorted better",
          lines: [
            AUTOMATION_LOOPS[0]!.detail,
            "Ranked by marginal return on your P&L, not on platform-reported ROAS.",
            "Platform numbers reconciled against your books on every run.",
          ],
          note: "The budget does not get bigger. It gets pointed somewhere better, every fifteen minutes.",
          accent: "cyan",
        },
        ...REVENUE_LEVERS.map((l, i) => ({
          eyebrow: l.code,
          title: l.name,
          lines: l.bullets,
          note: l.claim,
          accent: (["violet", "magenta"] as const)[i],
        })),
      ],
    },
  },
  {
    id: "ceiling",
    act: "money",
    eyebrow: "The hinge",
    title: "And then it stops.",
    lede: "Every service above has a published edge. These are their words, not mine — and this is the only reason the next act exists.",
    minutes: 4,
    body: {
      kind: "split",
      accent: "gold",
      claim:
        "The machine buys attention brilliantly and stops at the moment somebody says yes. Everything after that moment is nobody's standing job.",
      points: PARENT_SERVICES.map((s) => ({ title: s.name, body: s.ceiling })),
      footnote:
        "The flagship can engineer past all three — but it is by application, priced privately, and rationed to a few builds a quarter. The counter is the productised route.",
    },
  },
  {
    id: "leak",
    act: "money",
    eyebrow: "Live — we do this with your numbers",
    title: "What the phone costs you when nobody picks it up.",
    lede: "Five inputs, all yours. No benchmark, no industry average, no lift factor. It is your own numbers multiplied.",
    minutes: 4,
    body: {
      kind: "math",
      caption: "Illustrative only — I replace every line of this with yours on the screen in a moment.",
      rows: [
        {
          label: "Inbound calls a month",
          value: formatNumber(EXAMPLE_ACCOUNT.callsPerMonth),
          note: "Your number",
        },
        {
          label: "Reaching voicemail",
          value: formatNumber(EXAMPLE_LEAK.missedCalls),
          note: "Your number",
        },
        {
          label: "What one closed job is worth",
          value: formatCurrency(EXAMPLE_ACCOUNT.jobValue),
          note: "Your number",
        },
        {
          label: "Booked work behind the voicemails",
          value: `${formatCurrency(EXAMPLE_LEAK.monthlyLeak)}/mo`,
          note: `${formatCurrency(EXAMPLE_LEAK.annualLeak)} a year`,
        },
        {
          label: "Assumed genuinely recoverable",
          value: formatCurrency(EXAMPLE_LEAK.recoverable),
          note: "A slider you drag, not a constant we hide",
        },
      ],
      total: {
        label: `Cost of the fix — ${VOICE.name}`,
        value: `${formatCurrency(VOICE.price)}/mo`,
        note: VOICE.fixes,
      },
      footnote:
        "If the arithmetic comes out underwater on your numbers, the tool says so and I will tell you not to buy it. A calculator that always recommends buying is a brochure with sliders.",
    },
  },
  {
    id: "posture",
    act: "money",
    eyebrow: PROOF_POSTURE.eyebrow,
    title: PROOF_POSTURE.headline,
    minutes: 2,
    body: {
      kind: "split",
      accent: "signal",
      claim: PROOF_POSTURE.body,
      points: [
        { title: "The founding rate", body: PROOF_POSTURE.founding },
        { title: FLIGHT_CHECK.label, body: FLIGHT_CHECK.body },
      ],
      footnote:
        "You will not find a percentage, a multiple or a testimonial on either site, because there is not an honest one to show yet. When there are real numbers you will see real numbers.",
    },
  },

  /* ── Act 4 · The counter ──────────────────────────────────────────────── */
  {
    id: "counter-map",
    act: "counter",
    eyebrow: `${BRAND.name} · site map`,
    title: "The counter, page by page.",
    lede: "Two public pages, an open data endpoint, and the console you log into once you are flying.",
    minutes: 3,
    body: {
      kind: "list",
      dense: true,
      rows: [
        {
          lead: "/",
          title: "The instrument deck",
          body: `One live system map and ${DECK_INDEX.length - 1} tools. No case studies, no slide deck — every claim on it is arithmetic performed on numbers you typed, and it stays in your tab.`,
          tag: "Public",
        },
        {
          lead: "/upgrades",
          title: "The price list",
          body: `Am-I-already-paying-for-this → the spine → the ${UPGRADES.length} upgrades → the ${BUNDLES.length} stacks → the flight plans → the fair questions → the enquiry form.`,
          tag: "Public",
        },
        {
          lead: "/api/catalogue",
          title: "The offer, machine-readable",
          body: "The whole catalogue as JSON, deliberately left crawlable. We sell Answer Engine Visibility; publishing our own prices as structured facts is the least we can do while charging for it.",
          tag: "Open",
        },
        {
          lead: "/legal",
          title: "Terms, privacy, services agreement",
          body: "Every fee in the contract is a fee on the page — the build fails if the legal set quotes a price this business does not charge.",
          tag: "Contract",
        },
        {
          lead: "/app",
          title: "The client console",
          body: `${CLIENT_NAV.length} surfaces, behind sign-in. This is what you actually live in once the account is flying.`,
          tag: "Yours",
        },
        {
          lead: "/admin",
          title: "Our side",
          body: "Cross-client triage that lists only what is wrong, ranked so the silently-broken things sit above the loud ones.",
          tag: "Ours",
        },
      ],
    },
  },
  {
    id: "instruments",
    act: "counter",
    eyebrow: "The instrument deck",
    title: "Seven tools. One of them sells you nothing.",
    lede: "Free, nothing to sign up for, and we will run whichever ones you want live on this call.",
    minutes: 3,
    body: {
      kind: "list",
      rows: DECK_INDEX.map((d) => ({
        lead: d.n,
        title: d.name,
        body: d.reads,
        tag: d.folded ? "More tools" : undefined,
      })),
    },
  },
  {
    id: "upgrades",
    act: "counter",
    eyebrow: "The counter",
    title: `${UPGRADES.length} upgrades. Every one names the service it bolts onto.`,
    lede: "Each is written against that service's own bullet list, so anything already included is out of scope by construction.",
    minutes: 5,
    body: {
      kind: "list",
      dense: true,
      rows: UPGRADES.map((u) => ({
        lead: `${formatCurrency(u.price)}${u.billing === "monthly" ? "/mo" : ""}`,
        title: `${u.name} — ${u.promise}`,
        body: `Fixes: ${u.fixes}. ${u.delivers[0]!}`,
        tag: serviceByKey(u.attachesTo)!.name,
      })),
    },
  },
  {
    id: "bundles",
    act: "counter",
    eyebrow: "Stacked",
    title: "Taken together, they cost less and they compound.",
    lede: "A stack is not a discount dressed as a package — each one exists because its members make each other worth more.",
    minutes: 4,
    body: {
      kind: "cards",
      columns: 4,
      cards: BUNDLES.map((b) => ({
        eyebrow: b.apex ? "Apex" : `${bundleMembers(b).length} upgrades`,
        title: b.name,
        price: `${formatCurrency(b.price)}/mo`,
        priceNote: `vs ${formatCurrency(bundleListPrice(b))} apart · keep ${formatCurrency(bundleSaving(b))}`,
        lines: bundleMembers(b).map((u) => u.name),
        note: b.promise,
        accent: b.apex ? "gold" : "violet",
      })),
    },
  },
  {
    id: "console",
    act: "counter",
    eyebrow: "After you sign",
    title: "What you actually log into.",
    lede: "The upgrades are not a report emailed monthly. This is the surface they run on.",
    minutes: 3,
    body: {
      kind: "list",
      dense: true,
      rows: [
        { lead: "01", title: "Dashboard", body: "Every account, every plan, what ran overnight." },
        {
          lead: "02",
          title: "Morning Brief",
          body: "Assembled overnight from scored data by a pure function — a model outage costs you the summary paragraph, never the call list.",
        },
        { lead: "03", title: "Leads", body: "Everything that came in, scored, with the intake URL your own site posts to." },
        {
          lead: "04",
          title: "The Queue",
          body: "The gate. Anything that moves money waits here until you release it, and every release is recorded against your name.",
        },
        { lead: "05", title: "Agent Workspace", body: "The crew, run interactively, metered against your plan." },
        { lead: "06", title: "Recall & System Memory", body: "What closed deals taught the system, with the confidence shown rather than hidden — and a mute on anything you disagree with." },
        { lead: "07", title: "Ad Ops", body: "Spend, targets and the Spend Watch — seven unattended checks that skip rather than guess when a target is missing." },
        { lead: "08", title: "Requests, Reports, Billing", body: "One thread with a real person, generated reports, and the invoice — no second account to set up." },
      ],
    },
  },
  {
    id: "worked",
    act: "counter",
    eyebrow: "A full flight, priced",
    title: "What the whole thing costs, with nothing hidden.",
    lede: `${REFERENCE_PLAN.name} plus every upgrade on the board. Most accounts start with one or two — this is the ceiling, not the recommendation.`,
    minutes: 3,
    body: {
      kind: "math",
      caption: "Every figure below is read from the same catalogue the public price list renders from.",
      rows: [
        {
          label: `${REFERENCE_PLAN.name} — ${REFERENCE_PLAN.promise}`,
          value: `${REFERENCE_PLAN.price}`,
          note: REFERENCE_PLAN.ceilingNote,
        },
        {
          label: `Performance fee (${REFERENCE_PLAN.fee.replace("+ ", "")})`,
          value: `${formatCurrency(EXAMPLE_FEE)}/mo`,
          note: `At ${formatCurrency(EXAMPLE_SPEND)}/mo of managed spend — it scales with the spend, not with us`,
        },
        {
          label: `${APEX_BUNDLE.name} — all ${bundleMembers(APEX_BUNDLE).length} upgrades`,
          value: `${formatCurrency(APEX_BUNDLE.price)}/mo`,
          note: `${formatCurrency(bundleSaving(APEX_BUNDLE))}/mo below buying them one at a time`,
        },
        // The entry price deliberately does NOT sit in this table. It was a
        // fourth row for a while and the column then read as a four-line sum
        // that did not add up to its own total — the one arithmetic error a
        // buyer is guaranteed to check. It belongs in the footnote, where it is
        // an alternative to the total rather than a component of it.
      ],
      total: {
        label: "Everything, at that spend",
        value: `${formatCurrency(planPriceCents(REFERENCE_PLAN.price) + EXAMPLE_FEE + APEX_BUNDLE.price)}/mo`,
        note: "The three lines above, added up",
      },
      footnote: `Upgrades are flat and sit outside the performance fee entirely. They land on your existing invoice — there is no second account and no second point of contact. And the other end of the range: one upgrade, from ${formatCurrency(
        entryPrice(),
      )}/mo, month to month, cancel ahead of any renewal.`,
    },
  },

  /* ── Act 5 · The path ─────────────────────────────────────────────────── */
  {
    id: "questions",
    act: "path",
    eyebrow: "Fair questions",
    title: "The five things everybody asks, answered before you ask them.",
    minutes: 3,
    body: {
      kind: "list",
      dense: true,
      rows: FAIR_QUESTIONS.map((f, i) => ({
        lead: String(i + 1).padStart(2, "0"),
        title: f.q,
        body: f.a,
      })),
    },
  },
  {
    id: "next",
    act: "path",
    eyebrow: "What happens next",
    title: "Nothing is charged today.",
    minutes: 2,
    body: {
      kind: "split",
      accent: "signal",
      claim:
        "You tell me which gap you want closed first. I send the price in writing, with the scope written against the bullet list of the service it attaches to, so you can check it against what you already pay for.",
      points: [
        {
          title: "Today",
          body: "We run whichever instruments you want on your own numbers. Whatever they find is already ticked on the enquiry.",
        },
        {
          title: "In writing",
          body: "A real person reads it and sends a scoped price. No card, no automated sequence, nothing charged.",
        },
        {
          title: "The founding rate",
          body: "The price you start at is the price you keep, for as long as the upgrade runs.",
        },
        {
          title: FLIGHT_CHECK.label,
          body: "Fly it for 30 days. No lock-in, month to month, and your accounts and data leave with you.",
        },
      ],
    },
  },
  {
    id: "close",
    act: "path",
    eyebrow: "One ask",
    title: "Which gap do you want closed first?",
    minutes: 1,
    body: {
      kind: "title",
      statement:
        "Not which package. Which gap. Name the one that is costing you the most right now and I will price that one thing.",
      strip: [
        `From ${formatCurrency(entryPrice())}/mo`,
        "Month to month",
        "Founding rate locks in",
        FLIGHT_CHECK.label.replace(/^The /, ""),
      ],
    },
  },
];

export const RUNNING_TIME = runningTime(SLIDES);

export function slideById(id: string): Slide | undefined {
  return SLIDES.find((s) => s.id === id);
}

export function slidesInAct(act: ActKey): Slide[] {
  return SLIDES.filter((s) => s.act === act);
}

/** The act label for the rail, resolved rather than repeated. */
export function actLabel(act: ActKey): string {
  return ACTS.find((a) => a.key === act)!.label;
}
