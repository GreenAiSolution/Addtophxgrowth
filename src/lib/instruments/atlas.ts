/**
 * THE SYSTEM MAP — geometry engine.
 *
 * WHAT IT SHOWS
 *   The whole business as one object in space: the agency at the core, the
 *   three services it sells orbiting it, the five upgrades hanging off those
 *   services, the bundles arcing between upgrades, and the seven tools on the
 *   page floating above, each aimed at the thing it diagnoses.
 *
 *   Nobody can hold that in their head from a price list. Rotate it once and
 *   the shape is obvious: a dense core you already pay for, and a thin outer
 *   shell that is everything this site sells.
 *
 * WHY IT IS BUILT AS DATA, NOT ART
 *   Every node and every edge is derived from the catalogue. Services come
 *   from `PARENT_SERVICES`, upgrades from `UPGRADES` with their real
 *   `attachesTo` link, and the gold arcs are literally `BUNDLES.members` — so
 *   the map cannot show a relationship the business does not sell. Add an
 *   upgrade and it appears in orbit; add a bundle and the arc draws itself.
 *
 *   The one thing invented here is which tool points at which node, and that
 *   is a description of the page rather than a claim about the world.
 *
 * WHY THE 3D IS HAND-ROLLED
 *   A rotating point cloud with depth sorting is about eighty lines of
 *   arithmetic. Pulling in a WebGL library to draw sixty spheres would add
 *   roughly six times the entire current JavaScript bundle to a marketing
 *   page, for a scene with no meshes, no lighting and no textures. So: plain
 *   trigonometry, painter's algorithm, canvas 2D.
 */

import { PARENT_SERVICES, UPGRADES, BUNDLES, serviceByKey } from "@/lib/upgrades";

export type AtlasKind = "core" | "service" | "upgrade" | "tool";

export interface AtlasNode {
  key: string;
  label: string;
  kind: AtlasKind;
  /** Model-space position. The core sits at the origin. */
  x: number;
  y: number;
  z: number;
  /** Hue for this node, so colour carries the same meaning as on the page. */
  hue: number;
  /** Upgrades only — for the label. */
  price?: number;
  /** What a non-technical reader should understand this node to be. */
  blurb: string;
  /** Upgrade key this node can add to the stack, when it is an upgrade. */
  addable?: string;
}

export interface AtlasEdge {
  from: string;
  to: string;
  /**
   * `spine`  core → service, and service → upgrade. The structure.
   * `bundle` upgrade ↔ upgrade, because a bundle contains both.
   * `beam`   tool → whatever it diagnoses.
   */
  kind: "spine" | "bundle" | "beam";
}

export interface Atlas {
  nodes: AtlasNode[];
  edges: AtlasEdge[];
}

/** Service colours, matching the page exactly. */
const SERVICE_HUE: Record<string, number> = {
  "premium-ai-ads": 322,
  "ai-employees": 255,
  "website-creation": 190,
};

/**
 * Which tool on the page looks at which part of the business.
 *
 * A description of the page, not a claim — and it is what makes the map show
 * "the tools working off one another" rather than a static org chart.
 */
const TOOL_TARGETS: { key: string; label: string; blurb: string; target: string }[] = [
  {
    key: "matrix",
    label: "What You're Already Paying For",
    blurb: "Looks at the whole system and shows how little is left over.",
    target: "core",
  },
  {
    key: "inspector",
    label: "Can AI Find You?",
    blurb: "Checks whether AI knows enough about you to name you.",
    target: "answer-engine",
  },
  {
    key: "fan",
    label: "The Questions You Lose",
    blurb: "Shows which questions throw you out before anyone compares you.",
    target: "answer-engine",
  },
  {
    key: "web",
    label: "Does Anyone Back You Up?",
    blurb: "Checks whether other websites confirm your details.",
    target: "citation-authority",
  },
  {
    key: "clock",
    label: "What a Missed Call Costs",
    blurb: "Puts a dollar figure on the calls you don't answer.",
    target: "voice-employee",
  },
  {
    key: "marginal",
    label: "Where Your Next Ad Dollar Goes",
    blurb: "Sells nothing. Points back at what the agency already runs.",
    target: "premium-ai-ads",
  },
  {
    key: "compose",
    label: "Build Your Package",
    blurb: "Adds up whatever the other tools found.",
    target: "core",
  },
];

