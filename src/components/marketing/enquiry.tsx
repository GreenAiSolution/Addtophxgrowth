"use client";

import * as React from "react";
import { Loader2, CheckCircle2, Check, ArrowRight, AlertTriangle } from "lucide-react";
import {
  PARENT_SERVICES,
  UPGRADES,
  upgradesFor,
  type ServiceKey,
  type Upgrade,
} from "@/lib/upgrades";
import { formatCurrency, cn } from "@/lib/utils";
import { pulse } from "@/components/marketing/pulse";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

/** Plain sentence-case label — the console's mono HUD label is wrong here. */
const FIELD_LABEL = "font-sans text-xs normal-case tracking-normal text-muted-foreground";

/**
 * The only interactive thing on the site.
 *
 * DIRECTION
 *   The old site answered "what do you want?" with a five-section configurator.
 *   This asks the same question with a list of checkboxes and a running total,
 *   because the answer is now genuinely simple: which upgrades, and where do we
 *   reach you.
 *
 *   The total is visible the entire time. A page that shows prices per item and
 *   then hides the sum until an enquiry is submitted is asking someone to
 *   commit before they know the number, and people correctly refuse.
 *
 * BLUEPRINTS
 *   Every price rendered here comes from `UPGRADES`, and the server recomputes
 *   the same sum from the same source — the browser's arithmetic is never
 *   trusted, and never needs to be, because both sides read one catalogue.
 *
 *   Pre-selection is honest: an upgrade arrives ticked only if the visitor
 *   clicked "add" on its card, never as a default. Pre-ticked upsells are how
 *   you win one sale and lose the relationship.
 */

interface Fallback {
  email: string;
  subject: string;
  body: string;
}

