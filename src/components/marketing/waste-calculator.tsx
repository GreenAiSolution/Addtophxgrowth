"use client";

import * as React from "react";
import { Flame, Clock, Repeat, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

/**
 * The wasted-spend calculator — the ad-ops line's diagnostic.
 *
 * The ROI calculator sells upside. This one sells the cost of the status quo,
 * which is the stronger motivator for someone already spending money on ads.
 * Every lever is something the Spend Watch specifically catches, so the number
 * it produces is a claim we can actually back:
 *   1. days an account sits broken before anyone notices  → delivery gap
 *   2. share of budget still running on worn-out creative → fatigue radar
 *   3. drift in cost per lead nobody caught               → CPL drift alarm
 *
 * The model is deliberately simple and fully disclosed in the footnote. An
 * inflated scare number gets caught in the first sales call and costs more
 * credibility than it buys attention.
 */

/** How often an unattended account breaks badly enough to stop delivering. */
const OUTAGES_PER_YEAR = 3;

function useAnimatedValue(target: number, duration = 420) {
  const [display, setDisplay] = React.useState(target);
  const currentRef = React.useRef(target);

  React.useEffect(() => {
    const from = currentRef.current;
    const delta = target - from;
    if (delta === 0) return;

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = from + delta * eased;
      currentRef.current = next;
      setDisplay(next);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return display;
}

function compactMoney(dollars: number) {
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 10_000) return `$${Math.round(dollars / 1_000)}K`;
  return formatCurrency(Math.round(dollars) * 100);
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="hud-label">{label}</label>
        <span className="hud-value text-sm font-bold">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-cyan"
      />
    </div>
  );
}

export function WasteCalculator() {
  const [monthlySpend, setMonthlySpend] = React.useState(25_000);
  const [daysBlind, setDaysBlind] = React.useState(9);
  const [fatiguedShare, setFatiguedShare] = React.useState(25);

  const dailySpend = monthlySpend / 30;

  // 1. Spend that keeps running while an account is broken and nobody knows.
  const outageWaste = dailySpend * daysBlind * OUTAGES_PER_YEAR;

  // 2. Budget on creative the audience has stopped responding to. Fatigued
  //    inventory doesn't return zero — it returns worse, so we count the delta,
  //    not the whole slice.
  const fatigueWaste = monthlySpend * 12 * (fatiguedShare / 100) * 0.35;

  // 3. Cost-per-lead drift that runs a full reporting cycle before it's caught.
  //    Half a month of a 25% overpay, three times a year.
  const driftWaste = monthlySpend * 0.25 * 0.5 * 3;

  const total = outageWaste + fatigueWaste + driftWaste;
  const shown = useAnimatedValue(total);
  const shownMonthly = useAnimatedValue(total / 12);

  const rows = [
    {
      icon: AlertTriangle,
      label: "Spend burned while an account sits broken",
      value: outageWaste,
      note: `${daysBlind} days × ${OUTAGES_PER_YEAR} outages a year`,
    },
    {
      icon: Repeat,
      label: "Budget on creative the audience is done with",
      value: fatigueWaste,
      note: `${fatiguedShare}% of spend, performing ~35% worse`,
    },
    {
      icon: Clock,
      label: "Cost-per-lead drift caught a cycle late",
      value: driftWaste,
      note: "half a month of a 25% overpay, 3× a year",
    },
  ];

  return (
    <div className="hud-panel hud-corners grid gap-8 p-6 md:grid-cols-2 md:p-8">
      <div className="space-y-6">
        <Slider
          label="Monthly ad spend"
          value={monthlySpend}
          min={2_000}
          max={500_000}
          step={1_000}
          format={(v) => compactMoney(v)}
          onChange={setMonthlySpend}
        />
        <Slider
          label="Days before you'd notice an account stopped working"
          value={daysBlind}
          min={1}
          max={30}
          step={1}
          format={(v) => `${v} day${v === 1 ? "" : "s"}`}
          onChange={setDaysBlind}
        />
        <Slider
          label="Share of budget on creative that's been running a while"
          value={fatiguedShare}
          min={0}
          max={70}
          step={5}
          format={(v) => `${v}%`}
          onChange={setFatiguedShare}
        />

        <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
          <span className="text-foreground">How this is calculated:</span> outage waste is your
          daily spend × days blind × {OUTAGES_PER_YEAR} outages a year. Fatigue waste counts the
          performance gap on worn-out creative, not the whole slice. Drift waste assumes a 25%
          overpay caught half a month late, three times a year. Conservative on purpose — the point
          is a number you can sanity-check, not a scary one.
        </div>
      </div>

      <div className="flex flex-col justify-center">
        <div className="text-center">
          <div className="hud-label">Leaking out of a {compactMoney(monthlySpend)}/mo budget</div>
          <div className="mt-2 flex items-center justify-center gap-2">
            <Flame className="h-7 w-7 text-magenta" />
            <span className="hud-value text-4xl font-bold text-gradient md:text-5xl">
              {compactMoney(shown)}
            </span>
          </div>
          <div className="mt-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            a year · {compactMoney(shownMonthly)} a month
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {rows.map((r) => {
            const Icon = r.icon;
            return (
              <div key={r.label} className="flex items-start gap-3 border-t border-border/40 pt-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-cyan" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs">{r.label}</div>
                  <div className="hud-label mt-0.5">{r.note}</div>
                </div>
                <span className="hud-value shrink-0 text-sm font-bold">
                  {compactMoney(r.value)}
                </span>
              </div>
            );
          })}
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Every line above is something the Spend Watch checks for you — the first two every day.
        </p>
      </div>
    </div>
  );
}
