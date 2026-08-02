"use client";

import * as React from "react";
import { Sparkles, RotateCcw, ArrowRight } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { UPGRADES, BUNDLES, bundleSaving } from "@/lib/upgrades";
import { ENTITY_ATTRIBUTES, readEntity, type EntityAnswers } from "@/lib/instruments/entity";
import {
  CITATION_SOURCES,
  readCorroboration,
  type CorroborationAnswers,
} from "@/lib/instruments/corroboration";
import { readFan } from "@/lib/instruments/queries";
import { CLOCK_DEFAULTS, readClock, type ClockInputs } from "@/lib/instruments/response";
import { computeLeak, type LeakInputs } from "@/lib/leak";
import { CHANNEL_DEFAULTS, readMarginal, type ChannelInput } from "@/lib/instruments/marginal";
import { useCountUp } from "@/components/marketing/fx";
import { pulse } from "@/components/marketing/pulse";

/**
 * THE PLAYGROUND
 *
 * DIRECTION
 *   Seven instruments each holding their own state is seven forms. One store
 *   behind all of them is a machine — the Inspector's answers light the Query
 *   Fan, the Fan's verdict lands in the same rail as the Clock's, and one
 *   button fills the whole thing in.
 *
 * WHY THE SAMPLE BUTTON MATTERS MORE THAN IT LOOKS
 *   An empty instrument is a chore. A visitor who has to answer ten toggles
 *   before anything happens mostly does not, and the most impressive thing on
 *   the page never gets seen. "Load a sample business" fills every instrument
 *   with a coherent, deliberately unflattering profile, so the machine is
 *   running within a second of arrival — and then their own numbers are one
 *   edit away.
 *
 *   The sample is a plausible trade business with real problems: on the maps
 *   but with a conflicting Yelp record, no published hours or price, a
 *   twenty-minute callback. It is not a strawman and it is not a success
 *   story. It is what most accounts actually look like.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *   It does not persist anything, phone anything home, or read the URL. The
 *   whole state is in memory for as long as the tab is open, which is the
 *   honest arrangement for a page that asks a business owner to type their
 *   close rate into a stranger's website.
 */

export type Verdict = "untouched" | "clear" | "gap" | "covered";

export interface PlaygroundState {
  entity: EntityAnswers;
  setEntity: React.Dispatch<React.SetStateAction<EntityAnswers>>;
  business: string;
  setBusiness: (s: string) => void;
  citations: CorroborationAnswers;
  setCitations: React.Dispatch<React.SetStateAction<CorroborationAnswers>>;
  clock: ClockInputs;
  setClock: React.Dispatch<React.SetStateAction<ClockInputs>>;
  money: LeakInputs;
  setMoney: React.Dispatch<React.SetStateAction<LeakInputs>>;
  channels: ChannelInput[];
  setChannels: React.Dispatch<React.SetStateAction<ChannelInput[]>>;
  exponent: number;
  setExponent: (n: number) => void;
  picked: string[];
  toggle: (key: string) => void;
  add: (key: string) => void;
  /** True for a beat after a sample loads, so panels can flash. */
  justSeeded: boolean;
}

const Ctx = React.createContext<PlaygroundState | null>(null);

export function usePlayground(): PlaygroundState {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("usePlayground must be used inside <Playground>");
  return v;
}

const MONEY_DEFAULTS: LeakInputs = {
  callsPerMonth: 180,
  missedPct: 22,
  closeRate: 35,
  jobValue: 85_000,
  recovery: 0.5,
};

/** A real-shaped account: mostly fine, quietly leaking in four places. */
const SAMPLE = {
  business: "Copper State Plumbing",
  entity: {
    name: { stated: true, corroborated: true },
    category: { stated: true, corroborated: true },
    area: { stated: true, corroborated: false },
    phone: { stated: true, corroborated: true },
    services: { stated: true, corroborated: false },
    sameAs: { stated: true, corroborated: false },
    // The four that are actually missing, and the ones that cost the most.
  } as EntityAnswers,
  citations: {
    gbp: { present: true, consistent: true },
    apple: { present: true, consistent: false },
    bing: { present: true, consistent: true },
    yelp: { present: true, consistent: false },
    bbb: { present: true, consistent: true },
    facebook: { present: true, consistent: false },
    trade: { present: true, consistent: true },
  } as CorroborationAnswers,
  clock: { ...CLOCK_DEFAULTS, callbackMinutes: 22, competitorMinutes: 4 },
  money: { ...MONEY_DEFAULTS, callsPerMonth: 240, missedPct: 26, jobValue: 92_000 },
  channels: [
    { key: "meta", name: "Meta", spend: 6500, leads: 130 },
    { key: "google", name: "Google", spend: 11_000, leads: 165 },
    { key: "tiktok", name: "TikTok", spend: 1500, leads: 14 },
  ] as ChannelInput[],
  exponent: 0.62,
};

