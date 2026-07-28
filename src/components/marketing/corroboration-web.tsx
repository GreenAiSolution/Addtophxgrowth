"use client";

import * as React from "react";
import {
  CITATION_SOURCES,
  readCorroboration,
  webLayout,
  type CorroborationAnswers,
} from "@/lib/instruments/corroboration";
import { cn } from "@/lib/utils";
import { Instrument, Readout, Figure, Toggle } from "@/components/marketing/instrument";
import { usePlayground } from "@/components/marketing/playground";
import { FxCanvas } from "@/components/marketing/fx";
import { pulse } from "@/components/marketing/pulse";

/**
 * INSTRUMENT 03 — THE CORROBORATION WEB
 *
 * Drawn on canvas because the subject is a shape.
 *
 * The thing an owner has to see is not a list of directories — they have seen
 * that, it is every SEO invoice they have ever paid. It is that their site
 * sits alone in the middle making claims, and that the lines running back to
 * it are either solid, broken, or absent. A table cannot show you that a web
 * is not a web.
 *
 * WHY THE CONFLICT STATE IS DRAWN, NOT COUNTED
 *   A listing that exists with the wrong suite number is worse than no listing
 *   — conflicting records of one business look exactly like records of two.
 *   Drawn as a severed line rather than a missing one, that reads instantly.
 *   Written in a table it reads as a smaller number, which is the opposite of
 *   the truth.
 *
 * RENDERING
 *   Deterministic layout from `webLayout`, so the same answers always draw the
 *   same picture. The canvas is decorative-with-a-shadow: every node is also a
 *   labelled switch in the list beside it, and the canvas carries
 *   `aria-hidden`, so nothing here is canvas-only.
 */

const COLORS = {
  bg: "#07070b",
  hub: "#22d3ee",
  solid: "#34d399",
  broken: "#f0b429",
  faint: "rgba(255,255,255,0.09)",
  text: "rgba(255,255,255,0.55)",
};

