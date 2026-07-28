"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { INTENTS, QUERIES, readFan, fanLayout, type QueryIntent } from "@/lib/instruments/queries";
import type { EntityAnswers } from "@/lib/instruments/entity";
import { Instrument, Readout, Figure } from "@/components/marketing/instrument";
import { FxCanvas } from "@/components/marketing/fx";

/**
 * INSTRUMENT 02 — THE QUERY FAN
 *
 * Instrument 01 shows what a model can determine about you. This shows what
 * that costs, and it is the one that makes people wince.
 *
 * Every question an assistant gets asked carries a silent filter. "Open now"
 * filters on hours. "Under five hundred" filters on price range. "Licensed"
 * filters on a credential. A business missing that attribute is not ranked
 * badly for the question — it is removed from the candidate set before ranking
 * begins. Owners understand the first idea instantly and almost never the
 * second, and the difference between them is the difference between "improve
 * your listing" and "you are not in the room".
 *
 * Reads directly off the Inspector's answers, so toggling a single attribute
 * up there lights a wedge down here. That linkage is the point of a playground
 * rather than six separate forms.
 *
 * THE SWEEP IS DECORATION AND THE LABELS ARE NOT
 *   The radar sweep is a rotating gradient and nothing depends on it. Every
 *   node is also a row in the list beside the canvas, which is what a screen
 *   reader and a reduced-motion visitor get.
 */

const HUB = "#22d3ee";

