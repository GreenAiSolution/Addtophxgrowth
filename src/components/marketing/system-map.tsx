"use client";

import * as React from "react";
import { ArrowRight, Move3d } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import {
  buildAtlas,
  projectAll,
  sortedByDepth,
  hitTest,
  neighbours,
  atlasCounts,
  ownerOf,
  fitZoom,
  PITCH_LIMIT,
  type AtlasNode,
  type Camera,
} from "@/lib/instruments/atlas";
import { FxCanvas, useReducedMotion } from "@/components/marketing/fx";
import { usePlayground } from "@/components/marketing/playground";
import { pulse } from "@/components/marketing/pulse";

/**
 * THE SYSTEM MAP — the whole business as one object you can turn over.
 *
 * DIRECTION
 *   A price list cannot show you that the thing you are buying is a shell
 *   around something you already own. This can, in one look: a bright core you
 *   already pay for, three services orbiting it, five upgrades hanging off
 *   those, gold arcs where upgrades compound, and the seven tools overhead
 *   with beams pointing down at whatever each one reads.
 *
 *   Then you drag it, and it is obviously one machine.
 *
 * NO 3D LIBRARY
 *   Sixty nodes, no meshes, no lighting, no textures. A WebGL library would
 *   add several times the entire current JavaScript bundle to a marketing page
 *   to draw circles. The maths lives in `atlas.ts`, tested; this file is the
 *   paint and the pointer handling.
 *
 * IT IS NOT CANVAS-ONLY
 *   The canvas is `aria-hidden`. Every node is also a real button in the list
 *   beside it, selection is announced, and the detail panel is a live region —
 *   so a keyboard or screen-reader visitor gets the same information and the
 *   same "add to stack" action, just without the spinning.
 */

const KIND_STYLE: Record<AtlasNode["kind"], { r: number; label: string }> = {
  core: { r: 17, label: "Your agency" },
  service: { r: 10, label: "Service you already buy" },
  upgrade: { r: 8, label: "Upgrade sold here" },
  tool: { r: 6, label: "Tool on this page" },
};