export function CorroborationWeb() {
  const { citations: answers, setCitations: setAnswers, add, justSeeded } = usePlayground();
  const reading = React.useMemo(() => readCorroboration(answers), [answers]);

  function set(key: string, patch: Partial<{ present: boolean; consistent: boolean }>) {
    setAnswers((prev) => {
      const cur = prev[key] ?? { present: false, consistent: false };
      const next = { ...cur, ...patch };
      // A record cannot agree with your site if it does not exist.
      if (!next.present) next.consistent = false;
      return { ...prev, [key]: next };
    });
    pulse("instrument", key);
  }

  return (
    <Instrument
      index={3}
      id="web"
      name="Does Anyone Back You Up?"
      reads="Whether other websites confirm your business exists — and whether they all say the same thing."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className={cn("phx-card fx-panel flex flex-col justify-center p-5 md:p-6", justSeeded && "fx-sheen")}>
          <FxCanvas
            className="mx-auto aspect-square w-full max-w-[30rem]"
            deps={[answers, reading]}
            render={(ctx, size, _h, t) => {
              const cx = size / 2;
              const cy = size / 2;
              const nodes = webLayout(answers, size * 0.36);

              for (const n of nodes) {
                const x = cx + n.x;
                const y = cy + n.y;
                ctx.beginPath();
                ctx.moveTo(cx, cy);

                if (!n.present) {
                  ctx.setLineDash([2, 6]);
                  ctx.strokeStyle = COLORS.faint;
                  ctx.lineWidth = 1;
                  ctx.lineTo(x, y);
                  ctx.stroke();
                } else if (n.consistent) {
                  ctx.setLineDash([]);
                  ctx.strokeStyle = COLORS.solid;
                  ctx.lineWidth = n.anchor ? 2 : 1.25;
                  ctx.globalAlpha = 0.7;
                  ctx.lineTo(x, y);
                  ctx.stroke();
                  ctx.globalAlpha = 1;
                } else {
                  // Present but disagreeing: drawn severed, because that is
                  // what it is — and the break sparks, so the eye finds it.
                  ctx.setLineDash([]);
                  ctx.strokeStyle = COLORS.broken;
                  ctx.lineWidth = n.anchor ? 2 : 1.25;
                  ctx.lineTo(cx + n.x * 0.55, cy + n.y * 0.55);
                  ctx.stroke();
                  ctx.beginPath();
                  ctx.moveTo(cx + n.x * 0.72, cy + n.y * 0.72);
                  ctx.lineTo(x, y);
                  ctx.stroke();

                  const spark = 0.5 + Math.sin(t * 5 + n.x) * 0.5;
                  ctx.beginPath();
                  ctx.arc(cx + n.x * 0.635, cy + n.y * 0.635, 1.6 + spark * 2, 0, Math.PI * 2);
                  ctx.fillStyle = `rgba(240,180,41,${0.25 + spark * 0.5})`;
                  ctx.fill();
                }
                ctx.setLineDash([]);

                // Corroboration travelling inward: the direction matters, it is
                // the outside world confirming you, not you broadcasting.
                if (n.present && n.consistent) {
                  const phase = 1 - (((t * 0.34 + n.y * 0.004) % 1) + 1) % 1;
                  ctx.beginPath();
                  ctx.arc(cx + n.x * phase, cy + n.y * phase, 2, 0, Math.PI * 2);
                  ctx.fillStyle = `rgba(52,211,153,${phase * 0.85})`;
                  ctx.fill();
                }
              }

              for (const n of nodes) {
                const x = cx + n.x;
                const y = cy + n.y;
                const r = n.anchor ? 5.5 : 4;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fillStyle = !n.present
                  ? "rgba(255,255,255,0.14)"
                  : n.consistent
                    ? COLORS.solid
                    : COLORS.broken;
                ctx.fill();
                if (n.anchor) {
                  ctx.beginPath();
                  ctx.arc(x, y, r + 3.5 + (n.present ? 0 : Math.sin(t * 2) * 0.8), 0, Math.PI * 2);
                  ctx.strokeStyle = ctx.fillStyle as string;
                  ctx.globalAlpha = 0.35;
                  ctx.lineWidth = 1;
                  ctx.stroke();
                  ctx.globalAlpha = 1;
                }
              }

              // The hub — you, making claims. Breathes with how corroborated
              // the whole web is, so the centre gets brighter as it firms up.
              const conf = reading.reach > 0 ? reading.consistent / reading.reach : 0;
              ctx.beginPath();
              ctx.arc(cx, cy, 13 + Math.sin(t * 1.5) * 0.8, 0, Math.PI * 2);
              ctx.fillStyle = COLORS.bg;
              ctx.fill();
              ctx.strokeStyle = COLORS.hub;
              ctx.globalAlpha = 0.45 + conf * 0.55;
              ctx.lineWidth = 2;
              ctx.stroke();
              ctx.globalAlpha = 1;
              ctx.fillStyle = COLORS.hub;
              ctx.font = "600 9px ui-monospace, monospace";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("YOU", cx, cy);

              ctx.fillStyle = COLORS.text;
              ctx.font = "8px ui-monospace, monospace";
              ctx.fillText(
                `${reading.consistent} agreeing · ${reading.conflicts} in conflict`,
                cx,
                size - 8,
              );
            }}
          />
          <div className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-[0.68rem] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-signal" /> agrees with your site
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" /> listed, but wrong details
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-white/20" /> not listed at all
            </span>
          </div>
        </div>

        <div>
          <p className="text-[0.8rem] leading-relaxed text-muted-foreground">
            Tick where you&rsquo;re listed, then tick again if that listing has the{" "}
            <span className="text-foreground">exact same name, address and phone</span> as your
            website. The four with rings around them are the ones that matter most.
          </p>

          <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
            {CITATION_SOURCES.map((s) => {
              const st = answers[s.key] ?? { present: false, consistent: false };
              return (
                <li key={s.key} className="flex flex-col gap-1">
                  <Toggle
                    checked={st.present}
                    onChange={(v) => set(s.key, { present: v })}
                    label={s.name}
                    sublabel={s.anchor ? "Matters most" : s.note}
                  />
                  <div className="pl-3">
                    <Toggle
                      checked={st.consistent}
                      disabled={!st.present}
                      tone="gold"
                      onChange={(v) => set(s.key, { consistent: v })}
                      label="…and it matches my site exactly"
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-5 grid grid-cols-3 gap-3 rounded-xl border border-white/[0.07] bg-black/20 p-4">
            <Figure value={String(reading.reach)} caption="Sites that list you" tone="cyan" />
            <Figure value={String(reading.consistent)} caption="That match your site" tone="signal" />
            <Figure value={String(reading.conflicts)} caption="That say something different" tone="gold" />
          </div>
        </div>
      </div>

      <Readout
        verdict={reading.corroborated ? "clear" : "gap"}
        headline={
          reading.conflictingAnchors.length > 0
            ? `${reading.conflictingAnchors.length} of the big ${reading.conflictingAnchors.length === 1 ? "one has" : "ones have"} your details wrong.`
            : reading.missingAnchors.length > 0
              ? `${reading.missingAnchors.length} of the ${reading.missingAnchors.length === 1 ? "big listings has" : "big listings have"} never heard of you.`
              : reading.conflicts > 0
                ? `${reading.conflicts} listing${reading.conflicts === 1 ? "" : "s"} say something different about you.`
                : "Everything lines up. Nothing to fix."
        }
        body={
          reading.conflictingAnchors.length > 0
            ? `Wrong details are worse than no details. ${reading.conflictingAnchors.map((s) => s.name).join(", ")} ${reading.conflictingAnchors.length === 1 ? "shows" : "show"} a version of you that doesn't match your own website — and to a computer, two versions of one business look exactly like two different businesses.`
            : reading.missingAnchors.length > 0
              ? `Not being on ${reading.missingAnchors.map((s) => s.name).join(", ")} doesn't read as "we couldn't find them" — it reads as "maybe they aren't real". Every established business is on the maps.`
              : reading.conflicts > 0
                ? "Not fatal on its own, but every mismatch chips away at how much anything trusts your details."
                : "Nothing to fix here. Everyone agrees about you, so anything flagged earlier is a problem on your own website, not out there."
        }
        upgradeKey={reading.corroborated ? undefined : "citation-authority"}
        onAdd={add}
      />
    </Instrument>
  );
}
