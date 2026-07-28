"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  CHANNEL_DEFAULTS,
  readMarginal,
  leadsAt,
  type ChannelInput,
} from "@/lib/instruments/marginal";
import { AUTOMATION_LOOPS } from "@/lib/upgrades";
import { Instrument, Readout, Figure, Dial } from "@/components/marketing/instrument";
import { usePlayground } from "@/components/marketing/playground";
import { FxCanvas } from "@/components/marketing/fx";

/**
 * INSTRUMENT 05 — THE MARGINAL DOLLAR
 *
 * The instrument that sells nothing, and the reason the other six are worth
 * reading.
 *
 * Owners compare channels on average cost per lead. It is the wrong number and
 * the only one anybody publishes. Average CPL describes what the whole budget
 * did; the decision in front of you is about the *next* dollar, and the next
 * dollar into a saturated channel buys far less than the average implies. Two
 * channels can post an identical average and one of them be finished.
 *
 * This draws both curves and marks both points, so the gap between them is a
 * distance on a screen rather than a sentence somebody has to trust.
 *
 * AND THEN IT DECLINES THE SALE
 *   The verdict is that PHX/GROWTH already does this — Autonomous Budget
 *   Allocation runs it every fifteen minutes against live spend, which is a
 *   thing no visitor dragging a slider can do. There is no upgrade attached
 *   and there is not going to be one.
 *
 *   That is not modesty. Every owner reading this page has been through a
 *   funnel that diagnosed a problem it happened to sell the cure for, and they
 *   discount everything they read afterwards. One instrument that says "not
 *   ours" is what makes the other six credible.
 *
 * THE CURVATURE SLIDER STARTS AT LINEAR
 *   At 1.0 the model has no diminishing returns and the tool reports no
 *   headroom at all — the visitor has to assert the curve before it will draw
 *   one. An earlier version solved the optimum at 1.0 anyway and reported 45
 *   free leads on the default inputs, a number produced entirely by the
 *   assumption and presented as a finding. A test now fails if it ever does
 *   that again.
 */

const COLORS = ["#22d3ee", "#8b5cf6", "#ec4899", "#f0b429"];

