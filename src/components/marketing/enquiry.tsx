"use client";

import * as React from "react";
import { Loader2, CheckCircle2, Check, ArrowRight } from "lucide-react";
import { PARENT_SERVICES, UPGRADES, upgradesFor, type Upgrade } from "@/lib/upgrades";
import { formatCurrency, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

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

export function Enquiry({ preselect = [] }: { preselect?: string[] }) {
  const [picked, setPicked] = React.useState<string[]>(preselect);
  const [state, setState] = React.useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);

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
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
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

  if (state === "done") {
    return (
      <div className="hud-panel hud-corners mx-auto flex max-w-xl flex-col items-center gap-3 p-10 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-400" />
        <h3 className="font-heading text-2xl font-bold">That&apos;s with us.</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          You&apos;ll hear back today with the exact scope and the exact number in writing.
          Nothing has been charged, and nothing changes on your PHX Growth account until you say so.
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
            <div className="hud-label mb-3 border-b border-border/60 pb-2">
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
      <form onSubmit={onSubmit} className="hud-panel hud-corners space-y-3 p-6 lg:sticky lg:top-24">
        <div className="border-b border-border/50 pb-4">
          <div className="hud-label">Your selection</div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="hud-value text-3xl font-bold text-gradient">
              {formatCurrency(monthly)}
            </span>
            <span className="text-sm text-muted-foreground">/mo</span>
          </div>
          {oneTime > 0 && (
            <div className="mt-1 font-mono text-xs text-secondary">
              + {formatCurrency(oneTime)} one-time
            </div>
          )}
          <p className="mt-2 text-[0.7rem] leading-relaxed text-muted-foreground">
            {picked.length === 0
              ? "Nothing picked yet — tick what you want on the left."
              : `${picked.length} upgrade${picked.length === 1 ? "" : "s"} selected. This is an enquiry, not a payment.`}
          </p>
        </div>

        <div>
          <Label htmlFor="eq-name">Your name</Label>
          <Input id="eq-name" name="name" required placeholder="Alex Rivera" autoComplete="name" />
        </div>
        <div>
          <Label htmlFor="eq-email">Email</Label>
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
          <Label htmlFor="eq-company">Business</Label>
          <Input id="eq-company" name="company" placeholder="Company, Inc." autoComplete="organization" />
        </div>
        <div>
          <Label htmlFor="eq-phone">Phone (optional)</Label>
          <Input id="eq-phone" name="phone" placeholder="(602) 555-0142" autoComplete="tel" />
        </div>
        <div>
          <Label htmlFor="eq-note">Anything we should know?</Label>
          <Textarea id="eq-note" name="note" rows={2} placeholder="Optional" />
        </div>

        {error && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[0.7rem] text-amber-300">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={state === "loading"}>
          {state === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Send this to PHX Growth <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
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
    setAdded((v) => !v);
  }

  return (
    <button
      type="button"
      onClick={add}
      aria-pressed={added}
      aria-label={added ? `Remove ${name} from your enquiry` : `Add ${name} to your enquiry`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 font-mono text-[0.62rem] uppercase tracking-widest transition-colors",
        added
          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
          : "border-cyan/40 text-cyan hover:border-cyan hover:bg-cyan/10",
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

function UpgradeToggle({
  upgrade,
  on,
  onToggle,
}: {
  upgrade: Upgrade;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 text-left transition-all duration-200",
        on
          ? "border-cyan/70 bg-primary/5 ring-1 ring-cyan/30"
          : "border-border hover:border-cyan/40",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border transition-colors",
          on ? "border-cyan bg-cyan/20 text-cyan" : "border-border text-transparent",
        )}
      >
        <Check className="h-3 w-3" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{upgrade.name}</span>
        <span className="mt-0.5 block font-mono text-[0.68rem] text-muted-foreground">
          {formatCurrency(upgrade.price)}
          {upgrade.billing === "monthly" ? "/mo" : " once"}
        </span>
      </span>
    </button>
  );
}
