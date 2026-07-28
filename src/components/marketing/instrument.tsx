"use client";

import * as React from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { upgradeByKey } from "@/lib/upgrades";
import { formatCurrency } from "@/lib/utils";
import { pulse } from "@/components/marketing/pulse";
import { useCountUp, Reveal, useInView } from "@/components/marketing/fx";

/**
 * The shared chassis every instrument is mounted in.
 *
 * DIRECTION
 *   Seven instruments on one page have to read as seven panels of one machine,
 *   not seven widgets somebody found. That means the frame is identical every time —
 *   index, name, the one line saying what it reads, the working area, and a
 *   readout — and only the working area differs.
 *
 * THE READOUT IS THE POINT
 *   Each instrument ends in a verdict, and a verdict is allowed to say
 *   "nothing here is for you". One of the seven concludes that PHX/GROWTH
 *   already does this and sells nothing at all. That is deliberate: an
 *   instrument that can only ever point at a product is not an instrument, it
 *   is a quiz with a coupon at the end, and every owner reading this has taken
 *   one before.
 */

export type Verdict = "clear" | "gap" | "covered";

const TONE: Record<
  Verdict,
  { ring: string; text: string; dot: string; label: string }
> = {
  clear: {
    ring: "border-signal/30",
    text: "text-signal",
    dot: "bg-signal",
    label: "Clear",
  },
  gap: {
    ring: "border-gold/35",
    text: "text-gold",
    dot: "bg-gold",
    label: "Gap found",
  },
  covered: {
    ring: "border-cyan/30",
    text: "text-cyan",
    dot: "bg-cyan",
    label: "Already covered",
  },
};

export function Instrument({
  index,
  name,
  reads,
  children,
  id,
  total = 7,
}: {
  index: number;
  name: string;
  /** One line, in plain English. What does this tool show you? */
  reads: string;
  id: string;
  total?: number;
  children: React.ReactNode;
}) {
  const [ref, live] = useInView<HTMLElement>();

  return (
    <section
      id={id}
      ref={ref}
      className="relative scroll-mt-24 py-16 md:py-24"
      data-module={String(index).padStart(2, "0")}
    >
      {/*
        THE SPINE.

        A glowing line running the full height of every module, with a node at
        this module's header. It is what turns seven stacked panels into one
        machine you are travelling down — the single cheapest way to say "these
        are connected" without writing the sentence.

        Hidden below lg, where there is no gutter to put it in and it would
        just eat width from the tools themselves.
      */}
      <div
        aria-hidden
        /*
          Parked in the gutter to the LEFT of the container, never inside it.
          The container is centred at max 1400px with 1.5rem padding, so at
          1440px the free gutter is only ~44px wide — an earlier value of
          50%-38rem put the rail at 112px, straight through the module number.
          `max()` keeps it on screen on narrower viewports, and it is hidden
          below xl where there is no gutter worth the name.
        */
        className="pointer-events-none absolute inset-y-0 left-[max(0.75rem,calc(50%-45rem))] hidden xl:block"
      >
        <div className="h-full w-px bg-gradient-to-b from-transparent via-cyan/25 to-transparent" />
        <div
          className={cn(
            "absolute left-1/2 top-[5.4rem] h-2.5 w-2.5 -translate-x-1/2 rounded-full border transition-all duration-700",
            live
              ? "border-cyan bg-cyan shadow-[0_0_18px_2px_hsl(var(--hud-cyan)/0.75)]"
              : "border-white/25 bg-background",
          )}
        />
      </div>

      <div className="container">
        <Reveal>
          <header className="flex flex-col gap-4 md:flex-row md:items-start md:gap-7">
            {/* The module stamp. Reads as a serial number on a rack unit. */}
            <div className="flex shrink-0 items-center gap-3 md:flex-col md:items-start md:gap-1.5">
              <span
                className={cn(
                  "font-mono text-[2.4rem] font-bold leading-none tabular-nums tracking-tighter transition-colors duration-700 md:text-[3.4rem]",
                  live ? "text-gradient" : "text-white/12",
                )}
              >
                {String(index).padStart(2, "0")}
              </span>
              <span className="font-mono text-[0.58rem] tracking-[0.24em] text-muted-foreground/50">
                / {String(total).padStart(2, "0")}
              </span>
            </div>

            <div className="min-w-0 pt-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className={cn("h-1.5 w-1.5 rounded-full bg-signal", live && "fx-live text-signal")} />
                <span className="eyebrow text-[0.56rem] text-signal">
                  {live ? "Module running" : "Module ready"}
                </span>
              </div>
              <h2 className="mt-2.5 text-[2rem] font-bold leading-[1.05] tracking-tight md:text-[2.9rem]">
                {name}
              </h2>
              <p className="mt-3 max-w-2xl text-[1.02rem] leading-relaxed text-muted-foreground">
                {reads}
              </p>
            </div>
          </header>
        </Reveal>
        <Reveal delay={90} className="mt-10">
          {children}
        </Reveal>
      </div>
    </section>
  );
}

