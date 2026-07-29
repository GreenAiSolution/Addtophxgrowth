import { describe, expect, it } from "vitest";
import {
  buildAtlas,
  project,
  projectAll,
  sortedByDepth,
  hitTest,
  HIT_SLACK,
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

describe("the scene stays legible as the catalogue grows", () => {
  /**
   * The map is built from the catalogue, which means its density is decided by
   * a file nobody edits with the map in mind. Two automation builds were added
   * to AI Employees and the fan silently collapsed — the arc allocated to a
   * service was a constant divided by its upgrade count, so four upgrades got
   * the same total width as one, and two of them landed close enough on screen
   * that `hitTest` returned whichever was nearer rather than whichever was
   * pointed at.
   *
   * Nothing failed. The map rendered, every node projected, every edge
   * resolved, and the picture was simply wrong in a way only a person looking
   * at it would notice. So this is the check that looks.
   */
  const atlas = buildAtlas();

  it("keeps every upgrade clickable in the view a visitor actually lands on", () => {
    /*
      WHAT THIS CAN AND CANNOT PROMISE
        Not "no two nodes ever overlap". That is unachievable and it was worth
        finding out the hard way: an earlier version of this test swept the
        whole sphere of camera angles, and every layout that could be written
        failed it — including several that looked perfect. Rotate any 3D scene
        far enough and some pair of points will line up with the camera. That
        is what a 3D scene *is*, and `hitTest` already resolves it correctly by
        depth, which is its own test below.

        What is a real defect is the *resting* view being crowded — the frame
        every visitor sees before touching anything. That is where the fan
        collapse showed up: two upgrades twenty-four pixels apart at 1440 on
        first paint, with no drag involved.

      The bar is derived from `hitTest` rather than picked by eye. A first
      attempt used a flat 22px on an 1100x700 canvas and passed on the very
      layout that had just shipped the bug — a guessed threshold, checked at a
      size nobody renders, agreeing with the defect.
    */
    const RESTING = { yaw: 0.7, pitch: -0.34 }; // matches system-map.tsx
    for (const [w, h] of [
      [1400, 620],
      [1100, 700],
      [720, 520],
      [390, 460],
    ]) {
      const zoom = fitZoom(atlas, w!, h!);
      // The resting angle and a small neighbourhood of it, so the check is not
      // balanced on one exact float.
      for (const dy of [-0.25, -0.1, 0, 0.1, 0.25]) {
        const pts = projectAll(
          atlas,
          { yaw: RESTING.yaw + dy, pitch: RESTING.pitch, distance: 640, zoom },
          w!,
          h!,
        );
        const ups = [...pts.values()].filter((p) => p.node.kind === "upgrade");
        for (let i = 0; i < ups.length; i++) {
          for (let j = i + 1; j < ups.length; j++) {
            const a = ups[i]!;
            const b = ups[j]!;
            const d = Math.hypot(a.sx - b.sx, a.sy - b.sy);
            const need = HIT_SLACK * Math.max(0.5, a.scale, b.scale);
            expect(
              d,
              `${a.node.key}/${b.node.key} ${d.toFixed(1)}px apart, need ${need.toFixed(1)} ` +
                `at ${w}x${h} yaw ${(RESTING.yaw + dy).toFixed(2)}`,
            ).toBeGreaterThan(need);
          }
        }
      }
    }
  });

  it("gives a service's upgrades room in proportion to how many it has", () => {
    // The actual defect: a busy service being allocated the same arc as a
    // quiet one. Measured on the model rather than on screen, so it holds at
    // every camera angle at once.
    const bySector = new Map<string, number[]>();
    for (const u of UPGRADES) {
      const n = atlas.nodes.find((x) => x.key === u.key)!;
      const list = bySector.get(u.attachesTo) ?? [];
      list.push(Math.atan2(n.z, n.x));
      bySector.set(u.attachesTo, list);
    }
    for (const [service, angles] of bySector) {
      if (angles.length < 2) continue;
      const sorted = [...angles].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        expect(
          sorted[i]! - sorted[i - 1]!,
          `${service} packs its upgrades too tightly`,
        ).toBeGreaterThan(0.2);
      }
    }
  });

  it("still keeps the fans inside their own sectors", () => {
    // Room for a busy service must not be taken from its neighbour — an
    // upgrade drifting into the next sector would attach it, visually, to the
    // wrong parent service, which is the one thing this picture must not do.
    const sector = (Math.PI * 2) / PARENT_SERVICES.length;
    for (const u of UPGRADES) {
      const n = atlas.nodes.find((x) => x.key === u.key)!;
      const parent = atlas.nodes.find((x) => x.key === u.attachesTo)!;
      let delta = Math.atan2(n.z, n.x) - Math.atan2(parent.z, parent.x);
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      expect(
        Math.abs(delta),
        `${u.key} has drifted out of ${u.attachesTo}'s sector`,
      ).toBeLessThan(sector / 2);
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