export function SystemMap() {
  const atlas = React.useMemo(() => buildAtlas(), []);
  const counts = React.useMemo(() => atlasCounts(atlas), [atlas]);
  const { picked, add } = usePlayground();
  const reduced = useReducedMotion();

  const [selected, setSelected] = React.useState<string | null>(null);
  const [hover, setHover] = React.useState<string | null>(null);
  const cam = React.useRef<Camera>({ yaw: 0.7, pitch: -0.34, distance: 640 });
  const drag = React.useRef<{ x: number; y: number } | null>(null);
  const spin = React.useRef(true);
  const points = React.useRef(new Map<string, ReturnType<typeof projectAll> extends Map<string, infer P> ? P : never>());

  const focus = hover ?? selected;
  const lit = React.useMemo(
    () => (focus ? neighbours(atlas, focus) : null),
    [atlas, focus],
  );
  const litRef = React.useRef(lit);
  litRef.current = lit;
  const focusRef = React.useRef(focus);
  focusRef.current = focus;

  const node = focus ? atlas.nodes.find((n) => n.key === focus) : null;

  // ---- pointer -----------------------------------------------------------

  function localXY(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY };
    spin.current = false;
  }

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const { x, y } = localXY(e);
    if (drag.current) {
      cam.current.yaw += (e.clientX - drag.current.x) * 0.008;
      // Clamped so it can never tip past vertical and read as upside down.
      cam.current.pitch = Math.max(
        -PITCH_LIMIT,
        Math.min(PITCH_LIMIT * 0.45, cam.current.pitch + (e.clientY - drag.current.y) * 0.006),
      );
      drag.current = { x: e.clientX, y: e.clientY };
      return;
    }
    setHover(hitTest(points.current, x, y)?.key ?? null);
  }

  function onUp(e: React.PointerEvent<HTMLDivElement>) {
    const wasDragging = drag.current;
    drag.current = null;
    // A click is a press that did not travel. Without this, finishing a spin
    // over a node selects it, which feels like the map grabbing at you.
    if (!wasDragging) return;
    const { x, y } = localXY(e);
    const hit = hitTest(points.current, x, y);
    if (hit) {
      setSelected((cur) => (cur === hit.key ? null : hit.key));
      pulse("instrument", `map:${hit.key}`);
    }
  }

  // ---- paint -------------------------------------------------------------

  /**
   * One frame of the scene.
   *
   * Hoisted out of the JSX so the render tree stays readable — this is the
   * only genuinely long function in the file and burying it three levels deep
   * inside a prop made the layout impossible to follow.
   */
  const paint = React.useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
      // Idle spin, until somebody takes hold of it.
      if (spin.current && !reduced) cam.current.yaw = 0.7 + t * 0.11;

      // Recomputed each frame so a resize refits rather than cropping.
      cam.current.zoom = fitZoom(atlas, w, h);
      const pts = projectAll(atlas, cam.current, w, h);
      points.current = pts;
      const order = sortedByDepth(pts);
      const on = litRef.current;
      const alphaFor = (key: string) => (!on ? 1 : on.has(key) ? 1 : 0.13);

      // Edges back to front, so a near link covers a far one.
      const edges = [...atlas.edges].sort((a, b) => {
        const da = (pts.get(a.from)!.depth + pts.get(a.to)!.depth) / 2;
        const db = (pts.get(b.from)!.depth + pts.get(b.to)!.depth) / 2;
        return db - da;
      });

      for (const e of edges) {
        const A = pts.get(e.from)!;
        const B = pts.get(e.to)!;
        const a = Math.min(alphaFor(e.from), alphaFor(e.to));

        if (e.kind === "bundle") {
          // Bundles arc, so they read as a different kind of link from the
          // structural spine rather than as a stray line.
          const mx = (A.sx + B.sx) / 2;
          const my = (A.sy + B.sy) / 2 - 46 * ((A.scale + B.scale) / 2);
          ctx.beginPath();
          ctx.moveTo(A.sx, A.sy);
          ctx.quadraticCurveTo(mx, my, B.sx, B.sy);
          ctx.strokeStyle = `rgba(240,180,41,${0.34 * a})`;
          ctx.lineWidth = 1.6;
          ctx.stroke();

          if (!reduced) {
            // Value moving between two upgrades that compound.
            const ph = (((t * 0.28 + A.sx * 0.002) % 1) + 1) % 1;
            const q = 1 - ph;
            const bx = q * q * A.sx + 2 * q * ph * mx + ph * ph * B.sx;
            const by = q * q * A.sy + 2 * q * ph * my + ph * ph * B.sy;
            ctx.beginPath();
            ctx.arc(bx, by, 2.2, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(240,180,41,${0.85 * a})`;
            ctx.fill();
          }
          continue;
        }

        const beam = e.kind === "beam";
        ctx.beginPath();
        ctx.moveTo(A.sx, A.sy);
        ctx.lineTo(B.sx, B.sy);
        if (beam) {
          ctx.setLineDash([2, 7]);
          ctx.lineDashOffset = reduced ? 0 : -t * 26;
          ctx.strokeStyle = `rgba(52,211,153,${0.3 * a})`;
          ctx.lineWidth = 1;
        } else {
          ctx.setLineDash([]);
          ctx.strokeStyle = `rgba(255,255,255,${0.17 * a})`;
          ctx.lineWidth = 1.3;
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;

        // A packet running core → service → upgrade, so the spine reads as
        // carrying something rather than merely holding it.
        if (!beam && !reduced) {
          const ph = (((t * 0.34 + A.sy * 0.003) % 1) + 1) % 1;
          ctx.beginPath();
          ctx.arc(A.sx + (B.sx - A.sx) * ph, A.sy + (B.sy - A.sy) * ph, 1.7, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(34,211,238,${(1 - ph) * 0.75 * a})`;
          ctx.fill();
        }
      }

      for (const p of order) {
        const n = p.node;
        const style = KIND_STYLE[n.kind];
        const a = alphaFor(n.key);
        const r = style.r * p.scale;
        const chosen = Boolean(n.addable && picked.includes(n.addable));
        const isFocus = focusRef.current === n.key;

        if (n.kind === "core" || chosen || isFocus) {
          const g = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, r * 4.5);
          g.addColorStop(0, `hsla(${n.hue},90%,60%,${0.32 * a})`);
          g.addColorStop(1, `hsla(${n.hue},90%,60%,0)`);
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, r * 4.5, 0, Math.PI * 2);
          ctx.fillStyle = g;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
        ctx.fillStyle =
          n.kind === "tool"
            ? `hsla(${n.hue},70%,55%,${0.6 * a})`
            : `hsla(${n.hue},88%,62%,${a})`;
        ctx.fill();

        if (n.kind === "core") {
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, r + 6, 0, Math.PI * 2);
          ctx.strokeStyle = `hsla(${n.hue},90%,62%,${0.55 * a})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        if (chosen) {
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, r + 5, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(52,211,153,${0.9 * a})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Labels for the big structure and whatever is focused. Sixty labels
        // at once is a wall of text, not a map.
        const named = n.kind === "core" || n.kind === "service" || isFocus;
        if (named && a > 0.4) {
          ctx.font =
            n.kind === "core"
              ? "700 13px ui-sans-serif, system-ui, sans-serif"
              : "600 11px ui-sans-serif, system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = `rgba(255,255,255,${0.92 * a})`;
          ctx.fillText(n.label, p.sx, p.sy - r - 12);
        }
      }
    },
    [atlas, picked, reduced],
  );

  return (
    <section id="map" className="relative scroll-mt-24 overflow-hidden py-16 md:py-24">
      <div className="container">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:gap-7">
          <div className="flex shrink-0 items-center gap-3 md:flex-col md:items-start md:gap-1.5">
            <span className="font-mono text-[2.4rem] font-bold leading-none tracking-tighter text-gradient md:text-[3.4rem]">
              ◇
            </span>
            <span className="font-mono text-[0.58rem] tracking-[0.24em] text-muted-foreground/50">
              THE MAP
            </span>
          </div>
          <div className="min-w-0 pt-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="fx-live h-1.5 w-1.5 rounded-full bg-cyan text-cyan" />
              <span className="eyebrow text-[0.56rem] text-cyan">Live model</span>
            </div>
            <h2 className="mt-2.5 text-[2rem] font-bold leading-[1.05] tracking-tight md:text-[2.9rem]">
              The whole system, in one object.
            </h2>
            <p className="mt-3 max-w-2xl text-[1.02rem] leading-relaxed text-muted-foreground">
              Your agency at the centre. The services you already buy orbiting it. The upgrades
              sold here hanging off those. Gold lines where two upgrades make each other worth
              more, and the seven tools above, each pointing at what it reads.{" "}
              <span className="text-foreground">Drag it.</span>
            </p>
          </div>
        </header>

        {/*
          Full width, not a side panel.

          A roughly spherical object fitted into a narrow column is mostly
          margin — the fit is limited by the short edge and the long edge goes
          to waste. Given the whole floor, the same object renders at nearly
          twice the size and reads as a viewport onto something rather than a
          diagram in a box. The detail card floats over it instead of stealing
          a third of the width.
        */}
        <div className="phx-card fx-panel relative mt-9 select-none overflow-hidden p-0">
          <div
            className="touch-none"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={() => {
              drag.current = null;
              setHover(null);
            }}
            style={{ cursor: hover ? "pointer" : "grab" }}
          >
            <FxCanvas
              className="aspect-[4/3] w-full sm:aspect-[16/10] lg:aspect-[2/1]"
              deps={[atlas, picked]}
              render={paint}
            />
          </div>

          {/* What you're looking at, floating over the scene. */}
          <div
            className={cn(
              "pointer-events-none absolute right-4 top-4 w-[min(21rem,calc(100%-2rem))] rounded-2xl border p-4 backdrop-blur-md transition-colors md:right-6 md:top-6",
              node?.kind === "upgrade"
                ? "border-gold/40 bg-gold/[0.07]"
                : "border-white/10 bg-black/55",
            )}
            aria-live="polite"
          >
            {node ? (
              <>
                <div className="eyebrow text-[0.54rem] text-muted-foreground">
                  {KIND_STYLE[node.kind].label}
                </div>
                <h3 className="mt-1.5 text-lg font-bold leading-tight tracking-tight">
                  {node.label}
                </h3>
                <p className="mt-1.5 text-[0.82rem] leading-relaxed text-muted-foreground">
                  {node.blurb}
                </p>
                {node.kind === "upgrade" && (
                  <div className="pointer-events-auto mt-3 flex flex-wrap items-center gap-2.5 border-t border-white/10 pt-3">
                    <span className="font-mono text-sm tabular-nums text-gold">
                      {formatCurrency(node.price!)}/mo
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        add(node.addable!);
                        window.dispatchEvent(
                          new CustomEvent("phx:toggle-upgrade", { detail: node.addable }),
                        );
                      }}
                      disabled={picked.includes(node.addable!)}
                      className="pill-primary ml-auto text-[0.74rem] disabled:opacity-50"
                    >
                      {picked.includes(node.addable!) ? "In your package" : "Add"}
                      {!picked.includes(node.addable!) && <ArrowRight className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="eyebrow text-[0.54rem] text-muted-foreground">
                  Nothing selected
                </div>
                <p className="mt-1.5 text-[0.82rem] leading-relaxed text-muted-foreground">
                  Hover or tap any dot. The bright centre is everything you already pay for —
                  the small outer dots are the only things sold on this page.
                </p>
              </>
            )}
          </div>

          {/* Legend, bottom left, over the scene. */}
          <div className="pointer-events-none absolute bottom-4 left-4 hidden flex-col gap-1.5 sm:flex md:bottom-6 md:left-6">
            {(
              [
                ["core", "#f0b429", "Your agency"],
                ["service", "#a78bfa", "Services you already buy"],
                ["upgrade", "#22d3ee", "Upgrades sold here"],
                ["tool", "#34d399", "Tools on this page"],
              ] as const
            ).map(([k, c, l]) => (
              <span key={k} className="flex items-center gap-2 text-[0.68rem] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
                {l}
              </span>
            ))}
            <span className="mt-1 flex items-center gap-2 text-[0.68rem] text-gold/80">
              <span className="h-px w-3 bg-gold" />
              bundled — cheaper together
            </span>
          </div>

          <div className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-[0.65rem] text-muted-foreground backdrop-blur-sm md:bottom-6">
            <Move3d className="h-3 w-3" /> drag to spin · tap a dot
          </div>
        </div>

        {/* Counts, and the keyboard route into the same scene. */}
        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1.4fr]">
          <div className="grid grid-cols-4 gap-2 rounded-xl border border-white/[0.07] bg-black/20 p-4 text-center">
            {[
              { n: 1, l: "Agency", c: "text-gold" },
              { n: counts.services, l: "Services", c: "text-violet" },
              { n: counts.upgrades, l: "Upgrades", c: "text-cyan" },
              { n: counts.tools, l: "Tools", c: "text-signal" },
            ].map((s) => (
              <div key={s.l}>
                <div className={cn("font-mono text-2xl font-bold tabular-nums", s.c)}>{s.n}</div>
                <div className="mt-0.5 text-[0.66rem] text-muted-foreground">{s.l}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
            <div className="eyebrow mb-2 text-[0.56rem] text-muted-foreground">
              Everything on the map
            </div>
            <ul className="flex flex-wrap gap-1">
              {atlas.nodes.map((n) => (
                <li key={n.key}>
                  <button
                    type="button"
                    aria-pressed={selected === n.key}
                    onFocus={() => setHover(n.key)}
                    onBlur={() => setHover(null)}
                    onMouseEnter={() => setHover(n.key)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => setSelected((c) => (c === n.key ? null : n.key))}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border px-2 py-1 text-left text-[0.72rem] transition-colors",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan",
                      selected === n.key || hover === n.key
                        ? "border-white/25 bg-white/[0.08] text-foreground"
                        : "border-white/[0.06] text-muted-foreground hover:border-white/20",
                    )}
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: `hsl(${n.hue},88%,62%)` }}
                    />
                    <span className="max-w-[11rem] truncate">{n.label}</span>
                    {n.addable && picked.includes(n.addable) && (
                      <span className="text-[0.58rem] text-signal">✓</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
