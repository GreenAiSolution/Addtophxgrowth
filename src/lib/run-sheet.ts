/**
 * THE RUN SHEET.
 *
 * What the person presenting says, slide by slide, plus the objection handling
 * and our own economics. This is the routine written down so the second call
 * is the same call every time.
 *
 * WHY IT IS NOT IN THE DECK
 *   Two reasons, and the second one is the important one.
 *
 *   1. Nobody wants a script layered over the slide they are sharing. The run
 *      sheet is printed, or opened on a phone or a second monitor.
 *
 *   2. `INTERNAL_ECONOMICS` is what an account is worth to us. On a Zoom the
 *      presenter is one keystroke from the wrong panel, and a toggle that
 *      reveals our own margin over a shared screen is a mistake waiting for a
 *      bad afternoon. So the stage cannot render this file at all —
 *      `presentation.test.ts` fails the build if the stage imports it.
 *
 * EVERY SLIDE HAS A TRACK
 *   Keyed by slide id, and the test asserts the two sets match exactly in both
 *   directions. A deck that grows a slide nobody scripted is how the routine
 *   stops being a routine.
 */

import {
  UPGRADES,
  BUNDLES,
  FLIGHT_PLANS,
  PARENT_SERVICES,
  OPERATORS,
  bundleSaving,
  bundleMembers,
  entryPrice,
} from "@/lib/upgrades";
import { SLIDES, RUNNING_TIME } from "@/lib/presentation";
import { formatCurrency } from "@/lib/utils";

export interface Track {
  /** What to say. Spoken lines, not bullet points to read aloud verbatim. */
  say: string[];
  /** The one thing that must land before advancing. */
  lands: string;
  /** Optional: what to do with the mouse while talking. */
  action?: string;
}

/**
 * The talk track. Keyed by `Slide.id`.
 *
 * Written in the voice of somebody who has already had one conversation with
 * this person — the cold call — and is now doing the thing they promised on it.
 */
