"use client";

import * as React from "react";
import { cn, formatCurrency } from "@/lib/utils";
import {
  UPGRADES,
  BUNDLES,
  PARENT_SERVICES,
  bundleMembers,
  bundleListPrice,
  bundleSaving,
  serviceByKey,
} from "@/lib/upgrades";
import { Instrument, Figure } from "@/components/marketing/instrument";
import { usePlayground } from "@/components/marketing/playground";

/**
 * INSTRUMENT 06 — THE STACK COMPOSER
 *
 * Where six readouts become one number.
 *
 * Every instrument above ends by adding something here, so by the time a
 * visitor arrives the stack is usually already half built by their own
 * answers. What this adds is the thing a list of line items cannot show: which
 * of the chosen upgrades reinforce each other, and where the bundle price
 * quietly beats what they have assembled by hand.
 *
 * THE BUNDLE DETECTION IS THE HONEST BIT
 *   If the selection exactly matches a bundle, this says so and quotes the
 *   bundle — which is always cheaper. Letting somebody assemble the Answer
 *   Stack à la carte and charging them the à la carte total would be
 *   overcharging by omission, and it is the sort of thing nobody ever notices
 *   because the arithmetic is correct.
 *
 * PRICING
 *   Every figure resolves through the catalogue. Nothing here is authoritative
 *   — the browser posts keys and `/api/reserve` recomputes the number from the
 *   same arrays. A posted price is user input.
 */

/**
 * Which upgrades compound, and why.
 *
 * Derived from the bundles rather than hand-drawn: two upgrades are linked
 * precisely when a bundle exists that contains both. That means the diagram
 * cannot claim a synergy the catalogue does not sell, and adding a bundle
 * redraws the edges automatically.
 */
function edgesFor(keys: string[]): [string, string][] {
  const out: [string, string][] = [];
  for (const b of BUNDLES) {
    const inside = b.members.filter((m) => keys.includes(m));
    for (let i = 0; i < inside.length; i++) {
      for (let j = i + 1; j < inside.length; j++) {
        const pair: [string, string] = [inside[i]!, inside[j]!];
        if (!out.some(([a, c]) => (a === pair[0] && c === pair[1]) || (a === pair[1] && c === pair[0]))) {
          out.push(pair);
        }
      }
    }
  }
  return out;
}

const SERVICE_TONE: Record<string, { dot: string; ring: string; text: string }> = {
  "premium-ai-ads": { dot: "bg-magenta", ring: "border-magenta/50", text: "text-magenta" },
  "ai-employees": { dot: "bg-violet", ring: "border-violet/50", text: "text-violet" },
  "website-creation": { dot: "bg-cyan", ring: "border-cyan/50", text: "text-cyan" },
};