/**
 * How far the camera may tilt, in radians.
 *
 * Exported because `fitZoom` budgets vertical space for exactly this much
 * tilt. If the two ever disagree, dragging to the limit pushes nodes off the
 * top of the panel — which is the bug the fit test caught.
 */
export const PITCH_LIMIT = 0.62;

const RING_SERVICE = 118;
const RING_UPGRADE = 232;
const TOOL_HEIGHT = -135;
const TOOL_RING = 190;

/**
 * How much of a service's sector its upgrades may occupy, and the widest arc
 * any single one is allowed to sit at from its parent's spoke.
 *
 * Together these are what stop the fan from either overlapping the neighbouring
 * service or throwing a lone upgrade out to the sector boundary.
 */
const SECTOR_USE = 0.74;
const STEP_MAX = 0.62;

/**
 * Build the scene.
 *
 * Upgrades are placed in the sector belonging to their parent service and
 * spread within it, so the picture reads as three clusters rather than a
 * uniform ring — which is the true shape, since the services carry different
 * numbers of upgrades.
 */
export function buildAtlas(): Atlas {
  const nodes: AtlasNode[] = [];
  const edges: AtlasEdge[] = [];

  nodes.push({
    key: "core",
    label: "PHX/GROWTH",
    kind: "core",
    x: 0,
    y: 0,
    z: 0,
    hue: 42,
    blurb: "Your agency. Everything below already runs on your account.",
  });

  PARENT_SERVICES.forEach((service, i) => {
    const angle = (i / PARENT_SERVICES.length) * Math.PI * 2 - Math.PI / 2;
    nodes.push({
      key: service.key,
      label: service.name,
      kind: "service",
      x: Math.cos(angle) * RING_SERVICE,
      // A gentle tilt per service, so the ring reads as a disc in space
      // rather than a flat circle when it is edge-on.
      y: Math.sin(i * 2.1) * 26,
      z: Math.sin(angle) * RING_SERVICE,
      hue: SERVICE_HUE[service.key] ?? 190,
      blurb: `${service.priceLabel} — a service you already buy from PHX/GROWTH.`,
    });
    edges.push({ from: "core", to: service.key, kind: "spine" });

    const mine = UPGRADES.filter((u) => u.attachesTo === service.key);
    mine.forEach((u, j) => {
      /*
        Fan the upgrades inside their parent's sector.

        The first version divided a fixed total spread by the number of
        upgrades, which meant the arc stayed the same width however many were
        in it — so a service carrying one upgrade got the whole sector and a
        service carrying four got the same arc cut into four. It looked correct
        with five upgrades spread 1/2/2 and collapsed the moment AI Employees
        went to four: two nodes landed about twenty screen pixels apart, close
        enough that hit-testing picked whichever was nearer rather than
        whichever was meant.

        So the step is a per-upgrade arc, not a slice of a constant. It gets as
        wide as SECTOR_USE allows and no wider than STEP_MAX, which keeps a
        lone upgrade sitting on its parent's spoke instead of being flung out
        to the sector edge.
      */
      const sector = (Math.PI * 2) / PARENT_SERVICES.length;
      const step = Math.min(STEP_MAX, (sector * SECTOR_USE) / Math.max(1, mine.length));
      const a = angle + (j - (mine.length - 1) / 2) * step;
      nodes.push({
        key: u.key,
        label: u.name,
        kind: "upgrade",
        x: Math.cos(a) * RING_UPGRADE,
        /*
          A ramp, so every sibling sits at its own height.

          This started as a cos-jitter, then as a strict up/down alternation —
          and the alternation was worse than it looked, because it only ever
          separates *neighbours*. The first and third upgrade in a sector both
          came out even and landed at exactly the same height, so when the disc
          was dragged edge-on and the horizontal spread collapsed under the
          perspective divide, the two of them projected eleven pixels apart:
          inside the click radius, and indistinguishable to the eye.

          A monotonic ramp has no such collision. Every upgrade in a sector is
          at a different altitude, which is the one separation the camera
          cannot take away from any angle a visitor can drag to.
        */
        y: Math.sin(i * 2.1) * 26 + (j - (mine.length - 1) / 2) * 34,
        z: Math.sin(a) * RING_UPGRADE,
        hue: SERVICE_HUE[service.key] ?? 190,
        price: u.price,
        addable: u.key,
        blurb: u.fixes,
      });
      edges.push({ from: service.key, to: u.key, kind: "spine" });
    });
  });

  // Bundle arcs: every pair inside a bundle, deduplicated.
  for (const b of BUNDLES) {
    for (let i = 0; i < b.members.length; i++) {
      for (let j = i + 1; j < b.members.length; j++) {
        const from = b.members[i]!;
        const to = b.members[j]!;
        const seen = edges.some(
          (e) =>
            e.kind === "bundle" &&
            ((e.from === from && e.to === to) || (e.from === to && e.to === from)),
        );
        if (!seen) edges.push({ from, to, kind: "bundle" });
      }
    }
  }

  // The tools, on a higher plane, each aimed at what it reads.
  TOOL_TARGETS.forEach((t, i) => {
    const angle = (i / TOOL_TARGETS.length) * Math.PI * 2 - Math.PI / 3;
    nodes.push({
      key: `tool:${t.key}`,
      label: t.label,
      kind: "tool",
      x: Math.cos(angle) * TOOL_RING,
      y: TOOL_HEIGHT + Math.sin(i * 1.3) * 22,
      z: Math.sin(angle) * TOOL_RING,
      hue: 158,
      blurb: t.blurb,
    });
    edges.push({ from: `tool:${t.key}`, to: t.target, kind: "beam" });
  });

  return { nodes, edges };
}

