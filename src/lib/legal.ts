/**
 * The legal set — Terms of Service, Privacy Policy, and the Master Services
 * Agreement.
 *
 * DIRECTION
 *   The login page said "By continuing you agree to the terms" and there were
 *   no terms. Stripe requires published Terms and a Privacy Policy before it
 *   will approve an account, and nobody should be billed $6,997/mo against a
 *   handshake. These are written against what this platform actually sells —
 *   the real tiers, the real build fees, the real sub-processors — rather than
 *   being a generic template with the business name swapped in.
 *
 * BLUEPRINTS
 *   Documents are structured data, not JSX, so all three render through one
 *   component and the sub-processor list can be derived rather than duplicated.
 *   `legal.test.ts` asserts the prices quoted in the MSA match `catalog.ts`,
 *   because a fee schedule that drifts from the pricing page is the single
 *   worst kind of stale content on a site that takes money.
 *
 * IMPORTANT
 *   This is a careful, specific draft — not legal advice. It should be reviewed
 *   by a lawyer licensed in Arizona before it is relied on. Where a real
 *   decision was needed (governing law, notice periods, liability cap) the
 *   choice is stated plainly so a reviewer can see and change it.
 */

import { PLANS } from "@/lib/catalog";
import { BRAND } from "@/lib/brand";
import { formatCurrency } from "@/lib/utils";

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

function agentTiers() {
  return PLANS.filter((p) => p.line === "AI_AGENTS");
}
function adOpsTiers() {
  return PLANS.filter((p) => p.line === "AD_OPS");
}

/** Fee table lines, generated from the catalog so they cannot drift. */
export function feeSchedule(): string[] {
  return PLANS.map(
    (p) =>
      `${p.name} — ${formatCurrency(p.priceMonthly)} per month` +
      (p.setupFee ? `, plus a one-time build fee of ${formatCurrency(p.setupFee)}` : ""),
  );
}

// ---------------------------------------------------------------------------
// Terms of Service
// ---------------------------------------------------------------------------