export function StackComposer() {
  const { picked, toggle } = usePlayground();

  const chosen = UPGRADES.filter((u) => picked.includes(u.key));
  const monthly = chosen.filter((u) => u.billing === "monthly").reduce((s, u) => s + u.price, 0);
  const oneTime = chosen.filter((u) => u.billing === "one_time").reduce((s, u) => s + u.price, 0);
  const edges = edgesFor(picked);

  /** An exact bundle match always wins — see the note above. */
  const match = BUNDLES.find(
    (b) => b.members.length === picked.length && b.members.every((m) => picked.includes(m)),
  );
  const nearMiss = BUNDLES.filter(
    (b) => !match && picked.length > 0 && picked.every((k) => b.members.includes(k)) && b.members.length > picked.length,
  ).sort((a, b) => a.members.length - b.members.length)[0];

  return (
    <Instrument
      index={6}
      id="compose"
      name="The Stack Composer"
      reads="How the upgrades you picked reinforce each other, and what the honest total is."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* ---- pick, grouped by the service they bolt onto ---- */}
        <div className="space-y-5">
          {PARENT_SERVICES.map((service) => {
            const mine = UPGRADES.filter((u) => u.attachesTo === service.key);
            if (mine.length === 0) return null;
            const tone = SERVICE_TONE[service.key]!;
            return (
              <div key={service.key} className="phx-card fx-panel p-5">
                <div className="flex items-center gap-2.5">
                  <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
                  <span className="eyebrow text-[0.58rem] text-muted-foreground">
                    On {service.name}
                  </span>
                  <span className="ml-auto font-mono text-[0.65rem] text-muted-foreground/60">
                    {service.priceLabel}
                  </span>
                </div>

                <ul className="mt-3 space-y-1.5">
                  {mine.map((u) => {
                    const on = picked.includes(u.key);
                    return (
                      <li key={u.key}>
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggle(u.key)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan",
                            on
                              ? cn(tone.ring, "bg-white/[0.05]")
                              : "border-white/[0.07] bg-white/[0.015] hover:border-white/20",
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 shrink-0 rounded-full transition-colors",
                              on ? tone.dot : "bg-white/20",
                            )}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[0.88rem] font-medium">{u.name}</span>
                            <span className="mt-0.5 block truncate text-[0.72rem] text-muted-foreground">
                              {u.fixes}
                            </span>
                          </span>
                          <span className="shrink-0 font-mono text-[0.75rem] tabular-nums text-muted-foreground">
                            {formatCurrency(u.price)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>

        {/* ---- what it adds up to ---- */}
        <div className="flex flex-col gap-4">
          <div className="phx-card fx-panel min-h-[13rem] p-5 md:p-6">
            <div className="eyebrow text-[0.58rem] text-muted-foreground">Your stack</div>

            {chosen.length === 0 ? (
              <p className="mt-4 text-[0.9rem] leading-relaxed text-muted-foreground">
                Nothing selected. The instruments above add to this as they find things — or pick
                by hand on the left.
              </p>
            ) : (
              <>
                <ul className="mt-4 space-y-2">
                  {chosen.map((u) => {
                    const tone = SERVICE_TONE[u.attachesTo]!;
                    const linked = edges.filter((e) => e.includes(u.key)).length;
                    return (
                      <li
                        key={u.key}
                        className="flex items-baseline gap-3 border-b border-white/[0.05] pb-2 last:border-0"
                      >
                        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone.dot)} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[0.88rem]">{u.name}</span>
                          {linked > 0 && (
                            <span className="text-[0.68rem] text-signal">
                              compounds with {linked} other{linked === 1 ? "" : "s"} in your stack
                            </span>
                          )}
                          <span className="block text-[0.68rem] text-muted-foreground">
                            on {serviceByKey(u.attachesTo)?.name}
                          </span>
                        </span>
                        <span className="font-mono text-[0.78rem] tabular-nums">
                          {formatCurrency(u.price)}
                          <span className="text-[0.62rem] text-muted-foreground">
                            {u.billing === "monthly" ? "/mo" : " once"}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t border-white/[0.08] pt-4">
                  {monthly > 0 && (
                    <span className="font-mono text-2xl font-bold tabular-nums">
                      {formatCurrency(monthly)}
                      <span className="text-sm font-normal text-muted-foreground">/mo</span>
                    </span>
                  )}
                  {oneTime > 0 && (
                    <span className="font-mono text-lg font-bold tabular-nums text-muted-foreground">
                      + {formatCurrency(oneTime)} once
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* The bundle arithmetic, stated rather than hidden. */}
          {match && (
            <div className="rounded-2xl border border-gold/40 bg-gold/[0.06] p-5">
              <div className="eyebrow text-[0.58rem] text-gold">That is a bundle</div>
              <p className="mt-2 text-[0.92rem] leading-relaxed">
                Those exact {match.members.length} are <strong>{match.name}</strong> at{" "}
                <span className="font-mono tabular-nums">{formatCurrency(match.price)}/mo</span> —{" "}
                <span className="text-signal">
                  {formatCurrency(bundleSaving(match))}/mo less
                </span>{" "}
                than the {formatCurrency(bundleListPrice(match))} above. We will quote the bundle.
              </p>
              <p className="mt-2 text-[0.78rem] leading-relaxed text-muted-foreground">
                {match.rationale}
              </p>
            </div>
          )}

          {nearMiss && (
            <div className="rounded-2xl border border-white/[0.09] bg-black/20 p-5">
              <div className="eyebrow text-[0.58rem] text-muted-foreground">One step away</div>
              <p className="mt-2 text-[0.9rem] leading-relaxed">
                Adding{" "}
                {bundleMembers(nearMiss)
                  .filter((u) => !picked.includes(u.key))
                  .map((u) => u.name)
                  .join(" and ")}{" "}
                makes this <strong>{nearMiss.name}</strong> at{" "}
                <span className="font-mono tabular-nums">{formatCurrency(nearMiss.price)}/mo</span>.
              </p>
              <button
                type="button"
                onClick={() =>
                  bundleMembers(nearMiss)
                    .filter((u) => !picked.includes(u.key))
                    .forEach((u) => toggle(u.key))
                }
                className="pill-ghost mt-3 text-sm"
              >
                Complete the stack
              </button>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 rounded-xl border border-white/[0.07] bg-black/20 p-4">
            <Figure value={String(chosen.length)} caption="Upgrades chosen" tone="cyan" />
            <Figure value={String(edges.length)} caption="Reinforcing pairs" tone="signal" />
            <Figure
              value={match ? formatCurrency(bundleSaving(match)) : "—"}
              caption="Saved by bundling"
              tone="gold"
            />
          </div>
        </div>
      </div>
    </Instrument>
  );
}
