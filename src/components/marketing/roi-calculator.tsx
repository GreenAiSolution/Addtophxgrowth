"use client";

import * as React from "react";
import { TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

/**
 * ROI calculator — instant, client-side, no signup wall.
 * Projections use the same illustrative benchmarks shown in the stats band
 * (−34% CPL, faster lead response). Clearly labeled as estimates.
 */

const CPL_REDUCTION = 0.34; // illustrative benchmark shown on the page
const SPEED_TO_LEAD_LIFT = 0.21; // conservative close-rate lift from instant follow-up

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
  const [adSpend, setAdSpend] = React.useState(15000); // $/mo
  const [cpl, setCpl] = React.useState(45); // $
  const [closeRate, setCloseRate] = React.useState(10); // %
  const [dealValue, setDealValue] = React.useState(2500); // $

  const leadsNow = adSpend / cpl;
  const customersNow = leadsNow * (closeRate / 100);
  const revenueNow = customersNow * dealValue;

  const cplAfter = cpl * (1 - CPL_REDUCTION);
  const leadsAfter = adSpend / cplAfter;
  const closeAfter = (closeRate / 100) * (1 + SPEED_TO_LEAD_LIFT);
  const customersAfter = leadsAfter * closeAfter;
  const revenueAfter = customersAfter * dealValue;

  const monthlyLift = revenueAfter - revenueNow;

  return (
    <div className="hud-panel hud-corners grid gap-8 p-6 md:grid-cols-2 md:p-8">
      <div className="space-y-6">
        <div>
          <h3 className="flex items-center gap-2 font-heading text-xl font-bold">
            <TrendingUp className="h-5 w-5 text-cyan" /> Run your numbers
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            What the cockpit could mean for your funnel.
          </p>
        </div>
        <Slider
          label="Monthly ad spend"
          value={adSpend}
          min={2000}
          max={200000}
          step={1000}
          format={(v) => formatCurrency(v * 100)}
          onChange={setAdSpend}
        />
        <Slider
          label="Current cost per lead"
          value={cpl}
          min={5}
          max={400}
          step={5}
          format={(v) => formatCurrency(v * 100)}
          onChange={setCpl}
        />
        <Slider
          label="Lead → customer close rate"
          value={closeRate}
          min={1}
          max={40}
          step={1}
          format={(v) => `${v}%`}
          onChange={setCloseRate}
        />
        <Slider
          label="Average customer value"
          value={dealValue}
          min={100}
          max={50000}
          step={100}
          format={(v) => formatCurrency(v * 100)}
          onChange={setDealValue}
        />
      </div>

      <div className="flex flex-col justify-center gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-border/60 bg-background/50 p-4">
            <div className="hud-label">Leads / mo</div>
            <div className="hud-value mt-1 text-2xl font-bold">
              {Math.round(leadsAfter)}
              <span className="ml-2 text-sm font-normal text-emerald-400">
                +{Math.round(leadsAfter - leadsNow)}
              </span>
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/50 p-4">
            <div className="hud-label">Projected CPL</div>
            <div className="hud-value mt-1 text-2xl font-bold">
              {formatCurrency(cplAfter * 100)}
              <span className="ml-2 text-sm font-normal text-emerald-400">−34%</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-cyan/40 bg-cyan/5 p-5 text-center shadow-hud">
          <div className="hud-label">Projected added revenue</div>
          <div className="hud-value mt-2 text-4xl font-bold text-gradient">
            {formatCurrency(monthlyLift * 100)}
            <span className="text-lg text-muted-foreground">/mo</span>
          </div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">
            ≈ {formatCurrency(monthlyLift * 12 * 100)} a year
          </div>
        </div>

        <p className="text-center font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground/60">
          Illustrative estimate — based on −34% CPL and +21% close-rate benchmarks. Not a guarantee.
        </p>
      </div>
    </div>
  );
}
