"use client";

import * as React from "react";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { computeLeak, LEAK_DEFAULTS, NOT_MEASURED, type LeakInputs } from "@/lib/leak";
import { upgradeByKey } from "@/lib/upgrades";
import { formatCurrency, cn } from "@/lib/utils";
import { pulse } from "@/components/marketing/pulse";

/**
 * Four sliders, the visitor's own arithmetic, and a verdict that is allowed to
 * be "don't buy this".
 *
 * The parent's Growth Calculator projects forward from ad spend and states its
 * model out loud. This runs backwards from calls already coming in, so there
 * is no model to state — every figure is the four inputs multiplied. The
 * recovery assumption is the one judgement call in it, so it is a slider
 * rather than a constant, and it starts at half.
 */

const FIX = upgradeByKey("voice-employee")!;

interface SliderDef {
  key: keyof LeakInputs;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  tone: string;
}

const SLIDERS: SliderDef[] = [
  {
    key: "callsPerMonth",
    label: "Inbound calls a month",
    min: 10,
    max: 800,
    step: 10,
    format: (v) => String(v),
    tone: "text-cyan",
  },
  {
    key: "missedPct",
    label: "Share that reach voicemail",
    min: 0,
    max: 80,
    step: 1,
    format: (v) => `${v}%`,
    tone: "text-violet",
  },
  {
    key: "jobValue",
    label: "Average job value",
    min: 10000,
    max: 1500000,
    step: 5000,
    format: (v) => formatCurrency(v),
    tone: "text-magenta",
  },
  {
    key: "closeRate",
    label: "Close rate on answered calls",
    min: 5,
    max: 90,
    step: 1,
    format: (v) => `${v}%`,
    tone: "text-gold",
  },
  {
    key: "recovery",
    label: "Share of missed calls actually winnable",
    min: 0.1,
    max: 1,
    step: 0.05,
    format: (v) => `${Math.round(v * 100)}%`,
    tone: "text-signal",
  },
];

export function LeakCalculator() {
  const [inputs, setInputs] = React.useState<LeakInputs>(LEAK_DEFAULTS);
  const result = React.useMemo(() => computeLeak(inputs, FIX.price), [inputs]);

  // One beacon when they stop dragging, not one per pixel.
  const settle = React.useRef<ReturnType<typeof setTimeout>>();
  function set(key: keyof LeakInputs, value: number) {
    setInputs((prev) => ({ ...prev, [key]: value }));
    clearTimeout(settle.current);
    settle.current = setTimeout(() => pulse("gap_finder", "leak_calc"), 900);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_22rem] lg:items-start">
      {/* Inputs */}
      <div className="phx-card p-7">
        <div className="eyebrow text-muted-foreground">Your numbers</div>
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing is sent anywhere. Every figure on the right is these five multiplied.
        </p>

        <div className="mt-7 space-y-6">
          {SLIDERS.map((s) => (
            <div key={s.key}>
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor={`leak-${s.key}`} className="text-sm text-foreground/85">
                  {s.label}
                </label>
                <span className={cn("text-lg font-bold tracking-tight", s.tone)}>
                  {s.format(inputs[s.key])}
                </span>
              </div>
              <input
                id={`leak-${s.key}`}
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={inputs[s.key]}
                onChange={(e) => set(s.key, Number(e.target.value))}
                className="mt-2.5 w-full accent-[hsl(var(--hud-cyan))]"
              />
            </div>
          ))}
        </div>

        {/* Named, not buried. A calculator that quantifies one gap and stays
            quiet about the rest implies the rest are worth nothing. */}
        <div className="mt-7 rounded-xl border border-white/[0.06] bg-black/25 p-4">
          <div className="eyebrow mb-2 text-[0.6rem] text-muted-foreground">
            What this does not measure
          </div>
          <ul className="space-y-1.5">
            {NOT_MEASURED.map((n) => (
              <li key={n} className="text-[0.78rem] leading-relaxed text-muted-foreground">
                — {n}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Verdict */}
      <aside className="phx-card p-7 lg:sticky lg:top-24">
        <div className="eyebrow text-muted-foreground">Walking out the door</div>
        <div className="mt-2 text-4xl font-bold tracking-tight text-gradient">
          {formatCurrency(result.monthlyLeak)}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          a month · {formatCurrency(result.annualLeak)} a year
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {result.missedCalls} calls to voicemail, at your close rate and your job value.
        </p>

        <div className="mt-5 space-y-2 border-t border-white/[0.07] pt-5 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground">Winnable</span>
            <span className="font-semibold">{formatCurrency(result.recoverable)}/mo</span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground">{FIX.name}</span>
            <span className="font-semibold">−{formatCurrency(FIX.price)}/mo</span>
          </div>
        </div>

        {/* The branch that makes this honest. */}
        {result.underwater ? (
          <div className="mt-5 rounded-xl border border-gold/30 bg-gold/[0.06] p-4">
            <div className="flex items-center gap-2 text-gold">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              <span className="text-sm font-semibold">
                {result.coverage.toFixed(1)}× — doesn&apos;t pay yet
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              At these numbers the winnable work doesn&apos;t cover the operator. Don&apos;t buy it.
              Move the sliders to what next year looks like and it will tell you when it does.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-5 rounded-xl border border-signal/30 bg-signal/[0.06] p-4">
              <div className="text-sm font-semibold text-signal">
                {result.coverage.toFixed(1)}× coverage
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                The winnable work covers the operator {result.coverage.toFixed(1)} times over on
                your own figures. That is arithmetic, not a forecast.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent("phx:toggle-upgrade", { detail: FIX.key }),
                );
                pulse("upgrade_added", FIX.key);
                document.querySelector("#enquiry")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="pill-primary mt-4 w-full text-sm"
            >
              Add {FIX.name} <ArrowRight className="h-4 w-4" />
            </button>
          </>
        )}
      </aside>
    </div>
  );
}
