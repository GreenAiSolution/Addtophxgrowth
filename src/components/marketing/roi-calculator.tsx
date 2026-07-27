"use client";

import * as React from "react";
import { TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

/**
 * ROI calculator — instant, client-side, no signup wall.
 * Two projection levers, both surfaced in the footnote so the estimate is
 * legible rather than magic:
 *   1. cheaper leads (ad-ops: creative rotation, spend reallocation)
 *   2. more of those leads closing (agents qualify + follow up instantly)
 * Figures animate as the sliders move, so dragging shows the upside building.
 */

const CPL_REDUCTION = 0.45; // ad-ops brings cost per lead down
const CLOSE_RATE_LIFT = 0.35; // instant qualification + follow-up lifts close rate

/** Smoothly tween a number so dragging reads as motion, not jitter. */
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

/** $1.2B / $940K style — keeps large results readable on mobile. */
function compactMoney(dollars: number) {
  if (dollars >= 1_000_000_000) return `$${(dollars / 1_000_000_000).toFixed(1)}B`;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 10_000) return `$${Math.round(dollars / 1_000)}K`;
  return formatCurrency(dollars * 100);
}

/**
 * Past this much projected monthly upside the linear model stops being
 * meaningful, so we stop quoting a number and invite a real conversation.
 */
const MODEL_CEILING = 25_000_000;

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
      <div className="mb-1.5 flex items-center justify-between">
        <span className="hud-label">{label}</span>
        <span className="hud-value text-sm text-cyan">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[hsl(var(--hud-cyan))]"
      />
    </div>
  );
}

export function RoiCalculator() {
  const [adSpend, setAdSpend] = React.useState(40000); // $/mo
  const [cpl, setCpl] = React.useState(60); // $
  const [closeRate, setCloseRate] = React.useState(12); // %
  const [dealValue, setDealValue] = React.useState(8000); // $

  const leadsNow = adSpend / cpl;
  const revenueNow = leadsNow * (closeRate / 100) * dealValue;

  const cplAfter = cpl * (1 - CPL_REDUCTION);
  const leadsAfter = adSpend / cplAfter;
  const closeAfter = (closeRate / 100) * (1 + CLOSE_RATE_LIFT);
  const revenueAfter = leadsAfter * closeAfter * dealValue;

  const monthlyLift = revenueAfter - revenueNow;
  const beyondModel = monthlyLift >= MODEL_CEILING;

  // Animated read-outs
  const aLift = useAnimatedValue(monthlyLift);
  const aAnnual = useAnimatedValue(monthlyLift * 12);
  const aLeads = useAnimatedValue(leadsAfter);
  const aLeadsGain = useAnimatedValue(leadsAfter - leadsNow);
  const aCpl = useAnimatedValue(cplAfter);

  return (
    <div className="hud-panel hud-corners grid gap-8 p-6 md:grid-cols-2 md:p-8">
      <div className="space-y-6">
        <div>
          <h3 className="flex items-center gap-2 font-heading text-xl font-bold">
            <TrendingUp className="h-5 w-5 text-cyan" /> Run your numbers
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Drag to see what the cockpit could be worth on your funnel.
          </p>
        </div>
        <Slider
          label="Monthly ad spend"
          value={adSpend}
          min={5000}
          max={300000}
          step={2500}
          format={(v) => compactMoney(v)}
          onChange={setAdSpend}
        />
        <Slider
          label="Current cost per lead"
          value={cpl}
          min={10}
          max={1000}
          step={5}
          format={(v) => formatCurrency(v * 100)}
          onChange={setCpl}
        />
        <Slider
          label="Lead → customer close rate"
          value={closeRate}
          min={1}
          max={50}
          step={1}
          format={(v) => `${v}%`}
          onChange={setCloseRate}
        />
        <Slider
          label="Average customer value"
          value={dealValue}
          min={250}
          max={150000}
          step={250}
          format={(v) => compactMoney(v)}
          onChange={setDealValue}
        />
      </div>

      <div className="flex flex-col justify-center gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-border/60 bg-background/50 p-4">
            <div className="hud-label">Leads / mo</div>
            <div className="hud-value mt-1 text-2xl font-bold">
              {Math.round(aLeads).toLocaleString()}
              <span className="ml-2 text-sm font-normal text-emerald-400">
                +{Math.round(aLeadsGain).toLocaleString()}
              </span>
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/50 p-4">
            <div className="hud-label">Projected CPL</div>
            <div className="hud-value mt-1 text-2xl font-bold">
              {formatCurrency(aCpl * 100)}
              <span className="ml-2 text-sm font-normal text-emerald-400">
                −{Math.round(CPL_REDUCTION * 100)}%
              </span>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-lg border border-cyan/40 bg-cyan/5 p-6 text-center shadow-hud">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-cyan/5 via-transparent to-magenta/10" />
          {beyondModel ? (
            <>
              <div className="hud-label relative">Off the charts</div>
              <div className="relative mt-2 font-heading text-2xl font-bold leading-tight text-gradient">
                Your numbers are past what this estimator can model.
              </div>
              <p className="relative mt-2 text-sm text-muted-foreground">
                At your spend and deal size the upside deserves a real model, not a slider.
                Let&apos;s build it together.
              </p>
              <a
                href="#contact"
                className="relative mt-4 inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-hud transition-all hover:brightness-110"
              >
                Book a strategy call →
              </a>
            </>
          ) : (
            <>
              <div className="hud-label relative">Projected added revenue</div>
              <div className="hud-value relative mt-2 text-4xl font-bold leading-none text-gradient sm:text-5xl">
                {compactMoney(aLift)}
                <span className="text-lg font-normal text-muted-foreground">/mo</span>
              </div>
              <div className="relative mt-3 border-t border-cyan/20 pt-3">
                <span className="hud-label">First 12 months</span>
                <div className="hud-value mt-1 text-2xl font-bold text-cyan">
                  {compactMoney(aAnnual)}
                </div>
              </div>
            </>
          )}
        </div>

        <p className="text-center font-mono text-[0.6rem] leading-relaxed uppercase tracking-widest text-muted-foreground/60">
          Illustrative estimate from your inputs — assumes {Math.round(CPL_REDUCTION * 100)}% lower
          cost per lead and a {Math.round(CLOSE_RATE_LIFT * 100)}% higher close rate. Not a guarantee
          of results.
        </p>
      </div>
    </div>
  );
}