export function QueryFan({ answers }: { answers: EntityAnswers }) {
  const reading = React.useMemo(() => readFan(answers), [answers]);
  const nodes = React.useMemo(() => fanLayout(reading), [reading]);
  const [focus, setFocus] = React.useState<string | null>(null);

  return (
    <Instrument
      index={2}
      id="fan"
      name="The Query Fan"
      reads="Which of the questions an assistant gets asked you are currently a candidate for — and which quietly exclude you."
    >
      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <div className="phx-card fx-panel relative flex flex-col justify-center overflow-hidden p-5 md:p-6">
          <FxCanvas
            className="mx-auto aspect-[4/3] w-full max-w-[34rem]"
            deps={[reading, focus]}
            render={(ctx, w, h, t) => {
              const cx = w / 2;
              const cy = h * 0.78;
              const R = Math.min(w * 0.44, h * 0.72);

              // Range rings.
              ctx.strokeStyle = "rgba(255,255,255,0.055)";
              ctx.lineWidth = 1;
              for (const f of [0.4, 0.62, 0.84, 1]) {
                ctx.beginPath();
                ctx.arc(cx, cy, R * f, -Math.PI * 1.25, Math.PI * 0.25);
                ctx.stroke();
              }

              // The sweep — a rotating wedge, purely atmospheric.
              const sweep = (-t * 0.55) % (Math.PI * 2);
              const grad = ctx.createConicGradient?.(sweep, cx, cy);
              if (grad) {
                grad.addColorStop(0, "rgba(34,211,238,0.16)");
                grad.addColorStop(0.06, "rgba(34,211,238,0)");
                grad.addColorStop(1, "rgba(34,211,238,0)");
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.arc(cx, cy, R, -Math.PI * 1.25, Math.PI * 0.25);
                ctx.closePath();
                ctx.clip();
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, w, h);
                ctx.restore();
              }

              // Spokes and nodes.
              for (const n of nodes) {
                const hue = INTENTS[n.intent].hue;
                const x = cx + Math.cos(n.angle) * R * n.reach;
                const y = cy + Math.sin(n.angle) * R * n.reach;
                const hot = focus === n.text;

                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(x, y);
                if (n.winnable) {
                  ctx.strokeStyle = `hsla(${hue}, 85%, 62%, ${hot ? 0.95 : 0.42})`;
                  ctx.lineWidth = hot ? 2.2 : 1.2;
                  ctx.setLineDash([]);
                } else {
                  ctx.strokeStyle = `hsla(0, 0%, 100%, ${hot ? 0.3 : 0.1})`;
                  ctx.lineWidth = 1;
                  ctx.setLineDash([2, 5]);
                }
                ctx.stroke();
                ctx.setLineDash([]);

                // A pulse travelling outward on the questions you can win.
                if (n.winnable) {
                  const phase = ((t * 0.42 + n.angle * 0.3) % 1 + 1) % 1;
                  const px = cx + Math.cos(n.angle) * R * n.reach * phase;
                  const py = cy + Math.sin(n.angle) * R * n.reach * phase;
                  ctx.beginPath();
                  ctx.arc(px, py, 2, 0, Math.PI * 2);
                  ctx.fillStyle = `hsla(${hue}, 90%, 70%, ${(1 - phase) * 0.8})`;
                  ctx.fill();
                }

                ctx.beginPath();
                ctx.arc(x, y, n.winnable ? (hot ? 6 : 4.5) : 3, 0, Math.PI * 2);
                ctx.fillStyle = n.winnable
                  ? `hsl(${hue}, 88%, 64%)`
                  : "rgba(255,255,255,0.16)";
                ctx.fill();

                if (n.winnable && hot) {
                  ctx.beginPath();
                  ctx.arc(x, y, 11, 0, Math.PI * 2);
                  ctx.strokeStyle = `hsla(${hue}, 88%, 64%, 0.5)`;
                  ctx.lineWidth = 1;
                  ctx.stroke();
                }

                // A padlock tick on the questions that exclude you.
                if (!n.winnable) {
                  ctx.beginPath();
                  ctx.moveTo(x - 3, y - 3);
                  ctx.lineTo(x + 3, y + 3);
                  ctx.moveTo(x + 3, y - 3);
                  ctx.lineTo(x - 3, y + 3);
                  ctx.strokeStyle = "rgba(255,255,255,0.22)";
                  ctx.lineWidth = 1;
                  ctx.stroke();
                }
              }

              // The hub.
              ctx.beginPath();
              ctx.arc(cx, cy, 14, 0, Math.PI * 2);
              ctx.fillStyle = "#07070b";
              ctx.fill();
              ctx.strokeStyle = HUB;
              ctx.lineWidth = 2;
              ctx.stroke();
              ctx.fillStyle = HUB;
              ctx.font = "600 9px ui-monospace, monospace";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("YOU", cx, cy);
            }}
          />

          <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
            {(Object.keys(INTENTS) as QueryIntent[]).map((k) => (
              <span key={k} className="flex items-center gap-1.5 text-[0.68rem] text-muted-foreground">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: `hsl(${INTENTS[k].hue}, 88%, 64%)` }}
                />
                {INTENTS[k].label}
              </span>
            ))}
          </div>
          <p className="mt-2 text-center text-[0.66rem] leading-relaxed text-muted-foreground/60">
            Illustrative phrasings, not measured search volume. Nothing here claims how often
            anyone asks these.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3 rounded-xl border border-white/[0.07] bg-black/20 p-4">
            <Figure value={String(reading.winnable)} caption="You are a candidate" tone="signal" />
            <Figure value={String(reading.locked)} caption="You are excluded" tone="gold" />
            <Figure value={String(reading.total)} caption="Questions on the fan" />
          </div>

          <ul className="max-h-[26rem] space-y-1 overflow-y-auto pr-1">
            {reading.readings.map((r) => (
              <li key={r.query.text}>
                <button
                  type="button"
                  onMouseEnter={() => setFocus(r.query.text)}
                  onFocus={() => setFocus(r.query.text)}
                  onMouseLeave={() => setFocus(null)}
                  onBlur={() => setFocus(null)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan",
                    r.winnable
                      ? "border-white/[0.09] bg-white/[0.03]"
                      : "border-white/[0.05] bg-transparent",
                  )}
                >
                  <span
                    className="mt-[0.4rem] h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      background: r.winnable
                        ? `hsl(${INTENTS[r.query.intent].hue}, 88%, 64%)`
                        : "rgba(255,255,255,0.16)",
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-[0.85rem]",
                        r.winnable ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      “{r.query.text}”
                    </span>
                    {!r.winnable && (
                      <span className="mt-0.5 block text-[0.7rem] text-gold/80">
                        excluded — no {r.missing.join(", no ").toLowerCase()}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Readout
        verdict={reading.locked === 0 ? "clear" : "gap"}
        headline={
          reading.winnable === 0
            ? "You are not a candidate for any of them."
            : reading.locked === 0
              ? "You are a candidate for every question on the fan."
              : `${reading.locked} of ${reading.total} questions exclude you before ranking.`
        }
        body={
          reading.locked === 0
            ? "Nothing structural is holding you out of these. Whether you win them is then a matter of corroboration — instrument 03."
            : reading.keystone
              ? `The single biggest lock is ${reading.keystone.label.toLowerCase()}: publishing it alone opens ${reading.keystone.unlocks} of the ${reading.locked} you are shut out of. These filters are applied before ranking, so this is not about placing lower — it is about not being in the set.`
              : "Each locked question is missing more than one attribute, so no single fix opens one. The Inspector above shows which."
        }
        upgradeKey={reading.locked === 0 ? undefined : "answer-engine"}
      />
    </Instrument>
  );
}

/** Exported for the sample loader, so the deck can seed a realistic business. */
export const QUERY_COUNT = QUERIES.length;