/** A node after rotation and perspective. Screen space, plus depth for sorting. */
export interface Projected {
  node: AtlasNode;
  sx: number;
  sy: number;
  /** Rotated z. Larger is further away. */
  depth: number;
  /** Perspective scale, 0–~2. Used for radius and opacity. */
  scale: number;
}

export interface Camera {
  yaw: number;
  pitch: number;
  /** Distance from the scene. Larger flattens the perspective. */
  distance: number;
  /**
   * Fit factor, applied after projection.
   *
   * The model is authored in fixed units so the geometry tests can assert
   * exact positions; the canvas is whatever width the layout gives it. Without
   * this the object rendered at a fixed size and floated in the middle of a
   * large panel looking like a diagram somebody forgot to finish.
   */
  zoom?: number;
}

/**
 * Rotate then project.
 *
 * Yaw first (spin), then pitch (tilt) — the order a person expects when they
 * drag: horizontal drag spins the object about its own vertical axis no
 * matter how far it is already tilted.
 */
export function project(
  node: AtlasNode,
  cam: Camera,
  w: number,
  h: number,
): Projected {
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const x1 = node.x * cy - node.z * sy;
  const z1 = node.x * sy + node.z * cy;

  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const y2 = node.y * cp - z1 * sp;
  const z2 = node.y * sp + z1 * cp;

  // Clamped so a node passing behind the camera cannot invert or explode.
  const denom = Math.max(60, cam.distance + z2);
  const scale = cam.distance / denom;

  const zoom = cam.zoom ?? 1;
  return {
    node,
    sx: w / 2 + x1 * scale * zoom,
    sy: h / 2 + y2 * scale * zoom,
    depth: z2,
    scale: scale * zoom,
  };
}

