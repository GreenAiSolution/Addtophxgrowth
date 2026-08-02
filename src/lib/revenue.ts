/**
 * THE REVENUE ENGINE — one honest number, and what is moving it.
 *
 * DIRECTION
 *   The admin console showed MRR as a single sum of active subscriptions. That
 *   number cannot be relied on for the one thing it is for, because it looks
 *   identical on the month everything is fine and the month three clients are
 *   in dunning and a fourth has already pressed cancel. It reports a total
 *   while saying nothing about whether the total is about to fall.
 *
 *   "Money every month" is not a total. It is a total, minus what is at risk,
 *   plus what is arriving — and the only version of that worth having is one
 *   that separates the three rather than blending them into a single
 *   comforting figure.
 *
 * BLUEPRINTS
 *   `computeRevenue` is pure — rows in, a snapshot out. Every figure on the
 *   admin page and in the weekly digest comes from this one function, for the
 *   same reason `priceCockpit` is the only pricing arithmetic in the
 *   configurator: two implementations of the same number eventually disagree,
 *   and the trust cost of that is permanent.
 *
 *   No model call, and no forecast. This file will not tell anybody what next
 *   month will be. It reports what is committed, what is threatened, and what
 *   is in the pipeline, each labelled as itself.
 *
 * THE WIN RATE IS EVIDENCE, NOT A GUESS
 *   Pipeline value is reported raw, and weighted only when there are at least
 *   `MIN_PIPELINE_EVIDENCE` resolved opportunities to derive a win rate from —
 *   the same discipline `memory.ts` applies to everything it claims. A
 *   weighted pipeline built on an invented close rate is a made-up number
 *   wearing the costume of a measured one, and it is the number a person would
 *   plan their month around.
 */

import { prisma } from "@/lib/prisma";

/** Below this many resolved opportunities, no win rate is stated at all. */
export const MIN_PIPELINE_EVIDENCE = 5;

/**
 * The key `SystemRun` remembers the weekly digest under.
 *
 * Lives here rather than in the cron route because a Next.js route file may
 * only export its own reserved fields — and because the constant belongs with
 * the thing it names, not with the scheduler that happens to use it.
 */
export const DIGEST_KEY = "revenue.digest";

export type LineKey = "AI_AGENTS" | "AD_OPS";

export interface SubscriptionRow {
  lineKey: LineKey;
  planKey: string;
  status: "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED" | "INCOMPLETE";
  priceMonthlyCents: number;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  createdAt: Date;
  clientId: string;
  businessName: string;
}

export interface IssueRow {
  clientId: string;
  businessName: string;
  amountCents: number;
  state: "OPEN" | "RECOVERED" | "LOST";
  firstFailedAt: Date;
  recoveredAt: Date | null;
  lostAt: Date | null;
}

export interface OpportunityRow {
  stage: "NEW" | "WORKING" | "WON" | "LOST" | "DORMANT";
  quotedMonthlyCents: number;
  createdAt: Date;
  wonAt: Date | null;
}

export interface RevenueSnapshot {
  /** Every subscription billing today, whatever state its payments are in. */
  mrrCents: number;
  activeCount: number;
  byLine: Record<LineKey, { mrrCents: number; count: number }>;

  /**
   * MRR under threat, and why. A subscription is at risk if its payments are
   * failing or its owner has already pressed cancel — both are money that is
   * on the books today and will not be next month unless somebody acts.
   */
  atRiskCents: number;
  atRiskCount: number;
  failingCents: number;
  cancellingCents: number;

  /** MRR minus at-risk. The figure to plan on. */
  securedCents: number;

  /** Movement inside the calendar month containing `now`. */
  newThisMonthCents: number;
  lostThisMonthCents: number;
  netThisMonthCents: number;

  /** Money that failed and came back, this month. The dunning loop's receipt. */
  recoveredThisMonthCents: number;
  recoveredThisMonthCount: number;

  /** Not yet sold. */
  pipelineCount: number;
  pipelineMonthlyCents: number;
  /** null until there is enough history to derive one honestly. */
  winRate: number | null;
  /** null whenever `winRate` is. */
  weightedPipelineCents: number | null;
  resolvedOpportunities: number;
}

const EMPTY_LINE = { mrrCents: 0, count: 0 };

function sameMonth(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}

/**
 * Pure: the whole revenue picture from rows.
 *
 * `PAST_DUE` counts toward MRR on purpose. The subscription still exists and
 * the work is still being delivered; calling it gone the day a card bounces
 * would understate the total and, worse, would hide it from the at-risk figure
 * that is supposed to be driving somebody to go and fix it.
 */
