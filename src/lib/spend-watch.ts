/**
 * The Spend Watch — the ad-ops line's night shift.
 *
 * DIRECTION
 *   Managed ad-ops gets fired for one reason: on the days nothing goes wrong,
 *   the client can't see the work, and on the days something does, they find
 *   out in next month's report. This inverts both. Every check below runs
 *   unattended against real daily data and posts what it found — so the value
 *   is visible on a quiet week, and a broken account is caught the same day.
 *
 * BLUEPRINTS
 *   Every check is a pure function of (daily metrics, targets). No model, no
 *   database, no clock beyond what's passed in. `runSpendWatch` is the only
 *   part that writes. That matters more here than on the agents line: an alert
 *   is a claim about someone's money, so it has to be arithmetic we can point
 *   at, not a language model's impression.
 *
 * The rules that keep it trustworthy:
 *   - A missing target means the check is SKIPPED, never guessed. An alert
 *     fired against an invented budget is worse than no alert.
 *   - Minimum volume before any trend is called. Two leads becoming one is not
 *     a 50% CPL increase, it's a Tuesday.
 *   - Findings that clear are auto-resolved. An alert list nobody can empty
 *     stops being read within a week.
 */

import { prisma } from "@/lib/prisma";
import { blueprintFor } from "@/lib/systems";
import { postWebhook } from "@/lib/webhooks";
import { env } from "@/lib/env";

export type AdAlertKind =
  | "PACING_OVER"
  | "PACING_UNDER"
  | "CPL_DRIFT"
  | "DELIVERY_GAP"
  | "CREATIVE_FATIGUE"
  | "CPA_BREACH"
  | "ROAS_DECLINE"
  | "ANOMALY";

export type AlertSeverity = "CRITICAL" | "WARNING" | "INFO";
export type WatchCadence = "DAILY" | "WEEKLY";

export interface DailyMetric {
  date: Date;
  spend: number; // cents
  impressions: number;
  clicks: number;
  leads: number;
  conversions: number;
  revenue: number; // cents
}

export interface AccountTargets {
  monthlyBudgetCents?: number | null;
  targetCplCents?: number | null;
  targetCpaCents?: number | null;
  targetRoas?: number | null;
}

export interface Finding {
  kind: AdAlertKind;
  severity: AlertSeverity;
  title: string;
  detail: string;
  observed?: number;
  expected?: number;
}

// --- Thresholds. Deliberately loose: a noisy watch gets muted, and a muted
// --- watch is worth less than no watch at all.
export const MIN_HISTORY_DAYS = 14;
/** Below this many leads in a window, cost-per-lead movement is noise. */
export const MIN_LEADS_FOR_TREND = 8;
/** Below this many impressions, click-through movement is noise. */
export const MIN_IMPRESSIONS_FOR_TREND = 2000;
const CPL_DRIFT_WARN = 0.25;
const CPL_DRIFT_CRIT = 0.5;
const PACING_OVER_WARN = 0.2;
const PACING_OVER_CRIT = 0.4;
const PACING_UNDER_WARN = 0.25;
const CTR_DECAY_WARN = 0.25;
const ANOMALY_MULTIPLE = 2.5;
/** How far under a ROAS target is still just noise. */
const ROAS_TOLERANCE = 0.1;
const DELIVERY_GAP_DAYS = 2;

/**
 * Which checks a tier turns on. Derived from the MONITOR modules in that tier's
 * blueprint rather than hardcoded, so the page selling the feature and the code
 * running it cannot disagree.
 */
export const MONITOR_MODULE_CHECKS: Record<string, AdAlertKind[]> = {
  "adops-monitor-pacing": ["PACING_OVER", "PACING_UNDER"],
  "adops-monitor-cpl-drift": ["CPL_DRIFT"],
  "adops-monitor-delivery-gap": ["DELIVERY_GAP"],
  "adops-monitor-creative-fatigue": ["CREATIVE_FATIGUE"],
  "adops-monitor-cpa-guardrail": ["CPA_BREACH"],
  "adops-monitor-roas-trend": ["ROAS_DECLINE"],
  "adops-monitor-anomaly": ["ANOMALY"],
};

export function checksForPlan(planKey: string | null | undefined): Set<AdAlertKind> {
  const blueprint = planKey ? blueprintFor(planKey) : undefined;
  const enabled = new Set<AdAlertKind>();
  if (!blueprint) return enabled;
  for (const m of blueprint.modules) {
    if (m.kind !== "MONITOR") continue;
    for (const check of MONITOR_MODULE_CHECKS[m.key] ?? []) enabled.add(check);
  }
  return enabled;
}