/**
 * The verdict panel. Attaches to a real upgrade, or explicitly to nothing.
 *
 * `upgradeKey` resolves through the catalogue so the price shown here can
 * never drift from the price shown anywhere else. An unknown key throws at
 * render rather than quietly printing nothing — the same discipline the Gap
 * Finder uses, for the same reason.
 */
export function Readout({
  verdict,
  headline,
  body,
  upgradeKey,
  onAdd,
}: {
  verdict: Verdict;
  headline: string;
  body: string;
  /** Omit when the honest answer is that we sell nothing for this. */
  upgradeKey?: string;
  onAdd?: (key: string) => void;
}) {
  const tone = TONE[verdict];
  const upgrade = upgradeKey ? upgradeByKey(upgradeKey) : undefined;
  if (upgradeKey && !upgrade) {
    throw new Error(
      `Readout points at unknown upgrade "${upgradeKey}". Instruments must resolve against the catalogue.`,
    );
  }

  // A sheen sweeps the panel each time the verdict changes, so a visitor who
  // just flipped one toggle at the top of a long instrument is told where the
  // consequence landed.
  const [flash, setFlash] = React.useState(false);
  const prev = React.useRef(verdict);
  React.useEffect(() => {
    if (prev.current !== verdict) {
      prev.current = verdict;
      setFlash(true);
      const id = window.setTimeout(() => setFlash(false), 1100);
      return () => window.clearTimeout(id);
    }
  }, [verdict]);

  return (
    <div
      className={cn(
        "mt-7 rounded-2xl border bg-black/25 p-6 md:p-7",
        tone.ring,
        flash && "fx-sheen",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            tone.dot,
            verdict === "gap" && "fx-live text-gold",
          )}
        />
        <span className={cn("eyebrow text-[0.6rem]", tone.text)}>
          {tone.label}
        </span>
      </div>

      <p className="mt-3 text-lg font-semibold leading-snug tracking-tight md:text-xl">
        {headline}
      </p>
      <p className="mt-2 max-w-2xl text-[0.9rem] leading-relaxed text-muted-foreground">
        {body}
      </p>

      {upgrade ? (
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-white/[0.07] pt-5">
          <div className="min-w-0">
            <div className="eyebrow text-[0.58rem] text-muted-foreground/70">
              What closes it
            </div>
            <div className="mt-1 font-semibold">{upgrade.name}</div>
          </div>
          <div className="font-mono text-sm tabular-nums text-muted-foreground">
            {formatCurrency(upgrade.price)}
            <span className="text-xs">
              {upgrade.billing === "monthly" ? "/mo" : " once"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              onAdd?.(upgrade.key);
              // The enquiry form already listens for this; dispatching it here
              // means an instrument's verdict and the basket stay one thing
              // without threading state through every panel.
              window.dispatchEvent(
                new CustomEvent("phx:toggle-upgrade", { detail: upgrade.key }),
              );
              pulse("upgrade_added", upgrade.key);
              document
                .getElementById("compose")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
            className="pill-primary ml-auto text-sm"
          >
            Add to the stack <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="mt-5 border-t border-white/[0.07] pt-5">
          <div className="eyebrow text-[0.58rem] text-muted-foreground/70">
            What we sell for it
          </div>
          <div className="mt-1 font-semibold text-cyan">Nothing.</div>
        </div>
      )}
    </div>
  );
}

/** A labelled control row, used by every instrument that takes numbers. */
export function Dial({
  label,
  hint,
  value,
  display,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  const id = React.useId();
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[0.82rem] text-muted-foreground">
          {label}
        </label>
        <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
          {display}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-cyan"
      />
      {hint && (
        <p className="mt-1 text-[0.7rem] leading-relaxed text-muted-foreground/70">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * A disclosure. Everything optional on this site hides behind one of these.
 *
 * WHY IT EXISTS
 *   The Response Clock shipped asking for ten numbers. Every other instrument
 *   asks for one to three, and ten in a column reads as a tax return — the
 *   visitor stops before the instrument has told them anything, which is a
 *   worse outcome than a slightly less precise answer. The same problem at
 *   page scale: eight modules stacked is a wall, however good each one is.
 *
 *   So the rule is the same in both places. Show the few inputs that move the
 *   answer most, put the rest behind a fold with honest defaults already
 *   applied, and say in the summary what is inside so opening it is a choice
 *   rather than a gamble. Nothing is hidden that changes what is being claimed.
 *
 * WHY <details>
 *   Native, so it is keyboard-reachable and screen-reader-announced without a
 *   line of state, it works before hydration, and it opens instantly under
 *   `prefers-reduced-motion` because there is no animation to suppress. A
 *   hand-rolled version would have had to earn all four back.
 */
export function Fold({
  summary,
  hint,
  children,
  defaultOpen = false,
  className,
}: {
  summary: string;
  /** What is inside, so opening it is an informed choice. */
  hint?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details
      open={defaultOpen}
      className={cn("group rounded-xl border border-white/[0.07] bg-black/20", className)}
    >
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03]",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan",
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        <span
          aria-hidden
          className="grid h-5 w-5 shrink-0 place-items-center rounded border border-white/15 text-muted-foreground transition-transform duration-200 group-open:rotate-45"
        >
          <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor">
            <path d="M5 1v8M1 5h8" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
        <span className="min-w-0">
          <span className="block text-[0.85rem] font-medium leading-tight">{summary}</span>
          {hint && (
            <span className="mt-0.5 block text-[0.72rem] leading-snug text-muted-foreground">
              {hint}
            </span>
          )}
        </span>
      </summary>
      <div className="border-t border-white/[0.06] p-4">{children}</div>
    </details>
  );
}

/**
 * A two-state switch used wherever the visitor is asserting a fact about their
 * own business. Deliberately not a checkbox: the two states are not on/off,
 * they are two different claims, and naming both keeps the visitor from
 * skimming past what they are asserting.
 */
export function Toggle({
  checked,
  onChange,
  label,
  sublabel,
  tone = "cyan",
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  sublabel?: string;
  tone?: "cyan" | "gold";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan",
        disabled && "cursor-not-allowed opacity-40",
        checked
          ? tone === "gold"
            ? "border-gold/40 bg-gold/[0.08]"
            : "border-cyan/40 bg-cyan/[0.07]"
          : "border-white/[0.08] bg-white/[0.02] hover:border-white/20",
      )}
    >
      <span
        className={cn(
          "grid h-4 w-4 shrink-0 place-items-center rounded-sm border transition-colors",
          checked
            ? tone === "gold"
              ? "border-gold bg-gold text-black"
              : "border-cyan bg-cyan text-black"
            : "border-white/25",
        )}
        aria-hidden
      >
        {checked && (
          <svg
            viewBox="0 0 10 10"
            className="h-2.5 w-2.5"
            fill="none"
            stroke="currentColor"
          >
            <path d="M1 5l2.5 2.5L9 2" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[0.85rem] leading-tight">
          {label}
        </span>
        {sublabel && (
          <span className="mt-0.5 block truncate text-[0.7rem] text-muted-foreground">
            {sublabel}
          </span>
        )}
      </span>
    </button>
  );
}

/** A big figure with its unit and caption, used in every readout strip. */
export function Figure({
  value,
  unit,
  caption,
  tone = "plain",
}: {
  value: string;
  unit?: string;
  caption: string;
  tone?: "plain" | "cyan" | "gold" | "signal" | "magenta";
}) {
  /**
   * Counts up when the value is a plain number, and is left completely alone
   * when it is not. A readout like "$11,900" or "—" has to render exactly as
   * given; guessing at its numeric part is how a currency symbol goes missing
   * or a placeholder becomes a zero.
   */
  const numeric = /^-?\d+$/.test(value) ? Number(value) : null;
  const counted = useCountUp(numeric ?? 0);
  const shown = numeric === null ? value : String(counted);

  const color = {
    plain: "text-foreground",
    cyan: "text-cyan",
    gold: "text-gold",
    signal: "text-signal",
    magenta: "text-magenta",
  }[tone];
  return (
    <div className="min-w-0">
      <div
        className={cn(
          "font-mono text-2xl font-bold tabular-nums tracking-tight md:text-3xl",
          color,
        )}
      >
        {shown}
        {unit && (
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
      <div className="mt-1 text-[0.72rem] leading-snug text-muted-foreground">
        {caption}
      </div>
    </div>
  );
}
