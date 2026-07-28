/**
 * The legal set — Terms of Service, Privacy Policy, and the Master Services
 * Agreement.
 *
 * DIRECTION
 *   The login page said "By continuing you agree to the terms" and there were
 *   no terms. Stripe requires published Terms and a Privacy Policy before it
 *   will approve an account, and nobody should be billed $6,997/mo against a
 *   handshake. These are written against what this platform actually sells —
 *   the real upgrades, the real prices, the real sub-processors — rather than
 *   being a generic template with the business name swapped in.
 *
 * BLUEPRINTS
 *   Documents are structured data, not JSX, so all three render through one
 *   component and the sub-processor list can be derived rather than duplicated.
 *   `legal.test.ts` asserts the prices quoted in the MSA match the catalogue,
 *   because a fee schedule that drifts from the pricing page is the single
 *   worst kind of stale content on a site that takes money.
 *
 * WHAT CHANGED, AND WHY IT MATTERED
 *   These documents were written for an earlier version of this business and
 *   were never revisited when the site was rebuilt. They described "two lines
 *   of service: AI Automation Agents and Ad Operations Management", and their
 *   fee table listed six plans from $1,297 to $7,997 a month.
 *
 *   None of that is what this site sells, and none of those prices appear
 *   anywhere a visitor can see. So a prospect who clicked "Terms" in the
 *   footer — from a page offering five upgrades between $1,600 and $4,200 —
 *   was reading a contract for a different company. They also contradicted the
 *   page's own FAQ outright: the FAQ says upgrades land on your existing
 *   PHX/GROWTH invoice with no second account, and section 3 said subscriptions
 *   were billed here through Stripe.
 *
 *   The commercial sections now describe the upgrades business and generate
 *   their fee table from `UPGRADES` and `BUNDLES`, so the contract and the page
 *   cannot say different numbers. Everything non-commercial — privacy,
 *   sub-processors, liability, governing law — is unchanged.
 *
 * IMPORTANT
 *   This is a careful, specific draft — not legal advice. It should be reviewed
 *   by a lawyer licensed in Arizona before it is relied on. Where a real
 *   decision was needed (governing law, notice periods, liability cap) the
 *   choice is stated plainly so a reviewer can see and change it.
 */

import { BRAND } from "@/lib/brand";
import { formatCurrency } from "@/lib/utils";
import {
  UPGRADES,
  BUNDLES,
  PARENT_SERVICES,
  FLIGHT_CHECK,
  bundleMembers,
} from "@/lib/upgrades";

/** Bump when the substance changes. Shown at the top of every document. */
export const LEGAL_LAST_UPDATED = "27 July 2026";

/** The jurisdiction chosen. Called out so a reviewer can see and change it. */
export const GOVERNING_LAW = "the State of Arizona, United States";

export interface LegalSection {
  heading: string;
  /** Paragraphs. Rendered in order. */
  body: string[];
  /** Optional bullet list rendered after the paragraphs. */
  bullets?: string[];
}

export interface LegalDocument {
  slug: "terms" | "privacy" | "msa";
  title: string;
  /** One line under the title explaining who it is for. */
  summary: string;
  sections: LegalSection[];
}

/**
 * Every third party that touches client data. Kept here rather than prose so
 * the privacy policy can never quietly fall behind the stack.
 */
export const SUB_PROCESSORS: { name: string; purpose: string; data: string }[] = [
  { name: "Vercel", purpose: "Application hosting", data: "All request data in transit" },
  { name: "Neon (PostgreSQL)", purpose: "Primary database", data: "Account, client, lead and metric records" },
  { name: "Anthropic", purpose: "AI agent responses", data: "The content you submit to an agent, plus your saved brand voice and qualification rules" },
  { name: "Stripe", purpose: "Payments and subscriptions", data: "Billing name, email, and payment method (we never see or store card numbers)" },
  { name: "Resend", purpose: "Transactional email", data: "Recipient address and message content" },
  { name: "Zapier", purpose: "Optional outbound automation, only if you enable it", data: "Whatever the connected event contains" },
];