export interface SweepDueInput {
  cadence: WatchCadence;
  now: Date;
  hourUtc: number;
  lastRunAt?: Date | null;
  /** Weekly sweeps land on this UTC weekday (1 = Monday). */
  weeklyDay?: number;
}

/**
 * Whether a sweep is due. The cron fires hourly; this is what makes it one
 * sweep a day. Tracked on a timestamp rather than inferred from alert rows,
 * because a clean sweep writes no rows and would otherwise look like it never
 * happened — and then run again every hour.
 */
export function isSweepDue({
  cadence,
  now,
  hourUtc,
  lastRunAt,
  weeklyDay = 1,
}: SweepDueInput): boolean {
  if (now.getUTCHours() < hourUtc) return false;

  const today = dayBucket(now);
  if (lastRunAt && dayBucket(lastRunAt).getTime() >= today.getTime()) return false;

  if (cadence === "WEEKLY") {
    if (now.getUTCDay() !== weeklyDay) return false;
    if (lastRunAt) {
      const days = (today.getTime() - dayBucket(lastRunAt).getTime()) / 86_400_000;
      if (days < 6) return false;
    }
  }

  return true;
}

/** Monitor sweeps weekly; the hands-on tiers sweep every morning. */
export function watchCadenceFor(planKey: string | null | undefined): WatchCadence | null {
  switch (planKey) {
    case "operate":
    case "dominate":
      return "DAILY";
    case "monitor":
      return "WEEKLY";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function dayBucket(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function sum<K extends keyof DailyMetric>(rows: DailyMetric[], key: K): number {
  return rows.reduce((t, r) => t + (r[key] as number), 0);
}

/**
 * Rows in the day range (now - from, now - to]. Every trend check passes to = 1
 * so the window ends at the last *complete* day — including today would compare
 * a part-day against full ones and manufacture a decline every morning.
 */
function window(rows: DailyMetric[], now: Date, from: number, to = 0): DailyMetric[] {
  const end = dayBucket(now).getTime() - to * 86_400_000;
  const start = dayBucket(now).getTime() - from * 86_400_000;
  return rows.filter((r) => {
    const t = dayBucket(r.date).getTime();
    return t > start && t <= end;
  });
}

function pctChange(now: number, before: number): number {
  if (before === 0) return 0;
  return (now - before) / before;
}

/** Whole dollars everywhere. Cents on a derived figure read as false precision. */
function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function pctLabel(x: number): string {
  return `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

// ---------------------------------------------------------------------------
// The checks — each pure, each returns a Finding or null
// ---------------------------------------------------------------------------

/** An account that has simply stopped spending. The single most costly silence. */
export function checkDeliveryGap(rows: DailyMetric[], now: Date): Finding | null {
  const recent = window(rows, now, DELIVERY_GAP_DAYS + 1, 1);
  // Rows must be present and zero. An absent row means "not ingested yet" in
  // this data model, not "no spend" — alerting on missing data would cry wolf
  // every time an import ran late.
  if (recent.length === 0) return null;
  if (sum(recent, "spend") > 0) return null;

  const prior = window(rows, now, 10, DELIVERY_GAP_DAYS + 1);
  const priorSpend = sum(prior, "spend");
  if (priorSpend <= 0) return null; // never delivered; not a gap, just not running

  const dailyAvg = Math.round(priorSpend / Math.max(1, prior.length));
  return {
    kind: "DELIVERY_GAP",
    severity: "CRITICAL",
    title: "Account has stopped delivering",
    detail: `No spend recorded for ${DELIVERY_GAP_DAYS} days, after averaging ${money(dailyAvg)}/day the week before. Usually a rejected ad, an exhausted budget, or a billing failure — all of them cost you every hour they go unnoticed.`,
    observed: 0,
    expected: dailyAvg,
  };
}

/** Month-to-date spend against a prorated share of the monthly budget. */
export function checkPacing(
  rows: DailyMetric[],
  targets: AccountTargets,
  now: Date,
): Finding | null {
  const budget = targets.monthlyBudgetCents;
  if (!budget || budget <= 0) return null; // no budget set = no opinion

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const mtd = rows.filter((r) => dayBucket(r.date) >= monthStart && dayBucket(r.date) <= dayBucket(now));
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  // Too early in the month for pacing to mean anything.
  if (dayOfMonth < 5) return null;

  const spent = sum(mtd, "spend");
  const expected = Math.round((budget * dayOfMonth) / daysInMonth);
  const drift = pctChange(spent, expected);

  if (drift >= PACING_OVER_WARN) {
    const projected = Math.round((spent / dayOfMonth) * daysInMonth);
    return {
      kind: "PACING_OVER",
      severity: drift >= PACING_OVER_CRIT ? "CRITICAL" : "WARNING",
      title: `Pacing ${pctLabel(drift)} over budget`,
      detail: `${money(spent)} spent by day ${dayOfMonth} against ${money(expected)} expected. At this rate the month closes at ${money(projected)} versus a ${money(budget)} budget.`,
      observed: spent,
      expected,
    };
  }

  if (drift <= -PACING_UNDER_WARN) {
    return {
      kind: "PACING_UNDER",
      severity: "WARNING",
      title: `Pacing ${pctLabel(drift)} under budget`,
      detail: `Only ${money(spent)} spent by day ${dayOfMonth} against ${money(expected)} expected. Underspend is lost volume you already budgeted for — usually a bid cap, a narrow audience, or a paused ad set nobody restarted.`,
      observed: spent,
      expected,
    };
  }

  return null;
}

/** Cost per lead over the last week against the three weeks before it. */
export function checkCplDrift(rows: DailyMetric[], now: Date): Finding | null {
  const recent = window(rows, now, 8, 1);
  const baseline = window(rows, now, 29, 8);

  const recentLeads = sum(recent, "leads");
  const baseLeads = sum(baseline, "leads");
  if (recentLeads < MIN_LEADS_FOR_TREND || baseLeads < MIN_LEADS_FOR_TREND) return null;

  const recentCpl = sum(recent, "spend") / recentLeads;
  const baseCpl = sum(baseline, "spend") / baseLeads;
  if (baseCpl <= 0) return null;

  const drift = pctChange(recentCpl, baseCpl);
  if (drift < CPL_DRIFT_WARN) return null;

  return {
    kind: "CPL_DRIFT",
    severity: drift >= CPL_DRIFT_CRIT ? "CRITICAL" : "WARNING",
    title: `Cost per lead up ${pctLabel(drift)}`,
    detail: `${money(Math.round(recentCpl))} per lead over the last 7 days, against ${money(Math.round(baseCpl))} for the three weeks before. On ${recentLeads} leads that is ${money(Math.round((recentCpl - baseCpl) * recentLeads))} of extra cost this week alone.`,
    observed: Math.round(recentCpl),
    expected: Math.round(baseCpl),
  };
}

/** Click-through decay — the earliest reliable signal that an ad is worn out. */
export function checkCreativeFatigue(rows: DailyMetric[], now: Date): Finding | null {
  const recent = window(rows, now, 8, 1);
  const baseline = window(rows, now, 29, 8);

  const recentImpr = sum(recent, "impressions");
  const baseImpr = sum(baseline, "impressions");
  if (recentImpr < MIN_IMPRESSIONS_FOR_TREND || baseImpr < MIN_IMPRESSIONS_FOR_TREND) return null;

  const recentCtr = sum(recent, "clicks") / recentImpr;
  const baseCtr = sum(baseline, "clicks") / baseImpr;
  if (baseCtr <= 0) return null;

  const decay = pctChange(recentCtr, baseCtr);
  if (decay > -CTR_DECAY_WARN) return null;

  return {
    kind: "CREATIVE_FATIGUE",
    severity: "WARNING",
    title: `Creative fatiguing — click-through down ${pctLabel(decay)}`,
    detail: `${(recentCtr * 100).toFixed(2)}% click-through over the last 7 days against ${(baseCtr * 100).toFixed(2)}% before. The audience has seen it. Refresh now, while cost per lead is still normal — waiting until CPL climbs means paying for the lesson twice.`,
    observed: Number((recentCtr * 100).toFixed(3)),
    expected: Number((baseCtr * 100).toFixed(3)),
  };
}

/** Cost per sale against the client's stated target. */
export function checkCpaBreach(
  rows: DailyMetric[],
  targets: AccountTargets,
  now: Date,
): Finding | null {
  const target = targets.targetCpaCents;
  if (!target || target <= 0) return null;

  const recent = window(rows, now, 15, 1);
  const conversions = sum(recent, "conversions");
  if (conversions < 3) return null; // too few sales to call it

  const cpa = sum(recent, "spend") / conversions;
  const over = pctChange(cpa, target);
  if (over <= 0.15) return null;

  return {
    kind: "CPA_BREACH",
    severity: over >= 0.5 ? "CRITICAL" : "WARNING",
    title: `Cost per sale ${pctLabel(over)} over target`,
    detail: `${money(Math.round(cpa))} per sale over the last 14 days against a ${money(target)} target, across ${conversions} sales. Either the target moves or the account does.`,
    observed: Math.round(cpa),
    expected: target,
  };
}

/** Return on ad spend against target. */
export function checkRoasDecline(
  rows: DailyMetric[],
  targets: AccountTargets,
  now: Date,
): Finding | null {
  const target = targets.targetRoas;
  if (!target || target <= 0) return null;

  const recent = window(rows, now, 15, 1);
  const spend = sum(recent, "spend");
  const revenue = sum(recent, "revenue");
  if (spend <= 0 || revenue <= 0) return null;

  const roas = revenue / spend;
  const shortfall = pctChange(roas, target);
  // Landing a few percent under target is a normal fortnight, not a finding.
  if (shortfall > -ROAS_TOLERANCE) return null;
  return {
    kind: "ROAS_DECLINE",
    severity: shortfall <= -0.3 ? "CRITICAL" : "WARNING",
    title: `Return on ad spend at ${roas.toFixed(2)}× against a ${target.toFixed(2)}× target`,
    detail: `${money(revenue)} of tracked revenue on ${money(spend)} of spend over 14 days. Hitting target would have meant ${money(Math.round(spend * target))} — a ${money(Math.round(spend * target - revenue))} gap.`,
    observed: Number(roas.toFixed(2)),
    expected: Number(target.toFixed(2)),
  };
}

/** A single day that looks nothing like the fortnight around it. */
export function checkAnomaly(rows: DailyMetric[], now: Date): Finding | null {
  const latest = window(rows, now, 2, 1);
  if (latest.length === 0) return null;
  const baseline = window(rows, now, 16, 2);
  if (baseline.length < 7) return null;

  const spendToday = sum(latest, "spend");
  const typical = median(baseline.map((r) => r.spend));
  if (typical <= 0) return null;
  if (spendToday < typical * ANOMALY_MULTIPLE) return null;

  return {
    kind: "ANOMALY",
    severity: "WARNING",
    title: `Spend spike — ${money(spendToday)} in one day`,
    detail: `${(spendToday / typical).toFixed(1)}× the typical day (${money(Math.round(typical))}) over the last fortnight. Worth confirming it was intentional before it repeats tomorrow.`,
    observed: spendToday,
    expected: Math.round(typical),
  };
}

/**
 * Pure: run every enabled check against one account's history.
 * Returns findings ordered most severe first.
 */
export function analyzeAccount(
  rows: DailyMetric[],
  targets: AccountTargets,
  enabled: Set<AdAlertKind>,
  now: Date,
): Finding[] {
  if (rows.length < MIN_HISTORY_DAYS) return [];

  const candidates = [
    checkDeliveryGap(rows, now),
    checkPacing(rows, targets, now),
    checkCplDrift(rows, now),
    checkCreativeFatigue(rows, now),
    checkCpaBreach(rows, targets, now),
    checkRoasDecline(rows, targets, now),
    checkAnomaly(rows, now),
  ].filter((f): f is Finding => f !== null && enabled.has(f.kind));

  // A dead account doesn't also need a pacing complaint — the gap explains it.
  const hasGap = candidates.some((f) => f.kind === "DELIVERY_GAP");
  const findings = hasGap ? candidates.filter((f) => f.kind !== "PACING_UNDER") : candidates;

  const rank: Record<AlertSeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  return [...findings].sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** One line for the dashboard and the weekly report. */
export function summarizeFindings(findings: Finding[], accountCount: number): string {
  if (accountCount === 0) return "No ad accounts connected yet.";
  if (findings.length === 0) {
    return `All ${accountCount} account${accountCount === 1 ? "" : "s"} checked — nothing needs you.`;
  }
  const critical = findings.filter((f) => f.severity === "CRITICAL").length;
  const rest = findings.length - critical;
  const parts = [];
  if (critical > 0) parts.push(`${critical} critical`);
  if (rest > 0) parts.push(`${rest} to review`);
  return `${parts.join(", ")} across ${accountCount} account${accountCount === 1 ? "" : "s"}.`;
}

// ---------------------------------------------------------------------------
// The impure runner
// ---------------------------------------------------------------------------

export interface SpendWatchResult {
  clientId: string;
  status: "COMPLETE" | "SKIPPED";
  reason?: string;
  raised?: number;
  resolved?: number;
  accounts?: number;
}

/**
 * Sweep one client's accounts. Idempotent per (account, kind, day) — the same
 * finding on the same day updates rather than duplicates, so a daily sweep
 * doesn't re-raise yesterday's problem as if it were new.
 */
export async function runSpendWatch(clientId: string, now = new Date()): Promise<SpendWatchResult> {
  const [client, sub] = await Promise.all([
    prisma.clientProfile.findUnique({
      where: { id: clientId },
      select: { briefHourUtc: true, spendWatchLastRunAt: true },
    }),
    prisma.subscription.findUnique({
      where: { clientId_lineKey: { clientId, lineKey: "AD_OPS" } },
      select: { planKey: true, status: true },
    }),
  ]);
  if (!client) return { clientId, status: "SKIPPED", reason: "No such client" };
  if (!sub || (sub.status !== "ACTIVE" && sub.status !== "TRIALING")) {
    return { clientId, status: "SKIPPED", reason: "No active ad-ops subscription" };
  }

  const cadence = watchCadenceFor(sub.planKey);
  if (!cadence) return { clientId, status: "SKIPPED", reason: "Tier has no spend watch" };
  if (!isSweepDue({ cadence, now, hourUtc: client.briefHourUtc, lastRunAt: client.spendWatchLastRunAt })) {
    return { clientId, status: "SKIPPED", reason: "Not due" };
  }

  const enabled = checksForPlan(sub.planKey);
  const since = new Date(dayBucket(now).getTime() - 45 * 86_400_000);

  const accounts = await prisma.adAccount.findMany({
    where: { clientId },
    include: { metrics: { where: { date: { gte: since } }, orderBy: { date: "asc" } } },
  });

  const bucket = dayBucket(now);
  let raised = 0;
  let resolved = 0;
  const allFindings: Finding[] = [];

  for (const account of accounts) {
    const findings = analyzeAccount(
      account.metrics.map((m) => ({
        date: m.date,
        spend: m.spend,
        impressions: m.impressions,
        clicks: m.clicks,
        leads: m.leads,
        conversions: m.conversions,
        revenue: m.revenue,
      })),
      account,
      enabled,
      now,
    );
    allFindings.push(...findings);

    for (const f of findings) {
      await prisma.adAlert.upsert({
        where: {
          adAccountId_kind_dateBucket: { adAccountId: account.id, kind: f.kind, dateBucket: bucket },
        },
        update: {
          severity: f.severity,
          title: f.title,
          detail: f.detail,
          observed: f.observed ?? null,
          expected: f.expected ?? null,
        },
        create: {
          clientId,
          adAccountId: account.id,
          kind: f.kind,
          severity: f.severity,
          title: f.title,
          detail: f.detail,
          observed: f.observed ?? null,
          expected: f.expected ?? null,
          dateBucket: bucket,
        },
      });
      raised += 1;
    }

    // Anything still open whose condition has cleared is closed out. An alert
    // list the client can never empty is one they stop reading.
    const live = new Set(findings.map((f) => f.kind));
    const stale = await prisma.adAlert.findMany({
      where: {
        adAccountId: account.id,
        status: { in: ["OPEN", "ACKNOWLEDGED"] },
        kind: { notIn: [...live] },
      },
      select: { id: true },
    });
    if (stale.length > 0) {
      await prisma.adAlert.updateMany({
        where: { id: { in: stale.map((s) => s.id) } },
        data: { status: "RESOLVED", resolvedAt: now },
      });
      resolved += stale.length;
    }
  }

  if (allFindings.some((f) => f.severity === "CRITICAL")) {
    await postWebhook(
      env.zapierOnboardHook,
      {
        source: "spend_watch_critical",
        clientId,
        planKey: sub.planKey,
        findings: allFindings
          .filter((f) => f.severity === "CRITICAL")
          .map((f) => ({ kind: f.kind, title: f.title })),
        at: now.toISOString(),
      },
      { label: "zapier-spend-watch" },
    );
  }

  await prisma.clientProfile.update({
    where: { id: clientId },
    data: { spendWatchLastRunAt: now },
  });

  console.info(
    `[spend-watch] ${sub.planKey} → client ${clientId}: ${raised} raised, ${resolved} resolved across ${accounts.length} accounts`,
  );

  return { clientId, status: "COMPLETE", raised, resolved, accounts: accounts.length };
}

/** Clients whose ad-ops tier includes a spend watch. */
export async function spendWatchRoster(): Promise<string[]> {
  const subs = await prisma.subscription.findMany({
    where: {
      lineKey: "AD_OPS",
      status: { in: ["ACTIVE", "TRIALING"] },
      planKey: { in: ["monitor", "operate", "dominate"] },
    },
    select: { clientId: true },
  });
  return subs.map((s) => s.clientId);
}
