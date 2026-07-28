"use client";

import * as React from "react";

/**
 * THE EFFECTS LAYER
 *
 * DIRECTION
 *   The instruments are honest and they were static, which made them read as a
 *   form. A tool people want to play with has to feel alive under the hands —
 *   numbers that travel to their new value, edges that carry a pulse, a curve
 *   that draws itself. None of that changes a single figure; it changes whether
 *   anybody stays long enough to read one.
 *
 * THE RULE EVERY HOOK HERE FOLLOWS
 *   Motion is decoration, so it must be *removable without loss*. Every hook
 *   below jumps straight to the final state when `prefers-reduced-motion` is
 *   set, and every animation loop stops when its panel is off screen. A page
 *   with seven canvases all running rAF forever is a laptop fan, and a
 *   vestibular trigger that no toggle disables is a page somebody cannot use.
 */

/** Live, not read-once: somebody can change the OS setting with the tab open. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(true); // safe until we know
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return reduced;
}

/**
 * A number that travels to its new value.
 *
 * Critical---exponential easing rather than a fixed duration, so rapid slider
 * drags chase the target instead of queueing up a hundred animations. Snaps on
 * the last fraction so a counter always lands exactly on the true value: a
 * readout that settles at 11,899 because the tween ran out of frames is a
 * wrong number, which is the one thing these instruments may never show.
 */
export function useCountUp(value: number, { decimals = 0 }: { decimals?: number } = {}): number {
  const reduced = useReducedMotion();
  const [shown, setShown] = React.useState(value);
  const raf = React.useRef<number>();
  const from = React.useRef(value);

  React.useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    const delta = value - origin;
    if (delta === 0) return;

    const DURATION = Math.min(700, 220 + Math.abs(delta) ** 0.32 * 40);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      // easeOutExpo — fast commit, slow settle. Reads as mechanical, not bouncy.
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      const next = origin + delta * eased;
      from.current = next;
      setShown(t === 1 ? value : next);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      from.current = value; // land exactly, even when interrupted
    };
  }, [value, reduced]);

  return decimals === 0 ? Math.round(shown) : Number(shown.toFixed(decimals));
}

/** Reveal on scroll. Fires once — a section that re-hides is a distraction. */
export function useInView<T extends HTMLElement>(): [React.RefObject<T>, boolean] {
  const ref = React.useRef<T>(null);
  const [seen, setSeen] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "-8% 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

/** Is this element on screen right now? Used to park animation loops. */
export function useOnScreen<T extends HTMLElement>(): [React.RefObject<T>, boolean] {
  const ref = React.useRef<T>(null);
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setOn(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => setOn(Boolean(e?.isIntersecting)), {
      rootMargin: "200px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, on];
}

/**
 * A requestAnimationFrame loop that behaves itself.
 *
 * Runs only while `active`, and hands the callback a monotonic seconds value
 * so drawing code never has to track its own clock. Under reduced motion it
 * fires exactly once with t=0, which every canvas here is written to treat as
 * "draw the finished state" — so the still frame is the same picture, minus
 * the movement.
 */
export function useFrameLoop(
  active: boolean,
  draw: (t: number) => void,
  deps: React.DependencyList,
) {
  const reduced = useReducedMotion();
  const cb = React.useRef(draw);
  cb.current = draw;

  React.useEffect(() => {
    if (reduced) {
      cb.current(0);
      return;
    }
    if (!active) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      cb.current((now - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reduced, ...deps]);
}

/** Wraps a panel so it rises into place the first time it is scrolled to. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={className}
      data-reveal={seen ? "in" : "out"}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/**
 * A canvas that sizes itself to its box and redraws on resize.
 *
 * Every instrument was doing this by hand and none of them handled a window
 * resize, so a canvas drawn at 1440px stayed a stretched 1440px bitmap when
 * the window narrowed. One component, correct once.
 */
export function FxCanvas({
  className,
  render,
  deps = [],
  animate = true,
}: {
  className?: string;
  /** Called with a fresh context already scaled for DPR. `t` is seconds. */
  render: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void;
  deps?: React.DependencyList;
  animate?: boolean;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [wrapRef, onScreen] = useOnScreen<HTMLDivElement>();
  const [size, setSize] = React.useState({ w: 0, h: 0 });

  React.useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fn = React.useRef(render);
  fn.current = render;

  useFrameLoop(
    animate && onScreen && size.w > 0,
    (t) => {
      const el = canvasRef.current;
      if (!el || size.w === 0 || size.h === 0) return;
      const ctx = el.getContext("2d");
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (el.width !== Math.floor(size.w * dpr)) el.width = Math.floor(size.w * dpr);
      if (el.height !== Math.floor(size.h * dpr)) el.height = Math.floor(size.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      fn.current(ctx, size.w, size.h, t);
    },
    [size.w, size.h, ...deps],
  );

  return (
    <div ref={wrapRef} className={className}>
      <canvas ref={canvasRef} aria-hidden className="h-full w-full" />
    </div>
  );
}