export const TRACKS: Record<string, Track> = {
  open: {
    say: [
      "Thanks for making the time — this is the call I promised you on Tuesday.",
      "Half an hour, and I am going to spend the first two thirds of it describing what already exists rather than selling you anything.",
      "Stop me anywhere. If something is irrelevant to your business, say so and I will skip it — I would rather cut ten slides than talk past you.",
    ],
    lands: "This is a walkthrough, not a pitch meeting, and they control the pace.",
  },
  agenda: {
    say: [
      "Five parts. The first three are so you can judge the fourth.",
      "Nothing gets sold until part four, and there is no close on this call at all.",
      "If you only have fifteen minutes, tell me now and I will jump straight to part three — that is the part that matters.",
    ],
    lands: "They know exactly how long this takes and where the ask lives.",
  },
  recap: {
    say: [
      "On the phone I said two things and I want to repeat them in front of you so you can hold me to them.",
      "First: there are two properties here. One flies your ad account. The other sells only the work that account cannot reach.",
      "Second: the second one will not sell you something the first one already does. That is not a promise, it is a build rule — the catalogue is written against their published bullet lists and the build fails if an upgrade overlaps one.",
    ],
    lands: "The non-duplication guarantee is mechanical, not a salesperson's assurance.",
  },
  "house-map": {
    say: [
      "This is the parent, page by page. I am walking all nine because the gap I eventually sell into only makes sense once you have seen how much is already covered.",
      "Notice what is on their own site: a manifest of scope, a published workflow for every automation loop, and a results page that says the case studies are not up yet.",
      "That last one is the reason I am comfortable doing this walkthrough. They do not overclaim, so I do not have to walk anything back later.",
    ],
    lands: "This is a real operating company with published scope, not a landing page.",
    action: "Have phxgrowth.com open in a second tab in case they want to click something.",
  },
  services: {
    say: [
      `Three services, buyable one at a time. ${PARENT_SERVICES.map((s) => `${s.name} ${s.priceLabel}`).join("; ")}.`,
      "Read the bullet lists rather than my summary — those are their words, and they are the exact lists every upgrade is checked against.",
      "If you are already a client, tell me which of these you are on and I will only show you the upgrades that attach to it.",
    ],
    lands: "They can locate themselves on the board.",
  },
  plans: {
    say: [
      "If you would rather not assemble it yourself, three managed plans sit on top.",
      "The performance fee falls as the spend rises — that is deliberate, and it is charged only on the spend actively managed.",
      `Most accounts sit on ${FLIGHT_PLANS.find((p) => p.badge)?.name ?? FLIGHT_PLANS[1]!.name}. I will use that one in the worked example later.`,
    ],
    lands: "The fee is a share of managed spend, not a fee on their whole business.",
  },
  roster: {
    say: [
      `Ten operators, each with one job. This slide is the single most useful thing in the deck for you, because it is the list I check every upgrade against.`,
      "Four upgrades were cut from our catalogue when this list went into the file — an AI-search one, a map-pack one, a reviews one and a multi-channel inbox one. Herald, Echo and Closer already do all four.",
      "So when I tell you later that nothing I sell duplicates what you pay for, this is the mechanism behind it.",
    ],
    lands: "The crew is more complete than they assumed — and we cut our own products over it.",
  },
  manifest: {
    say: [
      "Twelve numbered items, published, under the heading 'what everything means, in writing'.",
      "Three more of our upgrades died on this list — an offer lab, a tracking rebuild and a conversion lab. All three looked additive until this was sitting next to them.",
      "If you are being pitched by anybody else this quarter, ask them for their version of this page.",
    ],
    lands: "Scope is written down and enforced, which is rare enough to be a differentiator.",
  },
  spine: {
    say: [
      "Four automation loops, and they publish the node chain for every one of them.",
      "Read the first chain: pull each platform, join it to real profit, model marginal return, then an approval gate before anything moves.",
      "That approval gate is the standard everything we sell has to meet too — inspectable node by node, never a black box.",
    ],
    lands: "Automation here is auditable, and there is a human gate on money.",
  },
  launch: {
    say: [
      "Onboarding is one URL and under an hour. No kickoff call, no intake form, no sprint planning.",
      "I am showing you this because it sets your expectation for how fast the upgrades go live too.",
    ],
    lands: "Time-to-value is days, not quarters.",
  },
  flagship: {
    say: [
      "There is a flagship above all of this — a private, engineered build, by application.",
      "I am telling you it exists because if you commission it, anything I sell you later can be engineered into it. I would rather say that now than have you discover it in six months.",
      "It is rationed to a few builds a quarter, which is exactly why the productised counter exists.",
    ],
    lands: "We volunteer the thing that competes with our own catalogue.",
  },
  mechanisms: {
    say: [
      "Here is where the money actually moves. Three mechanisms, and nothing on this slide is a results claim.",
      "One: the same budget, pointed somewhere better every fifteen minutes, ranked on your P&L rather than platform-reported numbers.",
      "Two: more revenue out of each order. Three: more revenue out of each customer.",
      "Everything either property sells is downstream of one of those three. If a product cannot be traced to one, it should not be on the invoice.",
    ],
    lands: "There are only three levers, and every line item maps to one.",
  },
  ceiling: {
    say: [
      "This is the hinge of the whole call, so I am going to slow down.",
      "Every service on the board has a published edge, and these are their words. The desk says outright: we do not make your ads. The crew covers strategy through reputation and stops at the ringing phone. The website work wins the results page and cannot reach the buyer who never sees one.",
      "Put it plainly: the machine buys attention brilliantly and stops at the moment somebody says yes. Everything after that moment — quoting, scheduling, invoicing, chasing, getting them back — is running on somebody's memory.",
      "Ask them: who does that in your business today? Then wait.",
    ],
    lands: "The gap is theirs, named in their own operation, before any product is mentioned.",
    action: "Ask the question and stop talking. This is the longest silence in the call and it is worth it.",
  },
  leak: {
    say: [
      "Rather than argue about it, let us do the arithmetic on your numbers.",
      "Share the tool, not the slide. Five inputs, all theirs — calls a month, share that hit voicemail, what a job is worth, close rate, and the recovery assumption.",
      "Drag the recovery slider down until they believe it. Their sceptical number is more persuasive than my optimistic one.",
      "If it comes out underwater, say so out loud and move on. One instrument that can say 'do not buy this' is what buys the other six their credibility.",
    ],
    lands: "The number is theirs, computed in front of them, with the assumption visible.",
    action: `Switch to the live tool — the Response Clock, module 02 on the instrument deck. Do not present the static slide if the live one is available.`,
  },
  posture: {
    say: [
      "Before I show you a price, the awkward part: we have no case studies for these yet and I am not going to invent any.",
      "Their own results page labels every figure representative and says the case studies are not up. Ours are newer still.",
      "What you get instead is the founding rate — the price you start at is the price you keep — and the same thirty-day flight check as the rest of the account.",
    ],
    lands: "We said the disqualifying thing before they had to ask.",
  },
  "counter-map": {
    say: [
      "Now the counter. Two public pages, an open data endpoint, and the console you log into.",
      "Point at the catalogue endpoint: our own prices published as machine-readable facts. We sell answer-engine visibility; it would be absurd to hide our own.",
    ],
    lands: "The upgrade counter is a real property with a contract and a console behind it.",
  },
  instruments: {
    say: [
      "Seven tools, free, nothing to sign up for, and everything typed stays in their tab.",
      "One of them concludes that the parent already does the job and offers nothing to buy. That one is deliberate.",
      "Offer to run any of them live now.",
    ],
    lands: "The diagnostic is not rigged to diagnose whatever we sell.",
  },
  upgrades: {
    say: [
      `${UPGRADES.length} upgrades, ordered most expensive first inside each service so the first price they read is the highest one.`,
      "Do not read the list aloud. Ask which one line jumps out, and talk about that one only.",
      "Every one names the service it bolts onto and is priced below that service — an upgrade that costs more than the thing it upgrades is a repositioning, not an upgrade.",
    ],
    lands: "They pick the gap themselves rather than being walked through a menu.",
    action: "Let them choose. The slide is a menu, not a script.",
  },
  bundles: {
    say: [
      `${BUNDLES.length} stacks, each cheaper than its parts, and the saving is on the slide.`,
      "The argument is the compounding, not the discount: a voice operator with nothing grading its transcripts is a script; structured facts on your site with nobody earning third-party mentions is uncorroborated.",
      "Most accounts do not start here. I am showing it so the ceiling is visible.",
    ],
    lands: "The stacks exist for a reason other than a bigger invoice.",
  },
  console: {
    say: [
      "This is the part most agencies do not have: the upgrades are not a monthly PDF, they run on a surface you log into.",
      "Point at the Queue. Anything that moves money — a quote going out, an invoice raised, a chase sent — waits there until you release it, and every release is recorded against your name.",
    ],
    lands: "They keep the controls. Automation does not mean unsupervised.",
  },
  worked: {
    say: [
      "Here is the whole thing priced with nothing hidden, at the ceiling rather than the recommendation.",
      "The plan, the performance fee at an example spend, and every upgrade stacked.",
      `Then bring it straight back down: most accounts start at ${formatCurrency(entryPrice())} a month with one upgrade, month to month.`,
      "Say it plainly: I do not think you should buy all of this, and I am showing you the top of the range so you know there is nothing behind it.",
    ],
    lands: "There is no hidden tier and no surprise at contract stage.",
  },
  questions: {
    say: [
      "The five things everybody asks. I would rather answer them before you have to.",
      "The important one is the last: no, we do not have case studies, and the founding rate is what we offer instead.",
    ],
    lands: "Nothing awkward is left for them to discover after the call.",
  },
  next: {
    say: [
      "Nothing is charged today and I am not taking a card.",
      "You name the gap. I send a scoped price in writing, written against the bullet list of the service it attaches to, so you can check it against what you already pay for.",
      "Then thirty days. If it has not shipped work that moves your numbers, we make it right or part as friends, and your accounts and data leave with you.",
    ],
    lands: "The next step is small, reversible, and in writing.",
  },
  close: {
    say: [
      "One ask, and it is not which package.",
      "Which gap is costing you the most right now? Name it and I will price that one thing.",
      "Then stop talking.",
    ],
    lands: "One named gap, and permission to send a price for it.",
    action: "Ask the question. Do not fill the silence.",
  },
};

