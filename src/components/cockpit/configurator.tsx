"use client";

import * as React from "react";
import Link from "next/link";
import {
  Check,
  Loader2,
  Sparkles,
  Bot,
  Radar,
  Layers,
  Plus,
  Minus,
  ArrowRight,
  RotateCcw,
  CheckCircle2,
} from "lucide-react";
import { PLANS, type PlanDef } from "@/lib/catalog";
import { ADDONS, ADDON_GROUPS, type AddonGroupKey } from "@/lib/addons";
import { VERTICAL_PACKS } from "@/lib/verticals";
import {
  priceCockpit,
  matchesSignature,
  SIGNATURE_BUILDS,
  type CockpitSelection,
} from "@/lib/cockpit";
import { formatCurrency, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * The cockpit configurator.
 *
 * Three principles behind the interaction, in priority order:
 *   1. The total is always visible and always correct. It comes from
 *      `priceCockpit` — the same tested function the build sheet uses — so the
 *      number assembling in front of the client is the number they'll be
 *      invoiced. Nothing here does its own arithmetic.
 *   2. Start from a good default, not a blank slate. Assembling from nothing is
 *      a much harder decision than editing something opinionated, so the
 *      signature builds come first and everything below is the argument.
 *   3. Never hide a subtraction. "None" is a first-class option on both lines,
 *      because someone who only wants ad-ops shouldn't have to feel like
 *      they're buying the wrong package.
 */

const STORAGE_KEY = "phxgrowthplus.cockpit";

const AGENT_PLANS = PLANS.filter((p) => p.line === "AI_AGENTS");
const ADOPS_PLANS = PLANS.filter((p) => p.line === "AD_OPS");
const GROUP_ORDER: AddonGroupKey[] = ["foundations", "growth", "capacity"];

/** Smoothly tween a number so the total reads as assembling, not flickering. */
function useAnimatedValue(target: number, duration = 380) {
  const [display, setDisplay] = React.useState(target);
  const currentRef = React.useRef(target);

  React.useEffect(() => {
    const from = currentRef.current;
    const delta = target - from;
    if (delta === 0) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = from + delta * eased;
      currentRef.current = next;
      setDisplay(next);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return Math.round(display);
}

function SectionHeader({
  index,
  icon: Icon,
  title,
  note,
}: {
  index: string;
  icon: typeof Bot;
  title: string;
  note: string;
}) {
  return (
    <div className="mb-5 flex items-baseline gap-4 border-b border-cyan/20 pb-3">
      <span className="hud-value shrink-0 text-2xl font-bold text-cyan/50">{index}</span>
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
          <Icon className="h-4 w-4 text-cyan" />
          {title}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
      </div>
    </div>
  );
}

function OptionCard({
  selected,
  onClick,
  eyebrow,
  title,
  blurb,
  price,
  suffix,
  footnote,
  badge,
}: {
  selected: boolean;
  onClick: () => void;
  eyebrow?: string;
  title: string;
  blurb: string;
  price?: string;
  suffix?: string;
  footnote?: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "hud-panel group relative flex flex-col p-5 text-left transition-all duration-200",
        selected
          ? "border-cyan/70 shadow-hud ring-1 ring-cyan/40"
          : "hover:-translate-y-0.5 hover:border-cyan/40",
      )}
    >
      <span
        className={cn(
          "absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full border transition-colors",
          selected ? "border-cyan bg-cyan/20 text-cyan" : "border-border text-transparent",
        )}
        aria-hidden
      >
        <Check className="h-3 w-3" />
      </span>

      {eyebrow && <span className="hud-label">{eyebrow}</span>}
      <span className="mt-0.5 pr-7 font-heading text-base font-bold">{title}</span>
      <span className="mt-1.5 flex-1 text-xs leading-relaxed text-muted-foreground">{blurb}</span>

      {price && (
        <span className="mt-3 flex items-baseline gap-1">
          <span className="hud-value text-xl font-bold">{price}</span>
          {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
        </span>
      )}
      {footnote && <span className="mt-1 font-mono text-[0.62rem] text-secondary">{footnote}</span>}
      {badge && (
        <span className="mt-3">
          <Badge>{badge}</Badge>
        </span>
      )}
    </button>
  );
}

function planCard(
  plan: PlanDef,
  selected: boolean,
  onClick: () => void,
): React.ReactElement {
  return (
    <OptionCard
      key={plan.key}
      selected={selected}
      onClick={onClick}
      eyebrow={plan.name}
      title={plan.tagline}
      blurb={plan.features.slice(0, 3).join(" · ")}
      price={formatCurrency(plan.priceMonthly)}
      suffix="/mo"
      footnote={plan.setupFee ? `+ ${formatCurrency(plan.setupFee)} one-time build` : undefined}
      badge={plan.highlight ? "Most chosen" : undefined}
    />
  );
}

export function CockpitConfigurator({ signedIn }: { signedIn: boolean }) {
  const [agentsPlan, setAgentsPlan] = React.useState<string | null>("scale");
  const [adOpsPlan, setAdOpsPlan] = React.useState<string | null>(null);
  const [verticalKey, setVerticalKey] = React.useState<string | null>(null);
  const [addons, setAddons] = React.useState<string[]>([]);
  const [showAddons, setShowAddons] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Logged-out visitors reserve by leaving details rather than being bounced to
  // a login form, which on an unconfigured deploy is a wall.
  const [reserving, setReserving] = React.useState(false);
  const [reserved, setReserved] = React.useState(false);

  // Restore a build across a login round-trip. Nothing here is sensitive — it's
  // a shopping basket — but losing it after signing in would be maddening.
  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as CockpitSelection;
      setAgentsPlan(saved.agentsPlan ?? null);
      setAdOpsPlan(saved.adOpsPlan ?? null);
      setVerticalKey(saved.verticalKey ?? null);
      setAddons(saved.addons ?? []);
      if ((saved.addons ?? []).length > 0) setShowAddons(true);
    } catch {
      /* a corrupt basket is not worth an error state */
    }
  }, []);

  const selection: CockpitSelection = React.useMemo(
    () => ({ agentsPlan, adOpsPlan, verticalKey, addons }),
    [agentsPlan, adOpsPlan, verticalKey, addons],
  );

  React.useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
    } catch {
      /* private browsing */
    }
  }, [selection]);

  const quote = React.useMemo(() => priceCockpit(selection), [selection]);
  const signature = React.useMemo(() => matchesSignature(selection), [selection]);

  const monthly = useAnimatedValue(quote.monthlyTotal);
  const oneTime = useAnimatedValue(quote.oneTimeTotal);

  function loadSignature(key: string) {
    const build = SIGNATURE_BUILDS.find((b) => b.key === key);
    if (!build) return;
    setAgentsPlan(build.selection.agentsPlan ?? null);
    setAdOpsPlan(build.selection.adOpsPlan ?? null);
    setAddons(build.selection.addons ?? []);
    if ((build.selection.addons ?? []).length > 0) setShowAddons(true);
  }

  function toggleAddon(key: string) {
    setAddons((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function reset() {
    setAgentsPlan(null);
    setAdOpsPlan(null);
    setVerticalKey(null);
    setAddons([]);
  }

  async function activate() {
    // Not signed in: take their details here. Never send someone who has just
    // configured a five-figure build off to a login form.
    if (!signedIn) {
      setReserving(true);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/cockpit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(selection),
      });
      if (res.status === 401) {
        setReserving(true);
        return;
      }
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      // Billing or the database may not be wired up yet. Falling back to the
      // reservation form means the build still reaches a human.
      setReserving(true);
    } catch {
      setError("Connection dropped. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReservation(formData: FormData) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/reserve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: String(formData.get("name") ?? ""),
          email: String(formData.get("email") ?? ""),
          phone: String(formData.get("phone") ?? ""),
          company: String(formData.get("company") ?? ""),
          note: String(formData.get("note") ?? ""),
          selection,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setReserved(true);
        setReserving(false);
        return;
      }
      setError(data.error ?? "Something went wrong. Please try again.");
    } catch {
      setError("Connection dropped. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative">
      {/* Signature builds */}
      <section className="container pb-14">
        <div className="mb-5 text-center">
          <span className="hud-label">Start from a signature build, then argue with it</span>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {SIGNATURE_BUILDS.map((b) => {
            const q = priceCockpit(b.selection);
            const active = signature?.key === b.key;
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => loadSignature(b.key)}
                className={cn(
                  "hud-panel hud-corners flex flex-col p-5 text-left transition-all duration-200",
                  active
                    ? "border-cyan/70 shadow-hud ring-1 ring-cyan/40"
                    : "hover:-translate-y-0.5 hover:border-cyan/40",
                  b.highlight && !active && "border-violet/40",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-heading text-lg font-bold">{b.name}</span>
                  {active ? (
                    <Badge variant="success">loaded</Badge>
                  ) : b.highlight ? (
                    <Badge variant="violet">most chosen</Badge>
                  ) : null}
                </div>
                <span className="mt-1 text-[0.7rem] italic text-cyan/80">
                  &ldquo;{b.forWhom}&rdquo;
                </span>
                <span className="mt-2.5 flex-1 text-xs leading-relaxed text-muted-foreground">
                  {b.pitch}
                </span>
                <span className="mt-4 flex items-baseline gap-1.5 border-t border-border/50 pt-3">
                  <span className="hud-value text-xl font-bold">
                    {formatCurrency(q.monthlyTotal)}
                  </span>
                  <span className="text-xs text-muted-foreground">/mo</span>
                  <span className="ml-auto font-mono text-[0.62rem] text-secondary">
                    + {formatCurrency(q.oneTimeTotal)} build
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Configurator + summary */}
      <div className="container grid gap-10 pb-40 lg:grid-cols-[1fr_20rem] lg:items-start lg:pb-24">
        <div className="space-y-14">
          {/* 01 — agents */}
          <section>
            <SectionHeader
              index="01"
              icon={Bot}
              title="Your automation crew"
              note="AI specialists working your inbound around the clock. Each tier unlocks more of the crew and more of the system behind them."
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <OptionCard
                selected={agentsPlan === null}
                onClick={() => setAgentsPlan(null)}
                eyebrow="Skip"
                title="No crew for now"
                blurb="Ad operations only. You can add the agents any time without paying a second build fee."
              />
              {AGENT_PLANS.map((p) =>
                planCard(p, agentsPlan === p.key, () => setAgentsPlan(p.key)),
              )}
            </div>
          </section>

          {/* 02 — ad ops */}
          <section>
            <SectionHeader
              index="02"
              icon={Radar}
              title="Your ad operations desk"
              note="A human desk on your accounts, with the Spend Watch checking them unattended. Each tier turns on more checks and sweeps more often."
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <OptionCard
                selected={adOpsPlan === null}
                onClick={() => setAdOpsPlan(null)}
                eyebrow="Skip"
                title="I run my own ads"
                blurb="Agents only. Your dashboard still works — you just won't have us on the controls."
              />
              {ADOPS_PLANS.map((p) => planCard(p, adOpsPlan === p.key, () => setAdOpsPlan(p.key)))}
            </div>
          </section>

          {/* 03 — vertical */}
          <section>
            <SectionHeader
              index="03"
              icon={Layers}
              title="Your trade"
              note="Pick one and your qualification bar, escalation rules and one-click jobs arrive pre-written. Included at no charge — it only changes what the system says, never what you get."
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setVerticalKey(null)}
                aria-pressed={verticalKey === null}
                className={cn(
                  "rounded-full border px-4 py-2 text-xs transition-colors",
                  verticalKey === null
                    ? "border-cyan/70 bg-cyan/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-cyan/40",
                )}
              >
                Something else — tune it in the build
              </button>
              {VERTICAL_PACKS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setVerticalKey(v.key)}
                  aria-pressed={verticalKey === v.key}
                  className={cn(
                    "rounded-full border px-4 py-2 text-xs transition-colors",
                    verticalKey === v.key
                      ? "border-cyan/70 bg-cyan/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-cyan/40",
                  )}
                >
                  {v.trade}
                </button>
              ))}
            </div>
          </section>

          {/* 04 — pairings */}
          <section>
            <SectionHeader
              index="04"
              icon={Sparkles}
              title="Pairings"
              note="Optional. Everything above works without a single one of these — take them only if you actually need them."
            />

            {!showAddons ? (
              <button
                type="button"
                onClick={() => setShowAddons(true)}
                className="hud-panel flex w-full items-center justify-center gap-2 p-5 text-sm text-muted-foreground transition-colors hover:border-cyan/40 hover:text-foreground"
              >
                <Plus className="h-4 w-4" /> Browse the pairings menu
              </button>
            ) : (
              <div className="space-y-8">
                {GROUP_ORDER.map((group) => (
                  <div key={group}>
                    <div className="mb-3 flex items-baseline justify-between">
                      <span className="font-heading text-sm font-bold">
                        {ADDON_GROUPS[group].label}
                      </span>
                      <span className="hud-label">{ADDON_GROUPS[group].note}</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {ADDONS.filter((a) => a.group === group).map((a) => {
                        const on = addons.includes(a.key);
                        return (
                          <button
                            key={a.key}
                            type="button"
                            onClick={() => toggleAddon(a.key)}
                            aria-pressed={on}
                            className={cn(
                              "hud-panel flex flex-col p-4 text-left transition-all duration-200",
                              on
                                ? "border-cyan/70 ring-1 ring-cyan/30"
                                : "hover:border-cyan/40",
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-sm font-medium">{a.name}</span>
                              <span
                                className={cn(
                                  "grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors",
                                  on
                                    ? "border-cyan bg-cyan/20 text-cyan"
                                    : "border-border text-muted-foreground",
                                )}
                                aria-hidden
                              >
                                {on ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                              </span>
                            </div>
                            <span className="mt-1 flex-1 text-[0.7rem] leading-relaxed text-muted-foreground">
                              {a.blurb}
                            </span>
                            <span className="mt-2.5 flex items-baseline gap-1">
                              <span className="hud-value text-sm font-bold">
                                {formatCurrency(a.price)}
                              </span>
                              <span className="text-[0.65rem] text-muted-foreground">
                                {a.billing === "monthly" ? "/mo" : "one-time"}
                              </span>
                              {a.mostPaired && (
                                <span className="ml-auto font-mono text-[0.55rem] uppercase tracking-widest text-violet">
                                  most paired
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Summary rail */}
        <aside className="lg:sticky lg:top-24">
          <div className="hud-panel hud-corners p-6">
            <div className="flex items-center justify-between">
              <span className="hud-label">Your cockpit</span>
              {signature ? (
                <Badge variant="violet">{signature.name}</Badge>
              ) : quote.isEmpty ? null : (
                <Badge>Custom build</Badge>
              )}
            </div>

            <div className="mt-4 border-b border-border/50 pb-4">
              <div className="flex items-baseline gap-1.5">
                <span className="hud-value text-4xl font-bold text-gradient">
                  {formatCurrency(monthly)}
                </span>
                <span className="text-sm text-muted-foreground">/mo</span>
              </div>
              {quote.oneTimeTotal > 0 && (
                <div className="mt-1.5 font-mono text-xs text-secondary">
                  + {formatCurrency(oneTime)} one-time build
                </div>
              )}
            </div>

            {quote.lines.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Nothing selected yet. Load a signature build above, or pick your own from the left.
              </p>
            ) : (
              <ul className="my-4 space-y-2.5">
                {quote.lines.map((l) => (
                  <li key={l.key} className="flex items-start justify-between gap-3 text-xs">
                    <span className="min-w-0">
                      <span className="block">{l.label}</span>
                      {(l.kind === "BUILD" || l.kind === "ADDON_ONCE") && (
                        <span className="hud-label">one-time</span>
                      )}
                    </span>
                    <span
                      className={cn(
                        "hud-value shrink-0",
                        l.kind === "INCLUDED" && "text-emerald-400",
                      )}
                    >
                      {l.kind === "INCLUDED" ? "included" : formatCurrency(l.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {quote.bundleSaving > 0 && (
              <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-[0.7rem] text-emerald-300">
                Bundle price applied — {formatCurrency(quote.bundleSaving)} less than buying those
                three separately.
              </div>
            )}

            {quote.firstInvoiceTotal > 0 && (
              <div className="mb-4 flex items-baseline justify-between border-t border-border/50 pt-3">
                <span className="hud-label">Due on your first invoice</span>
                <span className="hud-value text-sm font-bold">
                  {formatCurrency(quote.firstInvoiceTotal)}
                </span>
              </div>
            )}

            {error && (
              <p className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[0.7rem] text-amber-300">
                {error}
              </p>
            )}

            {reserved ? (
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4 text-center">
                <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-400" />
                <p className="mt-2 text-sm font-medium text-emerald-300">Reserved.</p>
                <p className="mt-1 text-[0.7rem] leading-relaxed text-muted-foreground">
                  Your build is with us and we&apos;ll be in touch today. Nothing has been charged.
                </p>
              </div>
            ) : reserving ? (
              <form
                action={(fd) => void submitReservation(fd)}
                className="space-y-2.5 border-t border-border/50 pt-4"
              >
                <div className="hud-label">Where should we reach you?</div>
                <Input name="name" required placeholder="Your name" autoComplete="name" />
                <Input
                  name="email"
                  type="email"
                  required
                  placeholder="you@company.com"
                  autoComplete="email"
                />
                <Input name="phone" placeholder="Phone (optional)" autoComplete="tel" />
                <Input name="company" placeholder="Business name (optional)" autoComplete="organization" />
                <Textarea
                  name="note"
                  rows={2}
                  placeholder="Anything we should know? (optional)"
                />
                <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Send my build <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
                <button
                  type="button"
                  onClick={() => setReserving(false)}
                  className="w-full text-center text-[0.65rem] text-muted-foreground hover:text-foreground"
                >
                  Keep editing
                </button>
              </form>
            ) : (
              <Button
                className="w-full"
                size="lg"
                disabled={quote.isEmpty || submitting}
                onClick={() => void activate()}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {signedIn ? "Activate this cockpit" : "Reserve this cockpit"}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            )}

            {!reserved && !reserving && (
              <p className="mt-2.5 text-center text-[0.65rem] leading-relaxed text-muted-foreground">
                No contract, and nothing is charged today. Change tiers or cancel from your console
                any time — the build fee is charged once and never again.
              </p>
            )}

            {!quote.isEmpty && (
              <button
                type="button"
                onClick={reset}
                className="mt-3 flex w-full items-center justify-center gap-1.5 text-[0.65rem] text-muted-foreground transition-colors hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" /> Start over
              </button>
            )}
          </div>

          <p className="mt-4 text-center text-[0.65rem] text-muted-foreground">
            Prefer to talk it through?{" "}
            <Link href="/#contact" className="text-cyan hover:underline">
              Book a strategy call
            </Link>
          </p>
        </aside>
      </div>

      {/* Mobile total bar. On a phone the summary rail sits at the bottom of a
          very long page, so the running total — the entire point of a
          configurator — would be invisible while choosing. This keeps it in
          view. Hidden on lg, where the sticky rail does the job. */}
      {!quote.isEmpty && !reserving && !reserved && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-cyan/20 bg-background/90 backdrop-blur-md lg:hidden">
          <div className="container flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="flex items-baseline gap-1">
                <span className="hud-value text-xl font-bold text-gradient">
                  {formatCurrency(monthly)}
                </span>
                <span className="text-xs text-muted-foreground">/mo</span>
              </div>
              {quote.oneTimeTotal > 0 && (
                <div className="font-mono text-[0.62rem] text-secondary">
                  + {formatCurrency(oneTime)} build
                </div>
              )}
            </div>
            <Button
              size="sm"
              className="shrink-0"
              disabled={submitting}
              onClick={() => void activate()}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {signedIn ? "Activate" : "Reserve"}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