export function MarginalDollar() {
  const { channels, setChannels, exponent, setExponent, justSeeded } = usePlayground();
  const reading = React.useMemo(() => readMarginal(channels, exponent), [channels, exponent]);

  function edit(key: string, patch: Partial<ChannelInput>) {
    setChannels((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  const loop = AUTOMATION_LOOPS[0]!;

  return (
    <Instrument
      index={5}
      id="marginal"
      name="Where Your Next Ad Dollar Goes"
      reads="Which channel deserves your next dollar. It&rsquo;s almost never the one with the best average — here&rsquo;s why."
    >
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className={cn("phx-card fx-panel flex flex-col p-5 md:p-6", justSeeded && "fx-sheen")}>
          <FxCanvas
            className="h-[20rem] w-full"
            deps={[reading]}
            render={(ctx, w, h, t) => {
              const pad = { l: 46, r: 12, t: 14, b: 26 };
              const plotW = w - pad.l - pad.r;
              const plotH = h - pad.t - pad.b;
              const live = reading.channels.filter((c) => !c.idle);
              if (live.length === 0 || plotW <= 0 || plotH <= 0) return;

              const maxSpend = Math.max(...live.map((c) => c.spend)) * 1.8;
              const maxLeads = Math.max(
                ...live.map((c) =>
                  leadsAt(maxSpend, c.leads / Math.pow(c.spend, reading.exponent), reading.exponent),
                ),
              );
              if (!Number.isFinite(maxLeads) || maxLeads <= 0) return;

              const X = (s: number) => pad.l + (s / maxSpend) * plotW;
              const Y = (l: number) => pad.t + plotH - (l / maxLeads) * plotH;

              ctx.strokeStyle = "rgba(255,255,255,0.05)";
              ctx.lineWidth = 1;
              ctx.font = "9px ui-monospace, monospace";
              ctx.fillStyle = "rgba(255,255,255,0.35)";
              for (let i = 0; i <= 4; i++) {
                const y = pad.t + (plotH * i) / 4;
                ctx.beginPath();
                ctx.moveTo(pad.l, y);
                ctx.lineTo(w - pad.r, y);
                ctx.stroke();
                ctx.textAlign = "right";
                ctx.textBaseline = "middle";
                ctx.fillText(String(Math.round((maxLeads * (4 - i)) / 4)), pad.l - 6, y);
              }
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillText("$0", pad.l, h - pad.b + 6);
              ctx.fillText(`$${Math.round(maxSpend / 1000)}k/mo`, w - pad.r, h - pad.b + 6);

              // Curves draw themselves in on first paint, then hold.
              const grow = Math.min(1, t / 0.9);

              live.forEach((c, i) => {
                const color = COLORS[i % COLORS.length]!;
                const k = c.leads / Math.pow(c.spend, reading.exponent);

                ctx.beginPath();
                for (let px = 0; px <= plotW * grow; px += 2) {
                  const sp = (px / plotW) * maxSpend;
                  const l = leadsAt(sp, k, reading.exponent);
                  if (px === 0) ctx.moveTo(X(sp), Y(l));
                  else ctx.lineTo(X(sp), Y(l));
                }
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.globalAlpha = 0.9;
                ctx.stroke();

                // A soft glow under each curve, so three lines stay separable.
                ctx.globalAlpha = 0.1;
                ctx.lineWidth = 7;
                ctx.stroke();
                ctx.globalAlpha = 1;
                ctx.lineWidth = 2;

                // Where they are today, with a slow beacon.
                const beat = 0.5 + Math.sin(t * 2 + i) * 0.5;
                ctx.beginPath();
                ctx.arc(X(c.spend), Y(c.leads), 4.5, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
                ctx.beginPath();
                ctx.arc(X(c.spend), Y(c.leads), 5 + beat * 6, 0, Math.PI * 2);
                ctx.strokeStyle = color;
                ctx.globalAlpha = (1 - beat) * 0.5;
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.globalAlpha = 1;

                // Where the maths would put them, and the money moving there.
                if (!reading.neutral && Math.abs(c.delta) > c.spend * 0.02) {
                  const sl = leadsAt(c.suggested, k, reading.exponent);
                  ctx.beginPath();
                  ctx.arc(X(c.suggested), Y(sl), 4.5, 0, Math.PI * 2);
                  ctx.strokeStyle = color;
                  ctx.lineWidth = 1.75;
                  ctx.stroke();

                  ctx.beginPath();
                  ctx.setLineDash([3, 3]);
                  ctx.lineDashOffset = -t * 14;
                  ctx.moveTo(X(c.spend), Y(c.leads));
                  ctx.lineTo(X(c.suggested), Y(sl));
                  ctx.strokeStyle = color;
                  ctx.globalAlpha = 0.6;
                  ctx.lineWidth = 1.5;
                  ctx.stroke();
                  ctx.setLineDash([]);
                  ctx.lineDashOffset = 0;
                  ctx.globalAlpha = 1;
                }
              });
            }}
          />
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5 text-[0.68rem] text-muted-foreground">
            {reading.channels
              .filter((c) => !c.idle)
              .map((c, i) => (
                <span key={c.key} className="flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                  {c.name}
                </span>
              ))}
            <span className="ml-auto">leads a month vs what you spend a month</span>
          </div>

          <div className="mt-auto border-t border-white/[0.07] pt-5">
            <Dial
              label="How quickly does a channel run out of room?"
              hint={
                reading.neutral
                  ? "Right now you're saying a channel never runs out of room — that you could put $1m into Meta and keep the same cost per lead. Nobody believes that, so this tool refuses to guess. Drag it left."
                  : "This is your guess, not our data. Whatever you set, the curves still run exactly through the real numbers you typed above."
              }
              value={exponent}
              display={reading.neutral ? "Never runs out" : exponent < 0.55 ? "Runs out fast" : "Runs out slowly"}
              min={0.3}
              max={1}
              step={0.01}
              onChange={setExponent}
            />
          </div>
        </div>

        <div>
          <div className="space-y-3">
            {channels.map((c) => {
              const r = reading.channels.find((x) => x.key === c.key)!;
              return (
                <div key={c.key} className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{c.name}</span>
                    {!r.idle && !reading.neutral && Math.abs(r.delta) > c.spend * 0.02 && (
                      <span
                        className={cn(
                          "font-mono text-[0.72rem] tabular-nums",
                          r.delta > 0 ? "text-signal" : "text-gold",
                        )}
                      >
                        {r.delta > 0 ? "+" : "−"}${Math.abs(Math.round(r.delta)).toLocaleString()}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-[0.7rem] text-muted-foreground">You spend / month</span>
                      <input
                        type="number"
                        min={0}
                        value={c.spend}
                        onChange={(e) => edit(c.key, { spend: Math.max(0, Number(e.target.value)) })}
                        className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 font-mono text-sm tabular-nums outline-none focus:border-cyan/50"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[0.7rem] text-muted-foreground">You get / month</span>
                      <input
                        type="number"
                        min={0}
                        value={c.leads}
                        onChange={(e) => edit(c.key, { leads: Math.max(0, Number(e.target.value)) })}
                        className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 font-mono text-sm tabular-nums outline-none focus:border-cyan/50"
                      />
                    </label>
                  </div>

                  {!r.idle && (
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-white/[0.06] pt-3 font-mono text-[0.72rem] tabular-nums">
                      <span className="text-muted-foreground">
                        avg lead ${r.averageCpl.toFixed(0)}
                      </span>
                      <span className={reading.neutral ? "text-muted-foreground" : "text-gold"}>
                        NEXT lead ${Number.isFinite(r.marginalCpl) ? r.marginalCpl.toFixed(0) : "—"}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3 rounded-xl border border-white/[0.07] bg-black/20 p-4">
            <Figure
              value={`$${reading.blendedCpl.toFixed(0)}`}
              caption="Average cost per lead"
              tone="cyan"
            />
            <Figure value={String(Math.round(reading.totalLeads))} caption="Leads a month today" />
            <Figure
              value={reading.neutral ? "—" : `+${Math.round(reading.headroom)}`}
              caption="Extra leads for the same money"
              tone={reading.neutral ? "plain" : "signal"}
            />
          </div>
        </div>
      </div>

      <Readout
        verdict="covered"
        headline={
          reading.neutral
            ? "This tool is deliberately telling you nothing yet."
            : `On your own assumption, the same budget could be worth about ${Math.round(reading.headroom)} more leads a month — just moved around.`
        }
        body={
          reading.neutral
            ? "You've told it channels never run out of room. If that were true, moving money around couldn't possibly help — so rather than invent a number, it says nothing. Drag the slider left to what you actually believe and watch it change."
            : `That number comes from your assumption, not from our data. And it's exactly what ${loop.name} already does on your account — ${loop.cadence.toLowerCase()}, on live spend instead of last month's spreadsheet. We're not going to sell you a worse version of something you already pay for.`
        }
      />
    </Instrument>
  );
}