export function Enquiry({ preselect = [] }: { preselect?: string[] }) {
  const [picked, setPicked] = React.useState<string[]>(preselect);
  const [state, setState] = React.useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);
  /** Set when the server took the enquiry but could not deliver it to anyone. */
  const [fallback, setFallback] = React.useState<Fallback | null>(null);

  // The cards elsewhere on the page dispatch this when "Add" is pressed, so a
  // visitor's choice is already ticked by the time they scroll down here.
  React.useEffect(() => {
    function onAdd(e: Event) {
      const key = (e as CustomEvent<string>).detail;
      if (!UPGRADES.some((u) => u.key === key)) return;
      setPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
    }
    window.addEventListener("phx:toggle-upgrade", onAdd);
    return () => window.removeEventListener("phx:toggle-upgrade", onAdd);
  }, []);

  const chosen = React.useMemo(
    () => UPGRADES.filter((u) => picked.includes(u.key)),
    [picked],
  );
  const monthly = chosen.filter((u) => u.billing === "monthly").reduce((s, u) => s + u.price, 0);
  const oneTime = chosen.filter((u) => u.billing === "one_time").reduce((s, u) => s + u.price, 0);

  function toggle(key: string) {
    setPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (picked.length === 0) {
      setError("Pick at least one upgrade so we know what to quote.");
      return;
    }
    setState("loading");
    setError(null);
    pulse("enquiry_started", String(picked.length));
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/reserve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: String(form.get("name") ?? ""),
          email: String(form.get("email") ?? ""),
          phone: String(form.get("phone") ?? ""),
          company: String(form.get("company") ?? ""),
          note: String(form.get("note") ?? ""),
          upgrades: picked,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        delivered?: boolean;
        fallback?: Fallback;
        error?: string;
      };
      if (data.ok) {
        // The server tells us whether it actually reached a human. When it
        // didn't, we say so and hand over a pre-written email rather than
        // showing a confident tick over a lost lead.
        setFallback(data.delivered === false ? (data.fallback ?? null) : null);
        setState("done");
        return;
      }
      setError(data.error ?? "Something went wrong. Please try again.");
      setState("idle");
    } catch {
      setError("Connection dropped. Please try again.");
      setState("idle");
    }
  }

  if (state === "done" && fallback) {
    // Honest failure. Their details are in our logs, but "we got it" would be
    // a lie, and a lie here costs them the reply they came for.
    const mailto =
      `mailto:${fallback.email}` +
      `?subject=${encodeURIComponent(fallback.subject)}` +
      `&body=${encodeURIComponent(fallback.body)}`;

    return (
      <div className="phx-card mx-auto flex max-w-xl flex-col items-center gap-3 border-gold/30 p-10 text-center">
        <AlertTriangle className="h-11 w-11 text-gold" />
        <h3 className="text-2xl font-bold tracking-tight">Our mail relay is down.</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          We&apos;ve logged your selection, but we&apos;d rather tell you the truth than show you a
          tick. One click sends it directly — everything you picked is already written into it.
        </p>
        <a href={mailto} className="pill-primary mt-3">
          Send it directly <ArrowRight className="h-4 w-4" />
        </a>
        <a href={`mailto:${fallback.email}`} className="text-xs text-muted-foreground hover:text-foreground">
          or write to {fallback.email}
        </a>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="phx-card mx-auto flex max-w-xl flex-col items-center gap-3 border-signal/25 p-10 text-center">
        <CheckCircle2 className="h-12 w-12 text-signal" />
        <h3 className="text-2xl font-bold tracking-tight">Cleared for pre-flight.</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          You&apos;ll hear back today with the exact scope and the exact number in writing.
          Nothing has been charged, and nothing on your account changes until you say so.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
      {/* Pick */}
      <div className="space-y-7">
        {PARENT_SERVICES.map((service) => (
          <div key={service.key}>
            <div className="eyebrow mb-3 border-b border-white/[0.07] pb-2 text-muted-foreground">
              On {service.name}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {upgradesFor(service.key).map((u) => (
                <UpgradeToggle
                  key={u.key}
                  upgrade={u}
                  on={picked.includes(u.key)}
                  onToggle={() => toggle(u.key)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Send */}
      <form onSubmit={onSubmit} className="phx-card space-y-3 p-6 lg:sticky lg:top-24">
        <div className="border-b border-white/[0.07] pb-4">
          <div className="eyebrow text-muted-foreground">Your selection</div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-3xl font-bold tracking-tight text-gradient">
              {formatCurrency(monthly)}
            </span>
            <span className="text-sm text-muted-foreground">/mo</span>
          </div>
          {oneTime > 0 && (
            <div className="mt-1 text-xs text-gold">+ {formatCurrency(oneTime)} one-time</div>
          )}
          <p className="mt-2 text-[0.7rem] leading-relaxed text-muted-foreground">
            {picked.length === 0
              ? "Nothing picked yet — tick what you want on the left."
              : `${picked.length} upgrade${picked.length === 1 ? "" : "s"} selected. This is an enquiry, not a payment.`}
          </p>
        </div>

        <div>
          <Label htmlFor="eq-name" className={FIELD_LABEL}>Your name</Label>
          <Input id="eq-name" name="name" required placeholder="Alex Rivera" autoComplete="name" />
        </div>
        <div>
          <Label htmlFor="eq-email" className={FIELD_LABEL}>Email</Label>
          <Input
            id="eq-email"
            name="email"
            type="email"
            required
            placeholder="you@company.com"
            autoComplete="email"
          />
        </div>
        <div>
          <Label htmlFor="eq-company" className={FIELD_LABEL}>Business</Label>
          <Input id="eq-company" name="company" placeholder="Company, Inc." autoComplete="organization" />
        </div>
        <div>
          <Label htmlFor="eq-phone" className={FIELD_LABEL}>Phone (optional)</Label>
          <Input id="eq-phone" name="phone" placeholder="(602) 555-0142" autoComplete="tel" />
        </div>
        <div>
          <Label htmlFor="eq-note" className={FIELD_LABEL}>Anything we should know?</Label>
          <Textarea id="eq-note" name="note" rows={2} placeholder="Optional" />
        </div>

        {error && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[0.7rem] text-amber-300">
            {error}
          </p>
        )}

        <button type="submit" className="pill-primary w-full" disabled={state === "loading"}>
          {state === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Send this to PHX/GROWTH <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
        <p className="text-center text-[0.65rem] leading-relaxed text-muted-foreground">
          A human reads every one of these and replies the same day. No automated sequence, no card
          required.
        </p>
      </form>
    </div>
  );
}

/**
 * The "add" control that sits on each upgrade card further up the page.
 *
 * It talks to the form through a window event rather than shared state, because
 * the alternative is lifting selection into a provider that wraps the whole
 * page and turning an otherwise fully static document into a client tree. This
 * keeps the page server-rendered and ships two small islands instead.
 */
export function AddUpgradeButton({ upgradeKey, name }: { upgradeKey: string; name: string }) {
  const [added, setAdded] = React.useState(false);

  function add() {
    window.dispatchEvent(new CustomEvent("phx:toggle-upgrade", { detail: upgradeKey }));
    if (!added) pulse("upgrade_added", upgradeKey);
    setAdded((v) => !v);
  }

  return (
    <button
      type="button"
      onClick={add}
      aria-pressed={added}
      aria-label={added ? `Remove ${name} from your enquiry` : `Add ${name} to your enquiry`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold transition-colors",
        added
          ? "border-signal/50 bg-signal/10 text-signal"
          : "border-white/20 text-foreground hover:border-white/45 hover:bg-white/[0.05]",
      )}
    >
      {added ? (
        <>
          <Check className="h-3 w-3" /> Added
        </>
      ) : (
        <>
          Add to enquiry <ArrowRight className="h-3 w-3" />
        </>
      )}
    </button>
  );
}

/** The parent's own colour coding, repeated so the two pages agree. */
const TOGGLE_ACCENT: Record<ServiceKey, { on: string; box: string }> = {
  "premium-ai-ads": {
    on: "border-magenta/60 bg-magenta/[0.07]",
    box: "border-magenta bg-magenta/20 text-magenta",
  },
  "ai-employees": {
    on: "border-violet/60 bg-violet/[0.07]",
    box: "border-violet bg-violet/20 text-violet",
  },
  "website-creation": {
    on: "border-cyan/60 bg-cyan/[0.07]",
    box: "border-cyan bg-cyan/20 text-cyan",
  },
};

function UpgradeToggle({
  upgrade,
  on,
  onToggle,
}: {
  upgrade: Upgrade;
  on: boolean;
  onToggle: () => void;
}) {
  const accent = TOGGLE_ACCENT[upgrade.attachesTo];
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all duration-200",
        on ? accent.on : "border-white/[0.08] hover:border-white/25",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors",
          on ? accent.box : "border-white/20 text-transparent",
        )}
      >
        <Check className="h-3 w-3" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{upgrade.name}</span>
        <span className="mt-0.5 block text-[0.72rem] text-muted-foreground">
          {formatCurrency(upgrade.price)}
          {upgrade.billing === "monthly" ? "/mo" : " once"}
        </span>
      </span>
    </button>
  );
}