export function computeRevenue(
  subs: SubscriptionRow[],
  issues: IssueRow[],
  opportunities: OpportunityRow[],
  now: Date,
): RevenueSnapshot {
  const live = subs.filter((s) => s.status === "ACTIVE" || s.status === "TRIALING" || s.status === "PAST_DUE");

  const byLine: Record<LineKey, { mrrCents: number; count: number }> = {
    AI_AGENTS: { ...EMPTY_LINE },
    AD_OPS: { ...EMPTY_LINE },
  };
  let mrrCents = 0;
  for (const s of live) {
    mrrCents += s.priceMonthlyCents;
    const bucket = byLine[s.lineKey] ?? (byLine[s.lineKey] = { ...EMPTY_LINE });
    bucket.mrrCents += s.priceMonthlyCents;
    bucket.count++;
  }

  // At risk, counted once per subscription even when it is both failing and
  // cancelling — double-counting would inflate the one number somebody is
  // meant to act on.
  const failingClients = new Set(issues.filter((i) => i.state === "OPEN").map((i) => i.clientId));
  let failingCents = 0;
  let cancellingCents = 0;
  let atRiskCents = 0;
  let atRiskCount = 0;
  for (const s of live) {
    const failing = s.status === "PAST_DUE" || failingClients.has(s.clientId);
    const cancelling = s.cancelAtPeriodEnd;
    if (failing) failingCents += s.priceMonthlyCents;
    else if (cancelling) cancellingCents += s.priceMonthlyCents;
    if (failing || cancelling) {
      atRiskCents += s.priceMonthlyCents;
      atRiskCount++;
    }
  }

  const newThisMonthCents = live
    .filter((s) => sameMonth(s.createdAt, now))
    .reduce((t, s) => t + s.priceMonthlyCents, 0);

  const lostThisMonthCents = subs
    .filter((s) => s.status === "CANCELED" && s.currentPeriodEnd && sameMonth(s.currentPeriodEnd, now))
    .reduce((t, s) => t + s.priceMonthlyCents, 0);

  const recovered = issues.filter(
    (i) => i.state === "RECOVERED" && i.recoveredAt && sameMonth(i.recoveredAt, now),
  );

  // Pipeline: open opportunities only. DORMANT is deliberately excluded — a
  // prospect the ladder ran out on is not forecastable revenue, and counting
  // them is how a pipeline number becomes fiction.
  const open = opportunities.filter((o) => o.stage === "NEW" || o.stage === "WORKING");
  const pipelineMonthlyCents = open.reduce((t, o) => t + o.quotedMonthlyCents, 0);

  const resolved = opportunities.filter((o) => o.stage === "WON" || o.stage === "LOST");
  const won = resolved.filter((o) => o.stage === "WON").length;
  const enough = resolved.length >= MIN_PIPELINE_EVIDENCE;
  const winRate = enough ? won / resolved.length : null;

  return {
    mrrCents,
    activeCount: live.length,
    byLine,
    atRiskCents,
    atRiskCount,
    failingCents,
    cancellingCents,
    securedCents: mrrCents - atRiskCents,
    newThisMonthCents,
    lostThisMonthCents,
    netThisMonthCents: newThisMonthCents - lostThisMonthCents,
    recoveredThisMonthCents: recovered.reduce((t, i) => t + i.amountCents, 0),
    recoveredThisMonthCount: recovered.length,
    pipelineCount: open.length,
    pipelineMonthlyCents,
    winRate,
    weightedPipelineCents: winRate === null ? null : Math.round(pipelineMonthlyCents * winRate),
    resolvedOpportunities: resolved.length,
  };
}

/**
 * Pure: the weekly digest, as plain text.
 *
 * Written to be read on a phone before anything else on a Monday. Leads with
 * the number, then only what changed, then only what needs a person. A digest
 * that reprints the whole dashboard every week is one nobody opens by week
 * four.
 */