/* ── Objection handling ─────────────────────────────────────────────────── */

export const OBJECTIONS: { objection: string; answer: string }[] = [
  {
    objection: "This is more than we spend on the ads themselves.",
    answer:
      `Then start at the bottom. ${formatCurrency(entryPrice())} a month, one upgrade, month to month, cancel ahead of any renewal. The stacked price exists so you can see the ceiling, not because I think you should buy it. And if the arithmetic on your own numbers does not cover it, I will say so on the call — the leak tool is allowed to come out underwater.`,
  },
  {
    objection: "We already pay for something that does this.",
    answer:
      "Tell me which one and I will cut it from the quote on the call. Every upgrade is written against the published bullet list of the service it attaches to, and anything already included is out of scope by construction — but if you think you are being sold something twice, you are right until proven otherwise.",
  },
  {
    objection: "Send me a deck and I will look at it.",
    answer:
      "I will send the price in writing today. But the useful part of this is not the deck, it is running the tools on your numbers — that takes four minutes and it is the only part that is about your business rather than mine.",
  },
  {
    objection: "How do I know any of this works? You have no case studies.",
    answer:
      "You do not, and I am not going to pretend otherwise — I said that before I showed you a price, not after you asked. What is on offer is the founding rate, the thirty-day flight check, month to month with no lock-in, and your data leaving with you if you go. That is the whole of my answer.",
  },
  {
    objection: "We want the custom build, not the productised version.",
    answer:
      "Then I will get you in front of the flagship conversation, and I will say plainly that it is by application and rationed to a few builds a quarter. If the timing does not work, the counter is the productised route to the same gaps and it can be replaced by the build later.",
  },
  {
    objection: "I need to talk to my partner / the board.",
    answer:
      "Good — that is what the written price is for. It states the scope against the service's own bullet list, so somebody who was not on this call can check it against your existing invoice without me in the room.",
  },
  {
    objection: "Can you do it cheaper?",
    answer:
      `Not on the rate, and here is why that is in your favour: the founding rate means the price you start at is the price you keep. What I can do is scope down — take one upgrade instead of a stack, or take the stack and lose ${formatCurrency(bundleSaving(BUNDLES.find((b) => b.apex)!))} a month against buying them separately.`,
  },
  {
    objection: "We are not running ads yet.",
    answer:
      "Then the upgrade counter is not for you yet — every upgrade bolts onto a service that has to already be running. Start with the parent, get the account flying, and come back. I would rather tell you that than take the order.",
  },
];

