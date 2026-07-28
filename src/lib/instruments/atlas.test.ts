import { describe, expect, it } from "vitest";
import {
  buildAtlas,
  project,
  projectAll,
  sortedByDepth,
  hitTest,
  neighbours,
  atlasCounts,
  atlasExtent,
  fitZoom,
  PITCH_LIMIT,
  type Camera,
} from "./atlas";
import { PARENT_SERVICES, UPGRADES, BUNDLES } from "@/lib/upgrades";

/**
 * The map's whole claim is that it shows the real business. A pretty diagram
 * of relationships that do not exist would be the most persuasive lie on the
 * site, because a picture is believed faster than a sentence.
 *
 * So these tests do two jobs. First, the arithmetic: rotation and perspective
 * have to be finite, stable and correctly ordered, or nodes tear through each
 * other on drag. Second, and more important, the structure: every node and
 * every edge has to resolve to something in the catalogue.
 */

const CAM: Camera = { yaw: 0.6, pitch: -0.35, distance: 620 };

describe("what the map is made of", () => {
  const atlas = buildAtlas();

  it("has exactly one core, and it is the origin", () => {
    const core = atlas.nodes.filter((n) => n.kind === "core");
    expect(core).toHaveLength(1);
    expect([core[0]!.x, core[0]!.y, core[0]!.z]).toEqual([0, 0, 0]);
  });

  it("shows every service and every upgrade the business actually sells", () => {
    const c = atlasCounts(atlas);
    expect(c.services).toBe(PARENT_SERVICES.length);
    expect(c.upgrades).toBe(UPGRADES.length);
    for (const u of UPGRADES) {
      expect(atlas.nodes.some((n) => n.key === u.key), u.key).toBe(true);
    }
  });

  it("never invents a relationship the catalogue does not have", () => {
    // The load-bearing test. A gold arc between two upgrades that share no
    // bundle would be a picture of a product we do not sell.
    const keys = new Set(atlas.nodes.map((n) => n.key));
    for (const e of atlas.edges) {
      expect(keys.has(e.from), `edge from unknown node ${e.from}`).toBe(true);
      expect(keys.has(e.to), `edge to unknown node ${e.to}`).toBe(true);
    }
    for (const e of atlas.edges.filter((x) => x.kind === "bundle")) {
      const shared = BUNDLES.some(
        (b) => b.members.includes(e.from) && b.members.includes(e.to),
      );
      expect(shared, `${e.from} ↔ ${e.to} share no bundle`).toBe(true);
    }
  });

  it("hangs every upgrade off the service it really attaches to", () => {
    for (const u of UPGRADES) {
      const spine = atlas.edges.find((e) => e.kind === "spine" && e.to === u.key);
      expect(spine, `${u.key} is not attached to anything`).toBeDefined();
      expect(spine!.from).toBe(u.attachesTo);
    }
  });

  it("draws every bundle pair exactly once", () => {
    const seen = new Set<string>();
    for (const e of atlas.edges.filter((x) => x.kind === "bundle")) {
      const id = [e.from, e.to].sort().join("|");
      expect(seen.has(id), `${id} drawn twice`).toBe(false);
      seen.add(id);
    }
    // Every pair inside every bundle is present.
    for (const b of BUNDLES) {
      for (let i = 0; i < b.members.length; i++) {
        for (let j = i + 1; j < b.members.length; j++) {
          const id = [b.members[i]!, b.members[j]!].sort().join("|");
          expect(seen.has(id), `${b.key} is missing ${id}`).toBe(true);
        }
      }
    }
  });

  it("aims every tool beam at a node that exists", () => {
    const keys = new Set(atlas.nodes.map((n) => n.key));
    const beams = atlas.edges.filter((e) => e.kind === "beam");
    expect(beams.length).toBe(atlasCounts(atlas).tools);
    for (const b of beams) expect(keys.has(b.to), `beam at ${b.to}`).toBe(true);
  });

  it("lets a visitor add only real upgrades from the map", () => {
    // Clicking a node dispatches `addable`. If that ever carried a service or
    // the core, the map would put something unsellable in the basket.
    const sellable = new Set(UPGRADES.map((u) => u.key));
    for (const n of atlas.nodes) {
      if (!n.addable) continue;
      expect(sellable.has(n.addable), `${n.key} claims to add ${n.addable}`).toBe(true);
      expect(n.kind).toBe("upgrade");
    }
  });

  it("gives every node something a person can read", () => {
    for (const n of atlas.nodes) {
      expect(n.label.length, n.key).toBeGreaterThan(2);
      expect(n.blurb.length, n.key).toBeGreaterThan(10);
    }
  });

  it("is deterministic — the same scene every time", () => {
    expect(buildAtlas()).toEqual(atlas);
  });
});