/** The parent's services, named the way the contract has to name them. */
function serviceList(): string {
  const names = PARENT_SERVICES.map((s) => s.name);
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/**
 * Fee table lines, generated from the catalogue so they cannot drift.
 *
 * Reads `UPGRADES` and `BUNDLES` — the same arrays the page renders from — so
 * a price change moves the contract in the same commit. This used to read a
 * separate plan list, which is how the MSA ended up quoting six monthly fees
 * that appeared nowhere a visitor could see.
 */
export function feeSchedule(): string[] {
  return [
    ...UPGRADES.map(
      (u) =>
        `${u.name} — ${formatCurrency(u.price)}` +
        (u.billing === "monthly" ? " per month" : ", billed once"),
    ),
    ...BUNDLES.map(
      (b) =>
        `${b.name} (${bundleMembers(b)
          .map((u) => u.name)
          .join(" + ")}) — ${formatCurrency(b.price)} per month`,
    ),
  ];
}

// ---------------------------------------------------------------------------
// Terms of Service
// ---------------------------------------------------------------------------

const TERMS: LegalDocument = {
  slug: "terms",
  title: "Terms of Service",
  summary: `The rules for using ${BRAND.name}. If you buy an upgrade, the Master Services Agreement also applies and takes precedence where the two differ.`,
  sections: [
    {
      heading: "Who we are and what this covers",
      body: [
        `${BRAND.name} ("we", "us") is the upgrade counter for ${BRAND.parent.name} (${BRAND.parent.url}). We sell specialised upgrades that bolt onto a ${BRAND.parent.name} service you already buy — ${serviceList()}. We do not sell those underlying services here; they are bought from ${BRAND.parent.name} directly.`,
        `These Terms govern your use of this website and, where you are given one, the client platform. By sending an enquiry, creating an account or using any part of the platform, you agree to them. If you are agreeing on behalf of a company, you confirm you have authority to bind it.`,
      ],
    },
    {
      heading: "Enquiries are not orders",
      body: [
        `Sending an enquiry through this site costs nothing and commits you to nothing. It is a request for a written scope and price. No payment method is collected, nothing is charged, and nothing on your ${BRAND.parent.name} account changes.`,
        `An upgrade begins only when you have agreed a written scope with us. Until then there is no contract for the work.`,
      ],
    },
    {
      heading: "Accounts",
      body: [
        `You are responsible for everything that happens under your account, including keeping your sign-in method and your lead-intake token secret. Tell us immediately if you believe either has been compromised and we will rotate it.`,
        `Accounts are for one business. Sharing access across separate businesses requires separate agreements.`,
      ],
    },
    {
      heading: "Fees and billing",
      body: [
        `Every upgrade requires an active ${BRAND.parent.name} service to attach to. Upgrade fees are added to your existing ${BRAND.parent.name} invoice — there is no second account to set up here and no separate payment method to give us.`,
        `Monthly upgrades bill monthly in advance. One-time builds bill once, up front, and the result is yours. Our current fees are set out below and are the same figures published on this site. Prices are in US dollars and exclude any applicable tax.`,
        `Upgrade fees are flat. They do not change the performance fee ${BRAND.parent.name} charges on managed ad spend, which is calculated separately and is not affected by anything bought here.`,
      ],
      bullets: feeSchedule(),
    },
    {
      heading: "The founding rate",
      body: [
        `Where we offer a founding rate, the price you start at is the price you keep for as long as that upgrade runs continuously. If you cancel an upgrade and later restart it, it restarts at the then-current price.`,
      ],
    },
    {
      heading: `${FLIGHT_CHECK.label}`,
      body: [
        FLIGHT_CHECK.body,
        `This is the same guarantee that covers the rest of your ${BRAND.parent.name} account. It is deliberately not a different one, so there is never a question of which applies to what.`,
      ],
    },
    {
      heading: "Ad spend is separate",
      body: [
        `Our fees do not include your advertising spend. You pay the advertising platforms — Meta, Google and any others — directly, on your own payment methods, under your own accounts. We never take custody of your ad budget.`,
        `You are responsible for the spend committed on your accounts, including spend that occurs while a campaign is live. We will alert you to pacing problems through the Spend Watch on plans that include it, but the budget and its consequences remain yours.`,
      ],
    },
    {
      heading: "Cancellation",
      body: [
        `Subscriptions are month to month. You can cancel at any time from your billing page, effective at the end of the current billing period. There is no cancellation fee and no notice period.`,
        `We do not refund partial months. Your access continues until the period you have paid for ends.`,
        `We may suspend or end an account for non-payment, for use that breaks the law or an advertising platform's policies, or for abuse of our team. Where we can, we will tell you first and give you a chance to fix it.`,
      ],
    },
    {
      heading: "AI-generated output",
      body: [
        `Our agents produce drafts. Scores, ad copy, follow-up sequences, CRM records and rebuttals are all suggestions for a human to review, and they can be wrong, out of date, or unsuitable for your situation.`,
        `You are responsible for reviewing anything an agent produces before you send it to a customer, publish it, or act on it. Do not use agent output for legal, medical, financial or regulated advice.`,
        `Do not submit information to an agent that you are not permitted to share with a third-party AI provider — see the Privacy Policy for who processes it.`,
      ],
    },
    {
      heading: "No guarantee of results",
      body: [
        `We do not guarantee any particular level of leads, cost per lead, return on ad spend, revenue or growth. Advertising results depend on your offer, your market, your pricing, your sales follow-through and the advertising platforms themselves — most of which are outside our control.`,
        `Any figures shown on our website, in a calculator, or in a proposal are illustrative estimates based on inputs you provide. They are not a promise, a projection you should rely on, or part of this agreement.`,
      ],
    },
    {
      heading: "Your content and your data",
      body: [
        `You keep ownership of everything you put into the platform: your leads, your metrics, your brand voice, your documents and your ad accounts. You grant us the licence we need to host and process it in order to provide the service.`,
        `We keep ownership of the platform itself, including our agent prompts, system blueprints, industry packs and the software. The documents we deliver to you as part of a plan — your qualification rubric, escalation matrix, brand voice profile, testing framework and naming convention — are yours to keep and use after the engagement ends.`,
      ],
    },
    {
      heading: "Ad account ownership",
      body: [
        `Where we work in your advertising accounts, those accounts remain yours. We operate under access you grant and you can revoke it at any time.`,
        `If we create an asset inside your account — a campaign structure, an audience, a naming convention — it stays in your account and remains yours when the engagement ends. We do not hold accounts hostage.`,
      ],
    },
    {
      heading: "Limitation of liability",
      body: [
        `To the fullest extent the law allows, neither party is liable to the other for indirect, incidental, special or consequential damages, or for lost profits, lost revenue or lost data.`,
        `Our total liability arising out of or relating to the service is limited to the fees you paid us in the three months before the event giving rise to the claim. Nothing here limits liability that cannot be limited by law, including for fraud.`,
      ],
    },
    {
      heading: "Changes to these terms",
      body: [
        `We may update these Terms. If a change materially affects you, we will tell you by email at least 30 days before it takes effect, and you may cancel before then if you disagree. The date at the top of this page shows when it last changed.`,
      ],
    },
    {
      heading: "Governing law",
      body: [
        `These Terms are governed by the laws of ${GOVERNING_LAW}, without regard to conflict-of-law rules. Both parties agree to the exclusive jurisdiction of the state and federal courts located in Maricopa County, Arizona.`,
      ],
    },
    {
      heading: "Contact",
      body: [`Questions about these Terms: ${BRAND.notifyEmail}.`],
    },
  ],
};

// ---------------------------------------------------------------------------
// Privacy Policy
// ---------------------------------------------------------------------------

const PRIVACY: LegalDocument = {
  slug: "privacy",
  title: "Privacy Policy",
  summary: `What we collect, why we collect it, and who else touches it. Written to be read rather than to be defensible.`,
  sections: [
    {
      heading: "What we collect",
      body: [`Three kinds of information:`],
      bullets: [
        "Account information — your name, email, business name, website, industry and the sign-in method you use.",
        "Business information you give us — your brand voice, qualification rules, offer details, targets, and the ad account and CRM details needed to do the work.",
        "Operating data — the leads delivered to your intake endpoint, the conversations you have with agents, the daily advertising metrics for your accounts, and the outcomes you log when a deal is won or lost.",
      ],
    },
    {
      heading: "Leads and other people's personal information",
      body: [
        `When you send us leads, you are sending us personal information about other people. You are the controller of that information and we process it on your instructions. You are responsible for having a lawful basis to collect and share it, and for your own privacy notice to the people concerned.`,
        `We use it only to provide the service to you: scoring, follow-up drafting, CRM structuring, and the reporting you see in your console. We do not sell it, and we do not use it to train any AI model.`,
      ],
    },
    {
      heading: "Why we process it",
      body: [
        `To provide the service you have subscribed to, to bill you, to notify you about things that need your attention, to support you when you ask, and to keep the platform secure and working. That is the whole list.`,
      ],
    },
    {
      heading: "Who else processes it",
      body: [
        `We use a small number of sub-processors. Each one is here because the product needs it, and each receives only what that job requires:`,
      ],
      bullets: SUB_PROCESSORS.map((s) => `${s.name} — ${s.purpose}. Receives: ${s.data.toLowerCase()}.`),
    },
    {
      heading: "AI processing specifically",
      body: [
        `Content you submit to an agent is sent to Anthropic to generate a response, along with your saved brand voice and qualification rules so the answer sounds like you. Under our agreement with Anthropic this content is not used to train their models.`,
        `If there is information you would rather not send to a third-party AI provider, do not put it in an agent prompt or a lead form field.`,
      ],
    },
    {
      heading: "How long we keep it",
      body: [
        `While your account is active, and for 90 days after it closes so that you can ask for an export or change your mind. After that we delete client data, except records we are required to keep for tax and accounting — typically invoices, for seven years.`,
        `You can ask us to delete specific data sooner and we will, unless we are required to keep it.`,
      ],
    },
    {
      heading: "Your rights",
      body: [
        `You can ask us for a copy of your data, ask us to correct it, or ask us to delete it. Email ${BRAND.notifyEmail} and we will respond within 30 days.`,
        `If you are in a jurisdiction with specific privacy rights — for example California under the CCPA, or the EU and UK under the GDPR — those rights apply and we will honour them. We do not sell personal information as those laws define selling.`,
      ],
    },
    {
      heading: "Security",
      body: [
        `Data is encrypted in transit. Access to production data is limited to people who need it to run the service. Each client's data is scoped to their own account throughout the platform, and your lead-intake token is the credential that protects your intake endpoint — treat it like a password and ask us to rotate it if it is ever exposed.`,
        `No system is perfectly secure. If a breach affects your data we will tell you promptly and tell you what we know.`,
      ],
    },
    {
      heading: "Cookies",
      body: [
        `We use a session cookie to keep you signed in. We do not use advertising cookies or third-party trackers on our own site.`,
      ],
    },
    {
      heading: "Children",
      body: [`This is a service for businesses. It is not directed at anyone under 18 and we do not knowingly collect their information.`],
    },
    {
      heading: "Changes and contact",
      body: [
        `If we change this policy materially we will email you before it takes effect. The date at the top shows when it last changed.`,
        `Questions, requests, or anything that looks wrong: ${BRAND.notifyEmail}.`,
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Master Services Agreement
// ---------------------------------------------------------------------------

const MSA: LegalDocument = {
  slug: "msa",
  title: "Master Services Agreement",
  summary: `The agreement that governs a paid engagement. It sits on top of the Terms of Service and wins wherever the two differ.`,
  sections: [
    {
      heading: "Structure",
      body: [
        `This agreement is between ${BRAND.name} and the business named on the agreed scope ("Client"). It takes effect on the date the first upgrade begins and continues until every upgrade under it has ended.`,
        `The upgrade Client buys defines the scope. Each upgrade's deliverables are published on this site under "What lands" and are incorporated into this agreement by reference — what that list says is delivered, is what is owed.`,
      ],
    },
    {
      heading: "What an upgrade is, and what it is not",
      body: [
        `Every upgrade attaches to a ${BRAND.parent.name} service Client already buys — ${serviceList()}. Client must hold that underlying service for the upgrade to run; if it lapses, the upgrade attached to it pauses with it.`,
        `An upgrade is additional work. It is written against the published inclusions of the service it attaches to, and anything already covered by that service is out of scope here by construction. Client is never billed twice for the same work. If Client believes an upgrade duplicates something already being paid for, Client should say so and we will remove it from scope.`,
        `Bundles (${BUNDLES.map((b) => b.name).join(", ")}) are single monthly engagements covering the upgrades named in them, priced as one line rather than as the sum of their parts.`,
      ],
    },
    {
      heading: "Delivery",
      body: [
        `Monthly upgrades run continuously and are delivered on the cadence described for that upgrade. One-time builds are delivered once and the result belongs to Client.`,
        `We aim to have a new upgrade live within 30 days of Client providing the access and information we ask for. Delays caused by outstanding access or unanswered questions extend that period by the same amount.`,
      ],
    },
    {
      heading: "What Client provides",
      body: [
        `The engagement depends on Client supplying, promptly:`,
      ],
      bullets: [
        "Administrative access to the advertising accounts in scope",
        "Access to the CRM or the destination where leads should land",
        "Accurate details of the offer, pricing, service area and qualification bar",
        "A named person authorised to approve creative and answer questions",
        "Any brand assets, disclaimers or compliance requirements that apply",
      ],
    },
    {
      heading: "Fees and payment",
      body: [
        `Fees are as published on this site and as listed on the agreed scope. Upgrade fees are added to Client's existing ${BRAND.parent.name} invoice; monthly upgrades bill monthly in advance and one-time builds bill once, up front.`,
        `Upgrade fees are flat and sit outside the performance fee ${BRAND.parent.name} charges on managed ad spend. Nothing bought here changes that percentage.`,
        `If a payment fails we will retry and notify Client. If an invoice remains unpaid 14 days after it was due we may suspend the upgrade until it is settled.`,
        `We may change published prices with 30 days' written notice. Any change takes effect at Client's next renewal, and Client may cancel before it applies. Where Client holds a founding rate, that rate is held for as long as the upgrade runs continuously.`,
      ],
      bullets: feeSchedule(),
    },
    {
      heading: "Term and termination",
      body: [
        `Month to month. Either party may end an upgrade at any time, effective at the end of the current billing period. ${FLIGHT_CHECK.label} applies for the first 30 days.`,
        `On termination we will, at Client's request within 90 days: remove our access from Client's advertising accounts, hand over the documents delivered under the plan, and provide an export of Client's data held in the platform.`,
        `We do not withhold access to Client's own advertising accounts, campaigns or data at any point, including during a dispute over fees.`,
      ],
    },
    {
      heading: "Confidentiality",
      body: [
        `Each party will keep the other's non-public information confidential and use it only to perform this agreement. That obligation survives termination by three years.`,
        `We may describe the engagement in general terms as a case study only with Client's written permission, and will not disclose specific figures without it.`,
      ],
    },
    {
      heading: "Intellectual property",
      body: [
        `Client owns its brand, its data, its advertising accounts and everything created specifically for it: campaigns, creative, the qualification rubric, escalation matrix, brand voice profile, testing framework and naming convention.`,
        `We own the platform, our agent prompts, our system blueprints and our industry packs. Nothing in this agreement transfers those, and Client's licence to use them ends when the upgrade does.`,
      ],
    },
    {
      heading: "Performance and results",
      body: [
        `We commit to performing the work described for the tier with reasonable skill and care. We do not commit to any specific business result. Section 8 of the Terms of Service applies in full and Client should read it before signing.`,
        `Where we set a target — a cost per lead, a cost per sale, a return on ad spend — it is a target we are working toward and a threshold our monitoring measures against. It is not a warranty.`,
      ],
    },
    {
      heading: "Compliance",
      body: [
        `Client is responsible for the legality of what it advertises, for any licensing its trade requires, and for claims made about its own products and services. We will not knowingly run advertising that breaches a platform's policies or the law, and may decline or pause work that does.`,
        `In regulated trades — medical, legal, financial — Client is responsible for ensuring output meets its regulatory obligations before it is published or sent.`,
      ],
    },
    {
      heading: "General",
      body: [
        `Neither party may assign this agreement without the other's consent, except to a successor of its business. Notices go to the email addresses on the account. If any provision is unenforceable, the rest stands.`,
        `This agreement, together with the Terms of Service, the Privacy Policy and the published description of each upgrade in scope, is the entire agreement between the parties.`,
        `Governed by the laws of ${GOVERNING_LAW}.`,
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS: LegalDocument[] = [TERMS, PRIVACY, MSA];

export function legalBySlug(slug: string): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((d) => d.slug === slug);
}
