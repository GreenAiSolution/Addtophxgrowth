"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Grid2X2, Maximize2, X } from "lucide-react";
import { ACTS, SLIDES, RUNNING_TIME, actLabel } from "@/lib/presentation";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { SlideView } from "./slide-view";

/**
 * The stage — what gets screen-shared on the Zoom.
 *
 * WHAT IT DELIBERATELY DOES NOT HAVE
 *   A notes panel. The talk track lives at `/present/run-sheet`, opened on a
 *   phone or a second monitor, and this component cannot import it — the run
 *   sheet also carries our own economics, and a keystroke that reveals those
 *   over a shared screen is a mistake waiting for a bad afternoon. A test
 *   enforces the import ban rather than trusting anybody to remember.
 *
 * THE URL IS THE POSITION
 *   The hash tracks the slide id, so the presenter can reload mid-call, send
 *   somebody straight to slide fourteen after it, or open the deck at the
 *   ceiling slide when a prospect only has ten minutes. Reading the hash on
 *   mount also means a browser-restored tab lands where it left off.
 *
 * KEYS
 *   → ← space for movement, G for the overview, F for fullscreen, Esc to leave
 *   the overview. Arrow keys are what every remote clicker sends, which is the
 *   only reason they are the primary binding.
 */

const LAST = SLIDES.length - 1;

