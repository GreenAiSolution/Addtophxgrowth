"use client";

import * as React from "react";
import { FxCanvas } from "@/components/marketing/fx";

/**
 * THE SYSTEM FIELD — the live substrate every tool sits on.
 *
 * DIRECTION
 *   Seven panels on a flat black page read as seven separate widgets somebody
 *   collected. The single strongest signal that they are one machine is that
 *   they all sit on top of something that is visibly running.
 *
 *   So: a slow network of nodes drifting behind the entire page, with signals
 *   travelling along the links between them. It is not a decorative gradient —
 *   it is a graph, because the thing being sold is a system that connects
 *   things, and the background should be the same idea as the product.
 *
 * WHY IT IS CHEAP ENOUGH TO LEAVE RUNNING
 *   Fixed count of nodes, no physics, no collision, no per-frame allocation.
 *   Links are recomputed each frame from a squared-distance check, which at
 *   this node count is a few hundred comparisons — less work than one line of
 *   text layout. `FxCanvas` parks the whole loop when it scrolls off screen and
 *   draws a single still frame under reduced motion.
 *
 *   It also sits at `-z-10` with `pointer-events-none`, so it can never
 *   intercept a click meant for an instrument.
 */

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Bigger nodes are the "hubs" — a few of them, drawn brighter. */
  hub: boolean;
}

/**
 * Deterministic pseudo-random, seeded per index.
 *
 * `Math.random()` would give a different field on every render, so a
 * screenshot could never be reproduced and React strict-mode double-mounting
 * would visibly jump. This is a cheap hash — good enough to look scattered,
 * stable enough to be a fixture.
 */
function rand(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const COUNT = 68;
const LINK_DIST = 162;

function makeNodes(w: number, h: number): Node[] {
  return Array.from({ length: COUNT }, (_, i) => ({
    x: rand(i, 1) * w,
    y: rand(i, 2) * h,
    // Slow. The field should read as ambient, never as something to watch.
    vx: (rand(i, 3) - 0.5) * 6,
    vy: (rand(i, 4) - 0.5) * 6,
    hub: i % 9 === 0,
  }));
}

export function SystemField() {
  const nodes = React.useRef<Node[]>([]);
  const size = React.useRef({ w: 0, h: 0 });
  const last = React.useRef(0);

  return (
    <FxCanvas
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
      render={(ctx, w, h, t) => {
        if (size.current.w !== w || size.current.h !== h) {
          size.current = { w, h };
          nodes.current = makeNodes(w, h);
          last.current = t;
        }
        const dt = Math.min(0.05, t - last.current);
        last.current = t;

        const ns = nodes.current;
        for (const n of ns) {
          n.x += n.vx * dt;
          n.y += n.vy * dt;
          // Wrap rather than bounce: a bounce reads as a boundary, and this
          // field is meant to feel like it continues past the screen.
          if (n.x < -20) n.x = w + 20;
          if (n.x > w + 20) n.x = -20;
          if (n.y < -20) n.y = h + 20;
          if (n.y > h + 20) n.y = -20;
        }

        // Links first, so nodes cap their own lines.
        for (let i = 0; i < ns.length; i++) {
          const a = ns[i]!;
          for (let j = i + 1; j < ns.length; j++) {
            const b = ns[j]!;
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > LINK_DIST * LINK_DIST) continue;
            const d = Math.sqrt(d2);
            const fade = 1 - d / LINK_DIST;

            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(34,211,238,${fade * 0.14})`;
            ctx.lineWidth = 1;
            ctx.stroke();

            // A signal running the link — the thing that makes it read as a
            // system doing work rather than a constellation.
            if ((i + j) % 7 === 0) {
              const phase = ((t * 0.3 + (i + j) * 0.13) % 1 + 1) % 1;
              ctx.beginPath();
              ctx.arc(a.x + (b.x - a.x) * phase, a.y + (b.y - a.y) * phase, 1.4, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(139,92,246,${fade * (1 - phase) * 0.75})`;
              ctx.fill();
            }
          }
        }

        for (const n of ns) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.hub ? 2.1 : 1.2, 0, Math.PI * 2);
          ctx.fillStyle = n.hub ? "rgba(34,211,238,0.55)" : "rgba(255,255,255,0.22)";
          ctx.fill();
          if (n.hub) {
            const beat = 0.5 + Math.sin(t * 1.1 + n.x * 0.01) * 0.5;
            ctx.beginPath();
            ctx.arc(n.x, n.y, 2.1 + beat * 7, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(34,211,238,${(1 - beat) * 0.22})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }}
    />
  );
}