const TERMS: LegalDocument = {
  slug: "terms",
  title: "Terms of Service",
  summary: `The rules for using ${BRAND.name}. If you subscribe to a plan, the Master Services Agreement also applies and takes precedence where the two differ.`,
  sections: [
    {
      heading: "1. Who we are and what this covers",
      body: [
        `${BRAND.name} ("we", "us") provides two lines of service: AI Automation Agents, which are software agents you operate through our platform, and Ad Operations Management, which is a managed service performed by our team. These Terms govern your use of our website and platform.`,
        `By creating an account, configuring a cockpit, or using any part of the platform, you agree to these Terms. If you are agreeing on behalf of a company, you confirm you have authority to bind it.`,
      ],
    },
    {
      heading: "2. Accounts",
      body: [
        `You are responsible for everything that happens under your account, including keeping your sign-in method and your lead-intake token secret. Tell us immediately if you believe either has been compromised and we will rotate it.`,
        `Accounts are for one business. Sharing access across separate businesses requires a separate subscription for each.`,
      ],
    },
    {
      heading: "3. Subscriptions, fees and billing",
      body: [
        `Subscriptions are billed monthly in advance through Stripe. Plans on the AI Automation Agents line and the Ad Operations Management line are separate subscriptions and are billed separately.`,
        `Our current fees are set out below and are also published on the pricing page. Prices are in US dollars and exclude any applicable tax.`,
      ],
      bullets: feeSchedule(),
    },
    {
      heading: "4. The one-time build fee",
      body: [
        `Plans that include a build fee charge it once, on your first invoice, alongside your first month. It covers the onboarding work described in the Master Services Agreement — the account audit, tracking repair, prompt tuning, integration mapping and supervised pilot appropriate to your tier.`,
        `The build fee is charged once per product line. If you later change tiers on that line, you are not charged it again.`,
        `Because the build is delivered as labour in the first weeks of the engagement, the build fee is non-refundable once that work has begun. If you cancel before any build work starts, we will refund it in full.`,
      ],
    },
    {
      heading: "5. Ad spend is separate",
      body: [
        `Our fees do not include your advertising spend. You pay the advertising platforms — Meta, Google and any others — directly, on your own payment methods, under your own accounts. We never take custody of your ad budget.`,
        `You are responsible for the spend committed on your accounts, including spend that occurs while a campaign is live. We will alert you to pacing problems through the Spend Watch on plans that include it, but the budget and its consequences remain yours.`,
      ],
    },
    {
      heading: "6. Cancellation",
      body: [
        `Subscriptions are month to month. You can cancel at any time from your billing page, effective at the end of the current billing period. There is no cancellation fee and no notice period.`,
        `We do not refund partial months. Your access continues until the period you have paid for ends.`,
        `We may suspend or end an account for non-payment, for use that breaks the law or an advertising platform's policies, or for abuse of our team. Where we can, we will tell you first and give you a chance to fix it.`,
      ],
    },
    {
      heading: "7. AI-generated output",
      body: [
        `Our agents produce drafts. Scores, ad copy, follow-up sequences, CRM records and rebuttals are all suggestions for a human to review, and they can be wrong, out of date, or unsuitable for your situation.`,
        `You are responsible for reviewing anything an agent produces before you send it to a customer, publish it, or act on it. Do not use agent output for legal, medical, financial or regulated advice.`,
        `Do not submit information to an agent that you are not permitted to share with a third-party AI provider — see the Privacy Policy for who processes it.`,
      ],
    },
    {
      heading: "8. No guarantee of results",
      body: [
        `We do not guarantee any particular level of leads, cost per lead, return on ad spend, revenue or growth. Advertising results depend on your offer, your market, your pricing, your sales follow-through and the advertising platforms themselves — most of which are outside our control.`,
        `Any figures shown on our website, in a calculator, or in a proposal are illustrative estimates based on inputs you provide. They are not a promise, a projection you should rely on, or part of this agreement.`,
      ],
    },
    {
      heading: "9. Your content and your data",
      body: [
        `You keep ownership of everything you put into the platform: your leads, your metrics, your brand voice, your documents and your ad accounts. You grant us the licence we need to host and process it in order to provide the service.`,
        `We keep ownership of the platform itself, including our agent prompts, system blueprints, industry packs and the software. The documents we deliver to you as part of a plan — your qualification rubric, escalation matrix, brand voice profile, testing framework and naming convention — are yours to keep and use after the engagement ends.`,
      ],
    },
    {
      heading: "10. Ad account ownership",
      body: [
        `Where we work in your advertising accounts, those accounts remain yours. We operate under access you grant and you can revoke it at any time.`,
        `If we create an asset inside your account — a campaign structure, an audience, a naming convention — it stays in your account and remains yours when the engagement ends. We do not hold accounts hostage.`,
      ],
    },
    {
      heading: "11. Limitation of liability",
      body: [
        `To the fullest extent the law allows, neither party is liable to the other for indirect, incidental, special or consequential damages, or for lost profits, lost revenue or lost data.`,
        `Our total liability arising out of or relating to the service is limited to the fees you paid us in the three months before the event giving rise to the claim. Nothing here limits liability that cannot be limited by law, including for fraud.`,
      ],
    },
    {
      heading: "12. Changes to these terms",
      body: [
        `We may update these Terms. If a change materially affects you, we will tell you by email at least 30 days before it takes effect, and you may cancel before then if you disagree. The date at the top of this page shows when it last changed.`,
      ],
    },
    {
      heading: "13. Governing law",
      body: [
        `These Terms are governed by the laws of ${GOVERNING_LAW}, without regard to conflict-of-law rules. Both parties agree to the exclusive jurisdiction of the state and federal courts located in Maricopa County, Arizona.`,
      ],
    },
    {
      heading: "14. Contact",
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
      heading: "1. What we collect",
      body: [`Three kinds of information:`],
      bullets: [
        "Account information — your name, email, business name, website, industry and the sign-in method you use.",
        "Business information you give us — your brand voice, qualification rules, offer details, targets, and the ad account and CRM details needed to do the work.",
        "Operating data — the leads delivered to your intake endpoint, the conversations you have with agents, the daily advertising metrics for your accounts, and the outcomes you log when a deal is won or lost.",
      ],
    },
    {
      heading: "2. Leads and other people's personal information",
      body: [
        `When you send us leads, you are sending us personal information about other people. You are the controller of that information and we process it on your instructions. You are responsible for having a lawful basis to collect and share it, and for your own privacy notice to the people concerned.`,
        `We use it only to provide the service to you: scoring, follow-up drafting, CRM structuring, and the reporting you see in your console. We do not sell it, and we do not use it to train any AI model.`,
      ],
    },
    {
      heading: "3. Why we process it",
      body: [
        `To provide the service you have subscribed to, to bill you, to notify you about things that need your attention, to support you when you ask, and to keep the platform secure and working. That is the whole list.`,
      ],
    },
    {
      heading: "4. Who else processes it",
      body: [
        `We use a small number of sub-processors. Each one is here because the product needs it, and each receives only what that job requires:`,
      ],
      bullets: SUB_PROCESSORS.map((s) => `${s.name} — ${s.purpose}. Receives: ${s.data.toLowerCase()}.`),
    },
    {
      heading: "5. AI processing specifically",
      body: [
        `Content you submit to an agent is sent to Anthropic to generate a response, along with your saved brand voice and qualification rules so the answer sounds like you. Under our agreement with Anthropic this content is not used to train their models.`,
        `If there is information you would rather not send to a third-party AI provider, do not put it in an agent prompt or a lead form field.`,
      ],
    },
    {
      heading: "6. How long we keep it",
      body: [
        `While your account is active, and for 90 days after it closes so that you can ask for an export or change your mind. After that we delete client data, except records we are required to keep for tax and accounting — typically invoices, for seven years.`,
        `You can ask us to delete specific data sooner and we will, unless we are required to keep it.`,
      ],
    },
    {
      heading: "7. Your rights",
      body: [
        `You can ask us for a copy of your data, ask us to correct it, or ask us to delete it. Email ${BRAND.notifyEmail} and we will respond within 30 days.`,
        `If you are in a jurisdiction with specific privacy rights — for example California under the CCPA, or the EU and UK under the GDPR — those rights apply and we will honour them. We do not sell personal information as those laws define selling.`,
      ],
    },
    {
      heading: "8. Security",
      body: [
        `Data is encrypted in transit. Access to production data is limited to people who need it to run the service. Each client's data is scoped to their own account throughout the platform, and your lead-intake token is the credential that protects your intake endpoint — treat it like a password and ask us to rotate it if it is ever exposed.`,
        `No system is perfectly secure. If a breach affects your data we will tell you promptly and tell you what we know.`,
      ],
    },
    {
      heading: "9. Cookies",
      body: [
        `We use a session cookie to keep you signed in. We do not use advertising cookies or third-party trackers on our own site.`,
      ],
    },
    {
      heading: "10. Children",
      body: [`This is a service for businesses. It is not directed at anyone under 18 and we do not knowingly collect their information.`],
    },
    {
      heading: "11. Changes and contact",
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
      heading: "1. Structure",
      body: [
        `This agreement is between ${BRAND.name} and the business named on the subscription ("Client"). It takes effect on the date the first subscription becomes active and continues until every subscription under it has ended.`,
        `The tier you subscribe to defines the scope. Each tier's deliverables are published on its plan page and are incorporated into this agreement by reference — what that page says is delivered, is what is owed.`,
      ],
    },
    {
      heading: "2. The two lines",
      body: [
        `AI Automation Agents (${agentTiers().map((p) => p.name).join(", ")}) is software. We provision the agents, playbooks, integrations and documents listed for the tier, and Client operates them. Usage is metered against the tier's monthly run allowance.`,
        `Ad Operations Management (${adOpsTiers().map((p) => p.name).join(", ")}) is a managed service. Our team works inside Client's advertising accounts under access Client grants, and the automated Spend Watch checks for that tier run against Client's accounts on the published cadence.`,
      ],
    },
    {
      heading: "3. The build phase",
      body: [
        `Plans carrying a build fee include a defined onboarding engagement, listed on the plan page under "Then we build with you". It typically includes a kickoff call, tuning against Client's real data, integration mapping, and a supervised period before the system runs unattended.`,
        `We aim to complete the build within 30 days of Client providing the access and information we ask for. Delays caused by outstanding access or unanswered questions extend that period by the same amount.`,
      ],
    },
    {
      heading: "4. What Client provides",
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
      heading: "5. Fees and payment",
      body: [
        `Fees are as published and as listed on the subscription. Payment is by card through Stripe, monthly in advance. The build fee, where applicable, is charged on the first invoice.`,
        `If a payment fails we will retry and notify Client. If an invoice remains unpaid 14 days after it was due we may suspend the service until it is settled.`,
        `We may change published prices with 30 days' written notice. Any change takes effect at Client's next renewal, and Client may cancel before it applies.`,
      ],
      bullets: feeSchedule(),
    },
    {
      heading: "6. Term and termination",
      body: [
        `Month to month. Either party may end a subscription at any time, effective at the end of the current billing period. Client can do this from the billing page without contacting us.`,
        `On termination we will, at Client's request within 90 days: remove our access from Client's advertising accounts, hand over the documents delivered under the plan, and provide an export of Client's data held in the platform.`,
        `We do not withhold access to Client's own advertising accounts, campaigns or data at any point, including during a dispute over fees.`,
      ],
    },
    {
      heading: "7. Confidentiality",
      body: [
        `Each party will keep the other's non-public information confidential and use it only to perform this agreement. That obligation survives termination by three years.`,
        `We may describe the engagement in general terms as a case study only with Client's written permission, and will not disclose specific figures without it.`,
      ],
    },
    {
      heading: "8. Intellectual property",
      body: [
        `Client owns its brand, its data, its advertising accounts and everything created specifically for it: campaigns, creative, the qualification rubric, escalation matrix, brand voice profile, testing framework and naming convention.`,
        `We own the platform, our agent prompts, our system blueprints and our industry packs. Nothing in this agreement transfers those, and Client's licence to use them ends when the subscription does.`,
      ],
    },
    {
      heading: "9. Performance and results",
      body: [
        `We commit to performing the work described for the tier with reasonable skill and care. We do not commit to any specific business result. Section 8 of the Terms of Service applies in full and Client should read it before signing.`,
        `Where we set a target — a cost per lead, a cost per sale, a return on ad spend — it is a target we are working toward and a threshold our monitoring measures against. It is not a warranty.`,
      ],
    },
    {
      heading: "10. Compliance",
      body: [
        `Client is responsible for the legality of what it advertises, for any licensing its trade requires, and for claims made about its own products and services. We will not knowingly run advertising that breaches a platform's policies or the law, and may decline or pause work that does.`,
        `In regulated trades — medical, legal, financial — Client is responsible for ensuring output meets its regulatory obligations before it is published or sent.`,
      ],
    },
    {
      heading: "11. General",
      body: [
        `Neither party may assign this agreement without the other's consent, except to a successor of its business. Notices go to the email addresses on the account. If any provision is unenforceable, the rest stands.`,
        `This agreement, together with the Terms of Service, the Privacy Policy and the plan page for the subscribed tier, is the entire agreement between the parties.`,
        `Governed by the laws of ${GOVERNING_LAW}.`,
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS: LegalDocument[] = [TERMS, PRIVACY, MSA];

export function legalBySlug(slug: string): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((d) => d.slug === slug);
}
