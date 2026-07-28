"use client";

import * as React from "react";
import {
  OPERATORS,
  MANIFEST,
  AUTOMATION_LOOPS,
  UPGRADES,
  serviceByKey,
} from "@/lib/upgrades";
import { cn, formatCurrency } from "@/lib/utils";
import { Instrument, Figure } from "@/components/marketing/instrument";
import { pulse } from "@/components/marketing/pulse";

/**
 * INSTRUMENT 00 — THE COVERAGE MATRIX
 *
 * The first thing on the page, and it is an argument against buying anything.
 *
 * A visitor arriving at an upgrade counter assumes the counter wants to sell
 * them everything. This shows the opposite before a single price: every cell
 * PHX/GROWTH already covers, dark and dense, and the handful that are lit.
 * Squinting is enough — the covered cells outnumber the gaps by a wide margin,
 * and the layout refuses to hide it.
 *
 * WHY IT IS INTERACTIVE NOW
 *   The static version made the ratio argument and stopped. The question a
 *   visitor actually has next is "covered by *what*?", and a grid of unlabelled
 *   squares cannot answer it. Selecting a cell names the operator, the Manifest
 *   item or the loop responsible — which turns the picture from a claim about
 *   coverage into a checkable inventory.
 *
 * BLUEPRINTS
 *   Every cell derives from the same arrays the additive tests read, so the
 *   picture cannot drift from the rules. The counts are counted, never typed.
 */

type Band = "crew" | "desk" | "loops" | "gap";

interface Cell {
  key: string;
  label: string;
  band: Band;
  detail: string;
  /** Gaps only. */
  price?: number;
  attachedTo?: string;
}

const CELLS: Cell[] = [
  ...OPERATORS.map((o) => ({
    key: `crew-${o.name}`,
    label: o.name,
    band: "crew" as const,
    detail: o.covers,
  })),
  ...MANIFEST.map((m) => ({
    key: `desk-${m.n}`,
    label: m.title,
    band: "desk" as const,
    detail: m.detail,
  })),
  ...AUTOMATION_LOOPS.map((l) => ({
    key: `loop-${l.name}`,
    label: l.name,
    band: "loops" as const,
    detail: `${l.cadence} — ${l.detail}`,
  })),
  ...UPGRADES.map((u) => ({
    key: `gap-${u.key}`,
    label: u.name,
    band: "gap" as const,
    detail: u.fixes,
    price: u.price,
    attachedTo: serviceByKey(u.attachesTo)?.name ?? u.attachesTo,
  })),
];

const COVERED = CELLS.filter((c) => c.band !== "gap");
const GAPS = CELLS.filter((c) => c.band === "gap");

const BAND: Record<Band, { cell: string; on: string; dot: string; name: string }> = {
  crew: {
    cell: "border-violet/15 bg-violet/[0.04] hover:border-violet/40",
    on: "border-violet bg-violet/20",
    dot: "bg-violet",
    name: "Your AI staff",
  },
  desk: {
    cell: "border-cyan/15 bg-cyan/[0.04] hover:border-cyan/40",
    on: "border-cyan bg-cyan/20",
    dot: "bg-cyan",
    name: "Systems running",
  },
  loops: {
    cell: "border-signal/15 bg-signal/[0.04] hover:border-signal/40",
    on: "border-signal bg-signal/20",
    dot: "bg-signal",
    name: "Always-on automations",
  },
  gap: {
    cell: "border-gold/50 bg-gold/[0.14] shadow-[0_0_14px_-2px_hsl(var(--hud-gold)/0.5)] hover:bg-gold/25",
    on: "border-gold bg-gold/35",
    dot: "bg-gold",
    name: "Nobody does this",
  },
};

export function CoverageMatrix() {
  const [selected, setSelected] = React.useState<Cell | null>(null);

  return (
    <Instrument
      index={0}
      id="matrix"
      name="What You&rsquo;re Already Paying For"
      reads="Every person and system already working your account — and the handful of jobs nobody is doing."
    >
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="phx-card fx-panel p-5 md:p-6">
          <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2">
            {(["crew", "desk", "loops", "gap"] as Band[]).map((b) => (
              <span key={b} className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-sm", BAND[b].dot, b !== "gap" && "opacity-40")} />
                <span
                  className={cn(
                    "eyebrow text-[0.56rem]",
                    b === "gap" ? "text-gold" : "text-muted-foreground",
                  )}
                >
                  {BAND[b].name}
                </span>
              </span>
            ))}
          </div>

          <div
            className="grid grid-cols-[repeat(auto-fill,minmax(2.6rem,1fr))] gap-1.5"
            role="group"
            aria-label="Coverage matrix"
          >
            {CELLS.map((c) => {
              const on = selected?.key === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${c.label} — ${BAND[c.band].name}`}
                  onClick={() => {
                    setSelected(on ? null : c);
                    if (c.band === "gap") pulse("upgrade_added", c.key);
                  }}
                  className={cn(
                    "aspect-square rounded-[3px] border transition-all duration-150",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan",
                    on ? BAND[c.band].on : BAND[c.band].cell,
                    // Only the gaps breathe. The covered cells are settled.
                    c.band === "gap" && !on && "fx-breathe",
                  )}
                />
              );
            })}
          </div>

          <p className="mt-5 text-[0.95rem] leading-relaxed">
            <span className="font-semibold">{COVERED.length} covered.</span>{" "}
            <span className="font-semibold text-gold">{GAPS.length} not.</span>{" "}
            <span className="text-muted-foreground">
  Nearly everything is handled. Tap any square to see who handles it.
            </span>
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div
            className={cn(
              "min-h-[11rem] rounded-2xl border p-5 transition-colors",
              selected?.band === "gap"
                ? "border-gold/40 bg-gold/[0.05]"
                : "border-white/[0.07] bg-black/20",
            )}
            aria-live="polite"
          >
            {selected ? (
              <>
                <div
                  className={cn(
                    "eyebrow text-[0.58rem]",
                    selected.band === "gap" ? "text-gold" : "text-muted-foreground",
                  )}
                >
                  {BAND[selected.band].name}
                </div>
                <h3 className="mt-2 text-xl font-bold tracking-tight">{selected.label}</h3>
                <p className="mt-2 text-[0.88rem] leading-relaxed text-muted-foreground">
                  {selected.detail}
                </p>
                {selected.band === "gap" ? (
                  <p className="mt-3 font-mono text-[0.78rem] tabular-nums text-gold">
                    {formatCurrency(selected.price!)}/mo · on {selected.attachedTo}
                  </p>
                ) : (
                  <p className="mt-3 text-[0.78rem] text-signal">
                    Already covered. You don&rsquo;t need to buy anything for this.
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="eyebrow text-[0.58rem] text-muted-foreground">Select a square</div>
                <p className="mt-2 text-[0.88rem] leading-relaxed text-muted-foreground">
                  The dark squares are people and systems already working your account. The lit
                  ones are the only territory this site claims.
                </p>
              </>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 rounded-xl border border-white/[0.07] bg-black/20 p-4">
            <Figure value={String(OPERATORS.length)} caption="AI staff on your account" tone="magenta" />
            <Figure value={String(MANIFEST.length + AUTOMATION_LOOPS.length)} caption="Systems already running" tone="cyan" />
            <Figure value={String(GAPS.length)} caption="Jobs nobody is doing" tone="gold" />
          </div>
        </div>
      </div>
    </Instrument>
  );
}