/* ── Our side of the table ──────────────────────────────────────────────── */

/**
 * INTERNAL. Never rendered on the stage — see the note at the top of the file.
 *
 * Deliberately arithmetic only. There is no margin figure here, no delivery
 * cost and no close-rate assumption, because we do not have honest ones and
 * this repository has a rule about inventing numbers that applies to our own
 * planning documents as much as it applies to the page.
 */
export const INTERNAL_ECONOMICS = {
  headline: "What the routine is worth, in arithmetic we can actually stand behind.",
  rungs: [
    {
      rung: "Entry",
      what: `One upgrade — cheapest on the board is ${formatCurrency(entryPrice())}/mo`,
      monthly: formatCurrency(entryPrice()),
      annual: formatCurrency(entryPrice() * 12),
      note: "The rung to aim for on call two. Small, reversible, and it starts the relationship on a real surface rather than a proposal.",
    },
    ...BUNDLES.map((b) => ({
      rung: b.apex ? "Apex stack" : "Stack",
      what: `${b.name} — ${bundleMembers(b)
        .map((u) => u.name)
        .join(", ")}`,
      monthly: formatCurrency(b.price),
      annual: formatCurrency(b.price * 12),
      note: `${formatCurrency(bundleSaving(b))}/mo below the à la carte sum of ${formatCurrency(
        bundleMembers(b).reduce((n, u) => n + u.price, 0),
      )}. The saving is the incentive; the compounding is the argument.`,
    })),
  ],
  /** Which upgrade to lead with, read off the catalogue rather than chosen by mood. */
  leadWith: UPGRADES.filter((u) => u.leading).map((u) => ({
    service: PARENT_SERVICES.find((s) => s.key === u.attachesTo)!.name,
    upgrade: u.name,
    price: `${formatCurrency(u.price)}/mo`,
    why: u.fixes,
  })),
  /** The fee ladder, so nobody quotes the wrong rate on a live call. */
  feeLadder: FLIGHT_PLANS.map((p) => ({
    plan: p.name,
    retainer: p.price,
    fee: p.fee,
    ceiling: p.ceilingNote,
  })),
  rules: [
    "Never quote a percentage that is not one of the parent's own fee rates. There are three and they are on the fee ladder above.",
    "Never quote a result, a multiple or a case study. We do not have one. The founding rate is the answer to that question, and it is a better one.",
    `Never sell an upgrade to a non-client. All ${UPGRADES.length} bolt onto a service that has to already be flying — say so and send them to the parent.`,
    `Never cut the rate. Scope down instead: one upgrade, or a stack at its published saving.`,
    "If an instrument comes out underwater on their numbers, say it on the call. That is the whole reason the other six are believed.",
    `If they name something on the roster (${OPERATORS.map((o) => o.name).join(", ")}) that already covers the gap, cut it from the quote there and then.`,
  ],
  timing: {
    slides: SLIDES.length,
    minutes: RUNNING_TIME,
    note: "Plus four to six minutes of live tool time inside the leak slide. Budget forty-five, aim to hand back fifteen.",
  },
} as const;