export function Stage() {
  const [i, setI] = useState(0);
  const [overview, setOverview] = useState(false);

  /**
   * Open on whatever the URL names, and keep obeying it.
   *
   * The mount-only version of this looked correct and was not: a hash-only
   * navigation does not remount the page, so pasting `#ceiling` into the
   * address bar mid-call changed the URL and left the deck exactly where it
   * was. Every deep link into this deck is a hash-only navigation, which made
   * the feature nothing but a URL that lies about what is on screen.
   */
  useEffect(() => {
    function fromHash() {
      const id = window.location.hash.replace(/^#/, "");
      if (!id) return;
      const found = SLIDES.findIndex((s) => s.id === id);
      if (found >= 0) {
        setI(found);
        setOverview(false);
      }
    }
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const go = useCallback((next: number) => {
    const clamped = Math.min(LAST, Math.max(0, next));
    setI(clamped);
    setOverview(false);
    // replaceState, not a hash assignment: pushing an entry per slide turns the
    // back button into a slide-by-slide rewind of the whole call.
    window.history.replaceState(null, "", `#${SLIDES[clamped]!.id}`);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case "ArrowRight":
        case "PageDown":
        case " ":
          e.preventDefault();
          setI((n) => {
            const next = Math.min(LAST, n + 1);
            window.history.replaceState(null, "", `#${SLIDES[next]!.id}`);
            return next;
          });
          setOverview(false);
          break;
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          setI((n) => {
            const next = Math.max(0, n - 1);
            window.history.replaceState(null, "", `#${SLIDES[next]!.id}`);
            return next;
          });
          setOverview(false);
          break;
        case "Home":
          e.preventDefault();
          setI(0);
          break;
        case "End":
          e.preventDefault();
          setI(LAST);
          break;
        case "g":
        case "G":
          setOverview((o) => !o);
          break;
        case "Escape":
          setOverview(false);
          break;
        case "f":
        case "F":
          if (document.fullscreenElement) void document.exitFullscreen();
          else void document.documentElement.requestFullscreen().catch(() => {});
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const slide = SLIDES[i]!;
  const progress = ((i + 1) / SLIDES.length) * 100;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
      {/* ── Chrome ─────────────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center gap-4 border-b border-white/[0.07] px-5 py-3">
        <span className="text-sm font-bold tracking-[0.16em]">
          <span className="text-gradient">{BRAND.wordmarkLead}</span>
          <span className="text-foreground">{BRAND.wordmarkMid}</span>
        </span>

        {/* The act rail. A prospect who can see there are five acts and that we
            are in the second one asks fewer "how long is this" questions than
            one watching an unnumbered stream of slides. */}
        <nav className="hidden items-center gap-1.5 md:flex" aria-label="Acts">
          {ACTS.map((a) => {
            const first = SLIDES.findIndex((s) => s.act === a.key);
            const active = slide.act === a.key;
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => go(first)}
                className={cn(
                  "eyebrow rounded-full border px-3 py-1.5 text-[0.55rem] transition-colors",
                  active
                    ? "border-cyan/40 bg-cyan/10 text-cyan"
                    : "border-white/10 text-muted-foreground/70 hover:text-foreground",
                )}
              >
                {a.label}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden font-mono text-[0.62rem] tracking-[0.2em] text-muted-foreground/60 sm:inline">
            {String(i + 1).padStart(2, "0")} / {SLIDES.length} · ~{RUNNING_TIME}m
          </span>
          <button
            type="button"
            onClick={() => setOverview((o) => !o)}
            aria-label="Slide overview"
            className="rounded-lg border border-white/10 p-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            {overview ? <X className="h-4 w-4" /> : <Grid2X2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void document.documentElement.requestFullscreen().catch(() => {});
            }}
            aria-label="Fullscreen"
            className="rounded-lg border border-white/10 p-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ── Stage ──────────────────────────────────────────────────────── */}
      {overview ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {SLIDES.map((s, n) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => go(n)}
                  className={cn(
                    "flex h-full w-full flex-col items-start gap-1.5 rounded-xl border p-4 text-left transition-colors",
                    n === i
                      ? "border-cyan/40 bg-cyan/[0.06]"
                      : "border-white/[0.08] hover:border-white/20 hover:bg-white/[0.03]",
                  )}
                >
                  <span className="flex w-full items-baseline justify-between gap-3">
                    <span className="font-mono text-[0.62rem] tracking-[0.2em] text-cyan">
                      {String(n + 1).padStart(2, "0")}
                    </span>
                    <span className="eyebrow text-[0.52rem] text-muted-foreground/70">
                      {actLabel(s.act)} · {s.minutes}m
                    </span>
                  </span>
                  <span className="text-[0.95rem] font-semibold leading-tight">{s.title}</span>
                  <span className="text-[0.72rem] leading-snug text-muted-foreground">
                    {s.eyebrow}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <main className="relative min-h-0 flex-1 overflow-hidden">
          <div className="aurora" aria-hidden />
          {/* keyed so each slide re-runs the entrance rather than cross-fading
              stale content — a Zoom encoder makes a cross-fade look like lag. */}
          <div
            key={slide.id}
            className="relative mx-auto h-full w-full max-w-[100rem] animate-rise-in px-6 py-7 md:px-12 md:py-10"
          >
            <SlideView slide={slide} />
          </div>

          {/* Click targets. A presenter with a trackpad and no clicker still
              needs to advance without hunting for a small button. */}
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => go(i - 1)}
            disabled={i === 0}
            className="group absolute inset-y-0 left-0 w-16 cursor-w-resize disabled:cursor-default"
          >
            <ArrowLeft className="mx-auto h-5 w-5 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/60 group-disabled:text-muted-foreground/0" />
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => go(i + 1)}
            disabled={i === LAST}
            className="group absolute inset-y-0 right-0 w-16 cursor-e-resize disabled:cursor-default"
          >
            <ArrowRight className="mx-auto h-5 w-5 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/60 group-disabled:text-muted-foreground/0" />
          </button>
        </main>
      )}

      {/* ── Progress ───────────────────────────────────────────────────── */}
      <footer className="shrink-0 border-t border-white/[0.07]">
        <div className="h-[3px] w-full bg-white/[0.06]">
          <div
            className="h-full bg-gradient-to-r from-cyan via-violet to-magenta transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between gap-4 px-5 py-2.5">
          <span className="eyebrow text-[0.55rem] text-muted-foreground/60">
            {actLabel(slide.act)}
          </span>
          <span className="hidden font-mono text-[0.58rem] tracking-[0.18em] text-muted-foreground/40 sm:inline">
            ← → move · G overview · F fullscreen
          </span>
        </div>
      </footer>
    </div>
  );
}