/**
 * `rail` exists for the map's own page.
 *
 * The Hud is a contents bar for the deck: a dot per instrument, each one an
 * anchor into a module further down the same page. On `/map` there are no
 * modules further down, so every one of those anchors would point at an id
 * that does not exist on the document — seven dead links, rendered by a
 * component whose whole job is to tell you where you are.
 *
 * The store still has to be provided, because the map reads and writes the
 * same selection the deck does: add an upgrade from the map on its own page,
 * then open the deck, and the composer already has it.
 */
export function Playground({
  children,
  rail = true,
}: {
  children: React.ReactNode;
  rail?: boolean;
}) {
  const [entity, setEntity] = React.useState<EntityAnswers>({});
  const [business, setBusiness] = React.useState("");
  const [citations, setCitations] = React.useState<CorroborationAnswers>({});
  const [clock, setClock] = React.useState<ClockInputs>(CLOCK_DEFAULTS);
  const [money, setMoney] = React.useState<LeakInputs>(MONEY_DEFAULTS);
  const [channels, setChannels] = React.useState<ChannelInput[]>(CHANNEL_DEFAULTS);
  const [exponent, setExponent] = React.useState(1);
  const [picked, setPicked] = React.useState<string[]>([]);
  const [justSeeded, setJustSeeded] = React.useState(false);

  const toggle = React.useCallback((key: string) => {
    if (!UPGRADES.some((u) => u.key === key)) return;
    setPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
    pulse("upgrade_added", key);
  }, []);

  const add = React.useCallback((key: string) => {
    if (!UPGRADES.some((u) => u.key === key)) return;
    setPicked((prev) => (prev.includes(key) ? prev : [...prev, key]));
    pulse("upgrade_added", key);
  }, []);

  // The enquiry form is a separate island and still speaks the old event.
  React.useEffect(() => {
    function onToggle(e: Event) {
      toggle((e as CustomEvent<string>).detail);
    }
    window.addEventListener("phx:toggle-upgrade", onToggle);
    return () => window.removeEventListener("phx:toggle-upgrade", onToggle);
  }, [toggle]);

  const seed = React.useCallback(() => {
    setBusiness(SAMPLE.business);
    setEntity(SAMPLE.entity);
    setCitations(SAMPLE.citations);
    setClock(SAMPLE.clock);
    setMoney(SAMPLE.money);
    setChannels(SAMPLE.channels);
    setExponent(SAMPLE.exponent);
    setJustSeeded(true);
    pulse("instrument", "sample");
    window.setTimeout(() => setJustSeeded(false), 900);
  }, []);

  // The hero's seed button lives above the provider in the tree, so it asks
  // by event rather than by prop.
  React.useEffect(() => {
    window.addEventListener("phx:seed", seed);
    return () => window.removeEventListener("phx:seed", seed);
  }, [seed]);

  const reset = React.useCallback(() => {
    setBusiness("");
    setEntity({});
    setCitations({});
    setClock(CLOCK_DEFAULTS);
    setMoney(MONEY_DEFAULTS);
    setChannels(CHANNEL_DEFAULTS);
    setExponent(1);
    setPicked([]);
    pulse("instrument", "reset");
  }, []);

  const value: PlaygroundState = {
    entity,
    setEntity,
    business,
    setBusiness,
    citations,
    setCitations,
    clock,
    setClock,
    money,
    setMoney,
    channels,
    setChannels,
    exponent,
    setExponent,
    picked,
    toggle,
    add,
    justSeeded,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {rail && <Hud onSeed={seed} onReset={reset} />}
    </Ctx.Provider>
  );
}

/** Every instrument's current verdict, derived — never stored. */
function useVerdicts() {
  const p = usePlayground();
  return React.useMemo(() => {
    const touchedEntity = Object.values(p.entity).some((a) => a.stated);
    const entity = readEntity(p.entity);
    const fan = readFan(p.entity);
    const web = readCorroboration(p.citations);
    const touchedWeb = Object.values(p.citations).some((c) => c.present);
    const clock = readClock(p.clock);
    const leak = computeLeak(p.money, UPGRADES.find((u) => u.key === "voice-employee")!.price);
    const marginal = readMarginal(p.channels, p.exponent);

    const v = (touched: boolean, ok: boolean): Verdict =>
      !touched ? "untouched" : ok ? "clear" : "gap";

    return [
      { id: "matrix", n: "00", label: "Coverage", verdict: "clear" as Verdict, note: `${UPGRADES.length} gaps` },
      {
        id: "inspector",
        n: "01",
        label: "Inspector",
        verdict: v(touchedEntity, entity.resolvable && entity.inferred === 0),
        note: touchedEntity ? `${entity.absent} absent` : "not run",
      },
      {
        id: "fan",
        n: "02",
        label: "Query Fan",
        verdict: v(touchedEntity, fan.locked === 0),
        note: touchedEntity ? `${fan.locked} locked` : "not run",
      },
      {
        id: "web",
        n: "03",
        label: "Web",
        verdict: v(touchedWeb, web.corroborated),
        note: touchedWeb ? `${web.conflicts} conflicts` : "not run",
      },
      {
        id: "clock",
        n: "04",
        label: "Clock",
        verdict: leak.underwater ? ("clear" as Verdict) : clock.overtaken ? "gap" : "clear",
        note: clock.overtaken ? "beaten" : "in time",
      },
      {
        id: "marginal",
        n: "05",
        label: "Marginal",
        verdict: "covered" as Verdict,
        note: marginal.neutral ? "linear" : `+${Math.round(marginal.headroom)}`,
      },
      {
        id: "compose",
        n: "06",
        label: "Stack",
        verdict: p.picked.length > 0 ? ("gap" as Verdict) : "untouched",
        note: `${p.picked.length} picked`,
      },
    ];
  }, [p.entity, p.citations, p.clock, p.money, p.channels, p.exponent, p.picked]);
}