/** Everything projected, sorted far-to-near so nearer nodes paint over. */
export function projectAll(
  atlas: Atlas,
  cam: Camera,
  w: number,
  h: number,
): Map<string, Projected> {
  const out = new Map<string, Projected>();
  for (const n of atlas.nodes) out.set(n.key, project(n, cam, w, h));
  return out;
}

export function sortedByDepth(points: Map<string, Projected>): Projected[] {
  return [...points.values()].sort((a, b) => b.depth - a.depth);
}

/** Which node is under the pointer, if any. Nearest wins on a tie. */
/**
 * The click radius, in screen pixels at unit scale.
 *
 * Exported because the layout has to be checked against it. Two nodes closer
 * together than this are not two targets — they are one target that reports a
 * different answer depending on depth, and the visitor cannot tell which they
 * are about to get.
 */
export const HIT_SLACK = 20;

export function hitTest(
  points: Map<string, Projected>,
  px: number,
  py: number,
  slack = HIT_SLACK,
): AtlasNode | null {
  let best: Projected | null = null;
  for (const p of points.values()) {
    const r = slack * Math.max(0.5, p.scale);
    if (Math.hypot(p.sx - px, p.sy - py) > r) continue;
    if (!best || p.depth < best.depth) best = p;
  }
  return best?.node ?? null;
}

/** Every node one hop from this one — what to light when it is selected. */
export function neighbours(atlas: Atlas, key: string): Set<string> {
  const out = new Set<string>([key]);
  for (const e of atlas.edges) {
    if (e.from === key) out.add(e.to);
    if (e.to === key) out.add(e.from);
  }
  return out;
}

/** Counts for the caption, derived rather than typed. */
export function atlasCounts(atlas: Atlas) {
  const by = (k: AtlasKind) => atlas.nodes.filter((n) => n.kind === k).length;
  return {
    services: by("service"),
    upgrades: by("upgrade"),
    tools: by("tool"),
    links: atlas.edges.length,
  };
}

/**
 * The real extents of the built scene, measured rather than assumed.
 *
 * Horizontal is the largest distance from the axis of rotation, which is what
 * the object sweeps as it spins and is therefore rotation-invariant. Vertical
 * is the largest height, which is not — pitch mixes depth into it — so the fit
 * below leaves headroom rather than tracking it per frame, because a zoom that
 * changed as the object turned would breathe in and out and look broken.
 */
export function atlasExtent(atlas: Atlas): { radial: number; vertical: number } {
  let radial = 1;
  let vertical = 1;
  for (const n of atlas.nodes) {
    radial = Math.max(radial, Math.hypot(n.x, n.z));
    vertical = Math.max(vertical, Math.abs(n.y));
  }
  return { radial, vertical };
}

/**
 * The zoom that makes the object fill a canvas of this size.
 *
 * The first version fitted to `min(w, h)` against a hand-written extent and
 * made the map *smaller* than leaving it alone — the panel is wider than it is
 * tall, so fitting to the short edge wasted the long one. This fits each axis
 * against what the scene actually measures and takes the tighter of the two.
 */
export function fitZoom(atlas: Atlas, w: number, h: number): number {
  const { radial, vertical } = atlasExtent(atlas);
  // Pitch tips depth into height, so the vertical budget has to cover the
  // steepest tilt the camera is allowed to reach. Budgeting for less is what
  // pushed the tool ring off the top of the panel at full tilt.
  const verticalNeed = vertical + radial * Math.sin(PITCH_LIMIT);
  return Math.min((w * 0.45) / radial, (h * 0.45) / verticalNeed);
}

/** Resolve a service name for a node, for the detail panel. */
export function ownerOf(atlas: Atlas, key: string): string | null {
  const edge = atlas.edges.find((e) => e.kind === "spine" && e.to === key);
  if (!edge) return null;
  return serviceByKey(edge.from as never)?.name ?? edge.from;
}