describe("the camera", () => {
  const atlas = buildAtlas();

  it("projects every node to a finite point at any angle", () => {
    // Dragging sweeps the full range. A single NaN blanks the whole canvas.
    for (let yaw = -Math.PI * 2; yaw <= Math.PI * 2; yaw += 0.37) {
      for (const pitch of [-1.2, -0.6, 0, 0.6, 1.2]) {
        for (const n of atlas.nodes) {
          const p = project(n, { yaw, pitch, distance: 620 }, 800, 600);
          expect(Number.isFinite(p.sx), `${n.key} sx`).toBe(true);
          expect(Number.isFinite(p.sy), `${n.key} sy`).toBe(true);
          expect(Number.isFinite(p.scale)).toBe(true);
          expect(p.scale).toBeGreaterThan(0);
        }
      }
    }
  });

  it("never explodes when a node passes behind the camera", () => {
    // Without the clamp on the denominator, a node at z = -distance divides by
    // zero and the scene turns inside out mid-drag.
    const far = atlas.nodes.reduce((a, b) => (Math.abs(b.z) > Math.abs(a.z) ? b : a));
    for (const distance of [1, 50, 120, 240]) {
      const p = project(far, { yaw: 0, pitch: 0, distance }, 800, 600);
      expect(Number.isFinite(p.sx)).toBe(true);
      expect(p.scale).toBeLessThan(50);
    }
  });

  it("puts the core in the middle of the canvas, whatever the angle", () => {
    for (const yaw of [0, 1, 2, 3]) {
      const p = project(
        atlas.nodes.find((n) => n.kind === "core")!,
        { yaw, pitch: -0.3, distance: 620 },
        800,
        600,
      );
      expect(p.sx).toBeCloseTo(400, 6);
      expect(p.sy).toBeCloseTo(300, 6);
    }
  });

  it("draws far things first so near things paint over them", () => {
    const order = sortedByDepth(projectAll(atlas, CAM, 800, 600));
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.depth).toBeGreaterThanOrEqual(order[i]!.depth);
    }
  });

  it("makes nearer nodes larger", () => {
    const pts = projectAll(atlas, CAM, 800, 600);
    const all = [...pts.values()];
    const near = all.reduce((a, b) => (b.depth < a.depth ? b : a));
    const far = all.reduce((a, b) => (b.depth > a.depth ? b : a));
    expect(near.scale).toBeGreaterThan(far.scale);
  });

  it("spins a full turn back to where it started", () => {
    const a = project(atlas.nodes[3]!, { ...CAM, yaw: 0.4 }, 800, 600);
    const b = project(atlas.nodes[3]!, { ...CAM, yaw: 0.4 + Math.PI * 2 }, 800, 600);
    expect(b.sx).toBeCloseTo(a.sx, 6);
    expect(b.sy).toBeCloseTo(a.sy, 6);
  });
});

describe("fitting the object to its panel", () => {
  const atlas = buildAtlas();

  it("measures the scene instead of assuming it", () => {
    const { radial, vertical } = atlasExtent(atlas);
    const maxR = Math.max(...atlas.nodes.map((n) => Math.hypot(n.x, n.z)));
    expect(radial).toBeCloseTo(maxR, 6);
    expect(vertical).toBeCloseTo(Math.max(...atlas.nodes.map((n) => Math.abs(n.y))), 6);
  });

  it("makes the object bigger on a bigger canvas, never smaller", () => {
    // The first fit produced a zoom below 1 and shrank the map. A fit that can
    // make something smaller than not fitting it at all is not a fit.
    const small = fitZoom(atlas, 600, 380);
    const large = fitZoom(atlas, 1100, 700);
    expect(large).toBeGreaterThan(small);
    expect(large).toBeGreaterThan(1);
  });

  it("keeps every node inside the canvas at the fitted zoom", () => {
    const w = 900;
    const h = 560;
    const zoom = fitZoom(atlas, w, h);
    for (const yaw of [0, 0.8, 1.9, 3.4, 5.1]) {
      for (const pitch of [-PITCH_LIMIT, -0.34, 0, PITCH_LIMIT * 0.45]) {
        const pts = projectAll(atlas, { yaw, pitch, distance: 640, zoom }, w, h);
        for (const p of pts.values()) {
          expect(p.sx, `${p.node.key} x`).toBeGreaterThan(-10);
          expect(p.sx, `${p.node.key} x`).toBeLessThan(w + 10);
          expect(p.sy, `${p.node.key} y`).toBeGreaterThan(-10);
          expect(p.sy, `${p.node.key} y`).toBeLessThan(h + 10);
        }
      }
    }
  });
});

describe("picking things out of the scene", () => {
  const atlas = buildAtlas();
  const pts = projectAll(atlas, CAM, 800, 600);

  it("finds the node you clicked on", () => {
    const target = atlas.nodes.find((n) => n.kind === "upgrade")!;
    const p = pts.get(target.key)!;
    expect(hitTest(pts, p.sx, p.sy)?.key).toBe(target.key);
  });

  it("returns nothing for empty space", () => {
    expect(hitTest(pts, -5000, -5000)).toBeNull();
  });

  it("picks the nearest when two overlap", () => {
    // Painter's order draws the near one on top, so a click has to agree with
    // what the eye sees.
    const all = [...pts.values()];
    const near = all.reduce((a, b) => (b.depth < a.depth ? b : a));
    const hit = hitTest(pts, near.sx, near.sy);
    const overlapping = all.filter((p) => Math.hypot(p.sx - near.sx, p.sy - near.sy) < 20);
    const nearest = overlapping.reduce((a, b) => (b.depth < a.depth ? b : a));
    expect(hit?.key).toBe(nearest.node.key);
  });

  it("lights an upgrade's service, its bundle partners and the tools reading it", () => {
    const key = UPGRADES[0]!.key;
    const lit = neighbours(atlas, key);
    expect(lit.has(key)).toBe(true);
    expect(lit.has(UPGRADES[0]!.attachesTo)).toBe(true);
    for (const b of BUNDLES.filter((x) => x.members.includes(key))) {
      for (const m of b.members) expect(lit.has(m), `${b.key} → ${m}`).toBe(true);
    }
  });

  it("lights every service when the core is selected", () => {
    const lit = neighbours(atlas, "core");
    for (const s of PARENT_SERVICES) expect(lit.has(s.key), s.key).toBe(true);
  });
});