const DOT: Record<Verdict, string> = {
  untouched: "bg-white/20",
  clear: "bg-signal",
  gap: "bg-gold",
  covered: "bg-cyan",
};

/**
 * The rail. Sticky at the bottom, showing every instrument's state at once.
 *
 * This is what turns a page of tools into one instrument panel: the visitor
 * can see, without scrolling, that three of seven have found something and
 * what their basket costs. It only appears once they have actually touched
 * something, so an arriving reader gets the page rather than a toolbar.
 */
function Hud({ onSeed, onReset }: { onSeed: () => void; onReset: () => void }) {
  const p = usePlayground();
  const verdicts = useVerdicts();
  const [dismissed, setDismissed] = React.useState(false);

  const chosen = UPGRADES.filter((u) => p.picked.includes(u.key));
  const bundle = BUNDLES.find(
    (b) => b.members.length === p.picked.length && b.members.every((m) => p.picked.includes(m)),
  );
  const listMonthly = chosen
    .filter((u) => u.billing === "monthly")
    .reduce((s, u) => s + u.price, 0);
  const monthly = bundle ? bundle.price : listMonthly;
  const shown = useCountUp(monthly / 100);

  const engaged =
    Object.keys(p.entity).length > 0 ||
    Object.keys(p.citations).length > 0 ||
    p.picked.length > 0 ||
    p.exponent < 1;

  const gaps = verdicts.filter((v) => v.verdict === "gap").length;

  if (dismissed) return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-3 transition-all duration-500 sm:p-4",
        engaged ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0",
      )}
    >
      <div
        className="fx-hud pointer-events-auto flex max-w-[min(64rem,100%)] flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-3 py-2.5 sm:px-4"
        role="status"
        aria-live="polite"
        aria-label="Instrument panel"
      >
        <div className="flex items-center gap-1">
          {verdicts.map((v) => (
            <a
              key={v.id}
              href={`#${v.id}`}
              title={`${v.n} ${v.label} — ${v.note}`}
              className="group flex flex-col items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan"
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  DOT[v.verdict],
                  v.verdict === "gap" && "fx-live text-gold",
                )}
              />
              <span className="font-mono text-[0.58rem] tabular-nums text-muted-foreground">
                {v.n}
              </span>
            </a>
          ))}
        </div>

        <div className="hidden h-7 w-px bg-white/10 sm:block" />

        <div className="flex items-baseline gap-2">
          <span className="font-mono text-lg font-bold tabular-nums">
            ${shown.toLocaleString()}
          </span>
          <span className="text-[0.7rem] text-muted-foreground">
            /mo{bundle ? ` · ${bundle.name}` : ""}
          </span>
        </div>

        {bundle && (
          <span className="text-[0.68rem] text-signal">
            saves {formatCurrency(bundleSaving(bundle))}/mo
          </span>
        )}

        <span className="text-[0.7rem] text-muted-foreground">
          {gaps} gap{gaps === 1 ? "" : "s"} found
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onSeed}
            className="flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 text-[0.72rem] transition-colors hover:border-cyan/50 hover:text-cyan focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
          >
            <Sparkles className="h-3 w-3" /> Sample
          </button>
          <button
            type="button"
            onClick={onReset}
            aria-label="Clear every instrument"
            className="rounded-full border border-white/12 p-1.5 text-muted-foreground transition-colors hover:border-white/30 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
          {p.picked.length > 0 && (
            <a href="#enquiry" className="pill-primary px-3 py-1.5 text-[0.72rem]">
              Send <ArrowRight className="h-3 w-3" />
            </a>
          )}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Hide the instrument panel"
            className="rounded-full p-1.5 text-lg leading-none text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The big seed button for the top of the page, before the rail exists.
 *
 * Same action, but it has to be findable on arrival — the rail only slides in
 * once something has been touched, which is exactly the moment somebody has
 * already decided whether to bother.
 */
export function SeedButton() {
  const [pressed, setPressed] = React.useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(new CustomEvent("phx:seed"));
        setPressed(true);
        window.setTimeout(() => setPressed(false), 900);
      }}
      className={cn("pill-gold text-sm", pressed && "fx-sheen")}
    >
      <Sparkles className="h-4 w-4" /> Load a sample business
    </button>
  );
}