export function renderRevenueDigest(s: RevenueSnapshot, currency = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`): string {
  const lines: string[] = [];

  lines.push(`MRR ${currency(s.mrrCents)} across ${s.activeCount} subscriptions.`);

  if (s.atRiskCents > 0) {
    lines.push(
      `${currency(s.atRiskCents)} at risk (${s.atRiskCount} ${s.atRiskCount === 1 ? "subscription" : "subscriptions"}) — ` +
        `${currency(s.failingCents)} failing payment, ${currency(s.cancellingCents)} cancelling at period end.`,
    );
    lines.push(`Secured: ${currency(s.securedCents)}.`);
  } else {
    lines.push("Nothing at risk: no failing payments, nothing set to cancel.");
  }

  if (s.newThisMonthCents || s.lostThisMonthCents) {
    lines.push(
      `This month: +${currency(s.newThisMonthCents)} new, −${currency(s.lostThisMonthCents)} lost, ` +
        `net ${s.netThisMonthCents >= 0 ? "+" : "−"}${currency(Math.abs(s.netThisMonthCents))}.`,
    );
  }

  if (s.recoveredThisMonthCount > 0) {
    lines.push(
      `Recovered ${currency(s.recoveredThisMonthCents)} across ${s.recoveredThisMonthCount} ` +
        `${s.recoveredThisMonthCount === 1 ? "invoice" : "invoices"} that had failed.`,
    );
  }

  if (s.pipelineCount > 0) {
    const weighted =
      s.weightedPipelineCents === null
        ? `no win rate yet — ${s.resolvedOpportunities}/${MIN_PIPELINE_EVIDENCE} closed opportunities of evidence`
        : `${currency(s.weightedPipelineCents)} weighted at a measured ${Math.round((s.winRate ?? 0) * 100)}% win rate`;
    lines.push(
      `Pipeline: ${s.pipelineCount} open worth ${currency(s.pipelineMonthlyCents)}/mo — ${weighted}.`,
    );
  } else {
    lines.push("Pipeline: nothing open. Nobody new asked to be contacted.");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// The database half.
// ---------------------------------------------------------------------------

export interface RevenueBoard {
  snapshot: RevenueSnapshot;
  /** Open payment issues, worst (oldest) first. */
  failing: {
    id: string;
    clientId: string;
    businessName: string;
    amountCents: number;
    firstFailedAt: Date;
    noticesSent: number;
    lastNoticeStep: string | null;
    escalatedAt: Date | null;
    hostedInvoiceUrl: string | null;
  }[];
  /** Subscriptions the client has already set to end. */
  cancelling: {
    clientId: string;
    businessName: string;
    planKey: string;
    priceMonthlyCents: number;
    endsAt: Date | null;
  }[];
  /** Prospects the ladder is still working, newest first. */
  pipeline: {
    id: string;
    name: string;
    email: string;
    company: string | null;
    stage: string;
    quotedMonthlyCents: number;
    followUpsSent: number;
    lastFollowUpAt: Date | null;
    createdAt: Date;
    stoppedAt: Date | null;
  }[];
}

/**
 * The admin board: the snapshot, plus the specific rows behind the two figures
 * somebody would immediately want to click on.
 *
 * Named lists rather than one blended "things to look at" feed, because the
 * two halves need different actions — a failing payment needs a phone call, an
 * open opportunity needs a reply — and a merged list makes neither obvious.
 */
export async function collectRevenueBoard(now = new Date()): Promise<RevenueBoard> {
  const [snapshot, failing, cancelling, pipeline] = await Promise.all([
    collectRevenue(now),
    prisma.paymentIssue.findMany({
      where: { state: "OPEN" },
      include: { client: true },
      orderBy: { firstFailedAt: "asc" },
      take: 50,
    }),
    prisma.subscription.findMany({
      where: { cancelAtPeriodEnd: true, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
      include: { client: true, plan: true },
      orderBy: { currentPeriodEnd: "asc" },
      take: 50,
    }),
    prisma.opportunity.findMany({
      where: { stage: { in: ["NEW", "WORKING"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return {
    snapshot,
    failing: failing.map((i) => ({
      id: i.id,
      clientId: i.clientId,
      businessName: i.client.businessName,
      amountCents: i.amountCents,
      firstFailedAt: i.firstFailedAt,
      noticesSent: i.noticesSent,
      lastNoticeStep: i.lastNoticeStep,
      escalatedAt: i.escalatedAt,
      hostedInvoiceUrl: i.hostedInvoiceUrl,
    })),
    cancelling: cancelling.map((s) => ({
      clientId: s.clientId,
      businessName: s.client.businessName,
      planKey: s.planKey,
      priceMonthlyCents: s.plan.priceMonthly,
      endsAt: s.currentPeriodEnd,
    })),
    pipeline: pipeline.map((o) => ({
      id: o.id,
      name: o.name,
      email: o.email,
      company: o.company,
      stage: o.stage,
      quotedMonthlyCents: o.quotedMonthlyCents,
      followUpsSent: o.followUpsSent,
      lastFollowUpAt: o.lastFollowUpAt,
      createdAt: o.createdAt,
      stoppedAt: o.stoppedAt,
    })),
  };
}

/** Read everything `computeRevenue` needs, in four queries rather than N. */
export async function collectRevenue(now = new Date()): Promise<RevenueSnapshot> {
  const [subs, issues, opportunities] = await Promise.all([
    prisma.subscription.findMany({
      include: { plan: true, client: true },
    }),
    prisma.paymentIssue.findMany({ include: { client: true } }),
    prisma.opportunity.findMany({
      select: { stage: true, quotedMonthlyCents: true, createdAt: true, wonAt: true },
    }),
  ]);

  return computeRevenue(
    subs.map((s) => ({
      lineKey: s.lineKey as LineKey,
      planKey: s.planKey,
      status: s.status,
      priceMonthlyCents: s.plan.priceMonthly,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      currentPeriodEnd: s.currentPeriodEnd,
      createdAt: s.createdAt,
      clientId: s.clientId,
      businessName: s.client.businessName,
    })),
    issues.map((i) => ({
      clientId: i.clientId,
      businessName: i.client.businessName,
      amountCents: i.amountCents,
      state: i.state,
      firstFailedAt: i.firstFailedAt,
      recoveredAt: i.recoveredAt,
      lostAt: i.lostAt,
    })),
    opportunities,
    now,
  );
}
