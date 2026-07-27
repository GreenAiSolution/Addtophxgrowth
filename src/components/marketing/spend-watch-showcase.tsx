import Link from "next/link";
import { Radar, AlertTriangle, Check } from "lucide-react";
import { blueprintFor } from "@/lib/systems";
import {
  analyzeAccount,
  checksForPlan,
  type AdAlertKind,
  type DailyMetric,
} from "@/lib/spend-watch";
import { PLANS } from "@/lib/catalog";
import { Badge } from "@/components/ui/badge";

/**
 * What the Spend Watch actually says, on the marketing page.
 *
 * The sample alerts below are produced by running the real `analyzeAccount`
 * against a fabricated-but-labelled account, at build time. Nobody writes the
 * copy by hand, so the page can never promise wording the product doesn't
 * produce — and a threshold change shows up here automatically. Server
 * component: this all disappears into static HTML.
 */

const DAY = 86_400_000;

/** A 30-day account with a real problem in it, so the engine has something to find. */
function demoHistory(now: Date): DailyMetric[] {
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: 30 }, (_, i) => {
    const daysAgo = 30 - i;
    const recent = daysAgo <= 7;
    return {
      date: new Date(base - daysAgo * DAY),
      // Cost per lead has climbed and click-through has fallen off in the last week.
      spend: 42_000,
      impressions: 22_000,
      clicks: recent ? 190 : 640,
      leads: recent ? 6 : 14,
      conversions: recent ? 1 : 3,
      revenue: recent ? 90_000 : 240_000,
    };
  });
}

const KIND_LABEL: Record<AdAlertKind, string> = {
  PACING_OVER: "Budget Pacing Watch",
  PACING_UNDER: "Budget Pacing Watch",
  CPL_DRIFT: "Cost-Per-Lead Drift Alarm",
  DELIVERY_GAP: "Delivery Gap Alarm",
  CREATIVE_FATIGUE: "Creative Fatigue Radar",
  CPA_BREACH: "Target CPA Guardrail",
  ROAS_DECLINE: "ROAS Trend Watch",
  ANOMALY: "Daily Anomaly Sweep",
};

export function SpendWatchShowcase() {
  // Fixed date so the build output is deterministic — day 20 of a 31-day month.
  const now = new Date("2026-07-20T14:00:00Z");
  const findings = analyzeAccount(
    demoHistory(now),
    { monthlyBudgetCents: 500_000, targetCpaCents: 20_000, targetRoas: 4 },
    checksForPlan("dominate"),
    now,
  ).slice(0, 4);

  const tiers = PLANS.filter((p) => p.line === "AD_OPS").map((p) => ({
    plan: p,
    checks: [...checksForPlan(p.key)],
    monitors: (blueprintFor(p.key)?.modules ?? []).filter((m) => m.kind === "MONITOR"),
  }));

  return (
    <div className="space-y-10">
      {/* Live sample alerts */}
      <div className="mx-auto max-w-3xl">
        <div className="hud-panel hud-corners p-6">
          <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
            <span className="flex items-center gap-2 font-heading text-sm font-bold">
              <Radar className="h-4 w-4 text-cyan" /> Spend Watch — sample sweep
            </span>
            <span className="hud-label">a real run against a demo account</span>
          </div>

          <div className="mt-4 space-y-3">
            {findings.map((f) => (
              <div
                key={f.kind}
                className={`pl-4 ${
                  f.severity === "CRITICAL"
                    ? "border-l-2 border-l-red-500/70"
                    : "border-l-2 border-l-amber-400/70"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {f.severity === "CRITICAL" && (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                  )}
                  <span className="text-sm font-medium">{f.title}</span>
                  <Badge variant="muted">{KIND_LABEL[f.kind]}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{f.detail}</p>
              </div>
            ))}
          </div>

          <p className="mt-5 border-t border-border/40 pt-3 text-xs text-muted-foreground">
            Those aren&apos;t mocked-up screenshots. This page runs the same checking code your
            account would, against a demo account with a problem in it, every time the site is
            built. If we change a threshold, this changes with it.
          </p>
        </div>
      </div>

      {/* What each tier watches */}
      <div className="grid gap-5 md:grid-cols-3">
        {tiers.map(({ plan, checks, monitors }) => (
          <Link
            key={plan.key}
            href={`/plans/${plan.key}`}
            className="hud-panel hud-corners flex flex-col p-5 transition-colors hover:border-cyan/60"
          >
            <div className="flex items-baseline justify-between">
              <span className="font-heading text-lg font-bold">{plan.name}</span>
              <span className="hud-value text-xs text-muted-foreground">
                {checks.length} checks
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{plan.tagline}</p>
            <ul className="mt-4 flex-1 space-y-1.5">
              {monitors.map((m) => (
                <li key={m.key} className="flex items-start gap-2 text-xs">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-cyan" />
                  <span>{m.name}</span>
                </li>
              ))}
            </ul>
            <span className="mt-4 font-mono text-[0.62rem] uppercase tracking-widest text-cyan">
              see the system →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
