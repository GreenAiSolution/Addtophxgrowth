"use client";

import * as React from "react";
import { ArrowRight, Check, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  BUNDLES,
  bundleMembers,
  bundleListPrice,
  bundleSaving,
  type Bundle,
} from "@/lib/upgrades";
import { formatCurrency, cn } from "@/lib/utils";
import { pulse } from "@/components/marketing/pulse";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

/**
 * The deluxe tier — the reason this property exists apart from phxgrowth.com.
 *
 * A bundle has its own enquiry rather than feeding the à la carte form,
 * because the two price differently and sharing one basket would have meant
 * either quoting the bundle at the sum of its parts or silently discounting a
 * loose selection. Both are pricing lies. Two paths, one server, one source of
 * truth for every number.
 */

const FIELD_LABEL = "font-sans text-xs normal-case tracking-normal text-muted-foreground";

interface Fallback {
  email: string;
  subject: string;
  body: string;
}

export function Bundles() {
  const [open, setOpen] = React.useState<Bundle | null>(null);

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-3">
        {BUNDLES.map((b) => {
          const members = bundleMembers(b);
          const saving = bundleSaving(b);
          return (
            <article
              key={b.key}
              className={cn(
                "phx-card lift flex flex-col p-7",
                b.apex ? "phx-card-gold border-gold/25" : "phx-card-violet",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-xl font-bold tracking-tight">{b.name}</h3>
                {b.apex && (
                  <span className="chip shrink-0 border-gold/40 bg-gold/10 text-gold">Apex</span>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-baseline gap-x-2">
                <span
                  className={cn(
                    "text-4xl font-bold tracking-tight",
                    b.apex ? "text-gold" : "text-violet",
                  )}
                >
                  {formatCurrency(b.price)}
                </span>
                <span className="text-sm text-muted-foreground">/mo</span>
              </div>
              <div className="mt-1.5 text-xs text-muted-foreground">
                <s className="opacity-60">{formatCurrency(bundleListPrice(b))}</s>{" "}
                <span className="text-signal">save {formatCurrency(saving)}/mo</span>
              </div>

              <p className="mt-4 text-[0.95rem] leading-relaxed text-foreground/90">{b.promise}</p>

              <ul className="mt-5 space-y-2">
                {members.map((u) => (
                  <li key={u.key} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <Check
                      className={cn(
                        "mt-0.5 h-3.5 w-3.5 shrink-0",
                        b.apex ? "text-gold" : "text-violet",
                      )}
                    />
                    {u.name}
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-6">
                <details className="group rounded-xl border border-white/[0.06] bg-black/25 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
                    <span className="eyebrow text-[0.6rem] text-muted-foreground">
                      Why these together
                    </span>
                    <span className="text-cyan transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="px-4 pb-4 text-[0.8rem] leading-relaxed text-muted-foreground">
                    {b.rationale}
                  </p>
                </details>

                <button
                  type="button"
                  onClick={() => {
                    setOpen(b);
                    pulse("upgrade_added", b.key);
                  }}
                  className={cn("mt-5 w-full text-sm", b.apex ? "pill-gold" : "pill-primary")}
                >
                  Enquire about {b.name} <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {open && <BundleEnquiry bundle={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function BundleEnquiry({ bundle, onClose }: { bundle: Bundle; onClose: () => void }) {
  const [state, setState] = React.useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [fallback, setFallback] = React.useState<Fallback | null>(null);

  // Escape closes, and focus lands in the dialog rather than staying behind it.
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector("input")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("loading");
    setError(null);
    pulse("enquiry_started", bundle.key);
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
          // Only the key travels. The server prices it.
          bundle: bundle.key,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        delivered?: boolean;
        fallback?: Fallback;
        error?: string;
      };
      if (data.ok) {
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

  const mailto = fallback
    ? `mailto:${fallback.email}?subject=${encodeURIComponent(
        fallback.subject,
      )}&body=${encodeURIComponent(fallback.body)}`
    : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Enquire about ${bundle.name}`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={ref} className="phx-card max-h-[90vh] w-full max-w-lg overflow-y-auto p-7">
        {state === "done" ? (
          fallback ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <AlertTriangle className="h-10 w-10 text-gold" />
              <h3 className="text-xl font-bold tracking-tight">Our mail relay is down.</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                We&apos;ve logged it, but we&apos;d rather tell you than show you a tick. One click
                sends it directly.
              </p>
              <a href={mailto} className="pill-primary mt-2">
                Send it directly <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center">
              <CheckCircle2 className="h-10 w-10 text-signal" />
              <h3 className="text-xl font-bold tracking-tight">Cleared for pre-flight.</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                You&apos;ll hear back today with the scope and the number in writing. Nothing has
                been charged.
              </p>
              <button type="button" onClick={onClose} className="pill-ghost mt-2 text-sm">
                Close
              </button>
            </div>
          )
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="eyebrow text-[0.6rem] text-muted-foreground">Bundle enquiry</div>
                <h3 className="mt-1 text-xl font-bold tracking-tight">{bundle.name}</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-2xl leading-none text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </div>

            <div className="mt-4 flex items-baseline gap-2 border-y border-white/[0.07] py-4">
              <span className="text-3xl font-bold tracking-tight text-gradient">
                {formatCurrency(bundle.price)}
              </span>
              <span className="text-sm text-muted-foreground">/mo</span>
              <span className="ml-auto text-xs text-signal">
                saves {formatCurrency(bundleSaving(bundle))}/mo
              </span>
            </div>

            <form onSubmit={onSubmit} className="mt-5 space-y-3">
              <div>
                <Label htmlFor="b-name" className={FIELD_LABEL}>
                  Your name
                </Label>
                <Input id="b-name" name="name" required autoComplete="name" />
              </div>
              <div>
                <Label htmlFor="b-email" className={FIELD_LABEL}>
                  Email
                </Label>
                <Input id="b-email" name="email" type="email" required autoComplete="email" />
              </div>
              <div>
                <Label htmlFor="b-company" className={FIELD_LABEL}>
                  Business
                </Label>
                <Input id="b-company" name="company" autoComplete="organization" />
              </div>
              <div>
                <Label htmlFor="b-phone" className={FIELD_LABEL}>
                  Phone (optional)
                </Label>
                <Input id="b-phone" name="phone" autoComplete="tel" />
              </div>
              <div>
                <Label htmlFor="b-note" className={FIELD_LABEL}>
                  Anything we should know?
                </Label>
                <Textarea id="b-note" name="note" rows={2} />
              </div>

              {error && (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[0.7rem] text-amber-300">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={state === "loading"}
                className={cn("w-full text-sm", bundle.apex ? "pill-gold" : "pill-primary")}
              >
                {state === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Send this to PHX/GROWTH <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
              <p className="text-center text-[0.65rem] text-muted-foreground">
                An enquiry, not a payment. Nothing is charged and nothing on your account changes.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
