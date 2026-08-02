import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, ArrowLeft, Check, ArrowRight } from "lucide-react";
import { BRAND } from "@/lib/brand";
import {
  UPGRADES,
  FAIR_QUESTIONS,
  PROOF_POSTURE,
  FLIGHT_CHECK,
  upgradeByKey,
  upgradesFor,
  serviceByKey,
  bundlesWith,
  bundleMembers,
  bundleListPrice,
  bundleSaving,
} from "@/lib/upgrades";
import { formatCurrency, cn } from "@/lib/utils";
import { env } from "@/lib/env";
import { Enquiry } from "@/components/marketing/enquiry";
import { Wordmark, SiteFooter } from "@/components/marketing/site-chrome";

/**
 * ONE UPGRADE, ONE URL.
 *
 * DIRECTION
 *   `/upgrades` is the price list: eight cards, read top to bottom by somebody
 *   deciding what they want. That is the right page for a browser and the wrong
 *   page for everyone else. An ad pointed at a single upgrade landed a visitor
 *   at the top of a list of eight and asked them to find it; a link sent in a
 *   Slack thread said "this one" and opened a page about all of them; and an
 *   assistant asked what one upgrade costs had to quote a page whose title
 *   names none of them.
 *
 *   So each upgrade now owns an address. Same catalogue, same figures, one
 *   subject — with room for the whole demand argument rather than the two lines
 *   a card can hold, the service it bolts onto printed in full, and the stacks
 *   it belongs to priced against buying it alone.
 *
 * NOTHING NEW IS SAID HERE
 *   Every sentence on this page resolves through `@/lib/upgrades`. That is not
 *   a style preference: the catalogue is the file checked against
 *   phxgrowth.com's own copy, and a detail page free to write its own
 *   description is a detail page free to promise something the additive rules
 *   would have caught. The only prose written here is connective.
 *
 *   The one thing this page adds is the "already covered" block, and even that
 *   is quoted — the service's own bullet list, plus the FAQ answer that already
 *   promises nothing is sold twice. A page selling one upgrade hard is exactly
 *   where a client should be reminded what they already pay for.
 */

export function generateStaticParams() {
  return UPGRADES.map((u) => ({ key: u.key }));
}

export function generateMetadata({ params }: { params: { key: string } }): Metadata {
  const u = upgradeByKey(params.key);
  if (!u) return { title: "Not found" };

  const service = serviceByKey(u.attachesTo);
  const title = `${u.name} — ${formatCurrency(u.price)}${u.billing === "monthly" ? "/mo" : ""} — ${BRAND.name}`;
  const description =
    `${u.promise} Bolts onto ${service?.name ?? u.attachesTo} for ${BRAND.parent.name} ` +
    `clients. Fixes: ${u.fixes.toLowerCase()}. Month to month, covered by ${FLIGHT_CHECK.label}.`;

  return {
    title,
    description,
    alternates: { canonical: `/upgrades/${u.key}` },
    openGraph: { title, description, url: `${env.siteUrl}/upgrades/${u.key}` },
    twitter: { title, description },
  };
}

/**
 * Published per upgrade, not just for the catalogue as a whole.
 *
 * We sell Answer Engine Visibility on the argument that a model quotes what it
 * can lift. A page about one product that only publishes a catalogue-level
 * offer is asking an assistant to do the disaggregating.
 */
function structuredData(key: string) {
  const u = upgradeByKey(key)!;
  const service = serviceByKey(u.attachesTo);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: u.name,
    description: u.promise,
    url: `${env.siteUrl}/upgrades/${u.key}`,
    category: service?.name,
    brand: { "@type": "Brand", name: BRAND.name },
    offers: {
      "@type": "Offer",
      price: (u.price / 100).toFixed(2),
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: `${env.siteUrl}/upgrades/${u.key}`,
    },
  };
}

export default function UpgradeDetailPage({ params }: { params: { key: string } }) {
  const u = upgradeByKey(params.key);
  if (!u) notFound();

  const service = serviceByKey(u.attachesTo)!;
  const stacks = bundlesWith(u.key);
  const siblings = upgradesFor(u.attachesTo).filter((x) => x.key !== u.key);
  const noDoubleBill = FAIR_QUESTIONS.find((f) => f.q.toLowerCase().includes("duplicate"));

  return (
    <div className="relative">
      {/* eslint-disable-next-line react/no-danger */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(u.key)) }}
      />

      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-background/80 backdrop-blur-xl">
        <div className="container flex h-[4.5rem] items-center justify-between gap-4">
          <Wordmark />
          <div className="flex items-center gap-3">
            <a
              href={BRAND.parent.url}
              className="hidden items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            >
              {BRAND.parent.name} <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
            <Link href="/upgrades" className="pill-ghost px-4 py-2.5 text-sm">
              <ArrowLeft className="h-4 w-4" />
              <span className="sm:hidden">All</span>
              <span className="hidden sm:inline">All upgrades</span>
            </Link>
            <Link href="/get-a-price" className="pill-primary px-4 py-2.5 text-sm sm:px-5">
              Get a price
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative grain overflow-hidden py-14 md:py-20">
        <div className="aurora" />
        <div className="container relative">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-[0.78rem]">
            <Link href="/upgrades" className="text-muted-foreground hover:text-foreground">
              Upgrades
            </Link>
            <span aria-hidden className="text-muted-foreground/30">
              /
            </span>
            <span className="text-foreground/80">{u.name}</span>
          </nav>

          <div className="mt-6 grid gap-8 lg:grid-cols-[1.55fr_1fr]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "chip",
                    u.apex
                      ? "border-gold/40 bg-gold/10 text-gold"
                      : "border-white/10 bg-white/[0.03] text-muted-foreground",
                  )}
                >
                  Bolts onto {service.name}
                </span>
                {u.leading && (
                  <span className="chip border-cyan/30 bg-cyan/10 text-cyan">Taken first</span>
                )}
                {u.build && (
                  <span className="chip border-signal/30 bg-signal/10 text-signal">
                    Ships a running loop
                  </span>
                )}
              </div>

              <h1 className="mt-4 text-[2.3rem] font-bold leading-[1.05] tracking-tight sm:text-5xl">
                {u.name}
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                {u.promise}
              </p>
              <p className="mt-5 text-[0.84rem] text-muted-foreground/70">
                <span className="eyebrow text-[0.58rem] text-gold">Fixes</span>{" "}
                <span className="ml-1.5 text-foreground/80">{u.fixes}</span>
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <div className="rounded-2xl border border-white/[0.08] bg-black/25 p-5">
                <div className="font-mono text-3xl font-bold tabular-nums tracking-tight">
                  {formatCurrency(u.price)}
                  <span className="ml-1 text-base font-normal text-muted-foreground">
                    {u.billing === "monthly" ? "/mo" : "once"}
                  </span>
                </div>
                <p className="mt-1.5 text-[0.76rem] text-muted-foreground">
                  {u.billing === "monthly"
                    ? "Month to month, on your existing invoice"
                    : "Billed once, you own the result"}
                </p>
                <Link
                  href={`/get-a-price?add=${u.key}`}
                  className="pill-primary mt-4 w-full justify-center px-4 py-2.5 text-sm"
                >
                  Add it to an enquiry <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <p className="mt-3 text-[0.72rem] leading-relaxed text-muted-foreground/70">
                  {FLIGHT_CHECK.label} applies. No lock-in.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── The demand argument, in full ───────────────────────────────── */}
      <section className="border-t border-white/[0.06] py-14 md:py-16">
        <div className="container">
          <div className="grid gap-9 lg:grid-cols-[1.55fr_1fr]">
            <div className="min-w-0">
              <p className="eyebrow text-[0.6rem] text-cyan">Why this, and why now</p>
              <p className="mt-4 max-w-2xl text-[1.02rem] leading-relaxed text-muted-foreground">
                {u.demandCase}
              </p>

              {/* Builds only — the same rule the catalogue holds them to. */}
              {u.oversight && (
                <div className="mt-7 rounded-2xl border border-signal/25 bg-signal/[0.04] p-5">
                  <div className="eyebrow text-[0.58rem] text-signal">
                    What you can see and stop
                  </div>
                  <p className="mt-2.5 text-[0.88rem] leading-relaxed text-muted-foreground">
                    {u.oversight}
                  </p>
                </div>
              )}
            </div>

            <div>
              <p className="eyebrow text-[0.6rem] text-muted-foreground/70">What you get</p>
              <ul className="mt-4 space-y-3">
                {u.delivers.map((d) => (
                  <li
                    key={d}
                    className="flex items-start gap-2.5 text-[0.88rem] leading-relaxed text-muted-foreground"
                  >
                    <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-signal/70" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── What it bolts onto, and what that already covers ───────────── */}
      <section className="border-t border-white/[0.06] py-14 md:py-16">
        <div className="container">
          <h2 className="text-[1.6rem] font-bold leading-tight tracking-tight md:text-3xl">
            What it bolts onto
          </h2>
          <p className="mt-3 max-w-2xl text-[0.95rem] leading-relaxed text-muted-foreground">
            {u.name} assumes {service.name} is already running on your account. It replaces none
            of it.
          </p>

          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-5 md:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="text-lg font-bold tracking-tight">{service.name}</h3>
                <span className="font-mono text-[0.74rem] tabular-nums text-muted-foreground">
                  {service.priceLabel}
                  {service.feeLabel ? ` ${service.feeLabel}` : ""}
                </span>
              </div>
              <p className="mt-2.5 text-[0.88rem] leading-relaxed text-muted-foreground">
                {service.role}
              </p>
              <p className="eyebrow mt-5 text-[0.56rem] text-muted-foreground/70">
                Already included
              </p>
              <ul className="mt-2.5 space-y-2">
                {service.includes.map((inc) => (
                  <li
                    key={inc}
                    className="flex items-start gap-2 text-[0.84rem] leading-relaxed text-muted-foreground"
                  >
                    <Check className="mt-1 h-3 w-3 shrink-0 text-signal/70" />
                    {inc}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-gold/25 bg-gold/[0.03] p-5 md:p-6">
              <p className="eyebrow text-[0.58rem] text-gold">Where that service stops</p>
              <p className="mt-3 text-[0.9rem] leading-relaxed text-muted-foreground">
                {service.ceiling}
              </p>
              {noDoubleBill && (
                <>
                  <p className="eyebrow mt-6 text-[0.56rem] text-muted-foreground/70">
                    {noDoubleBill.q}
                  </p>
                  <p className="mt-2 text-[0.84rem] leading-relaxed text-muted-foreground">
                    {noDoubleBill.a}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── The stacks this belongs to ─────────────────────────────────── */}
      {stacks.length > 0 && (
        <section className="border-t border-white/[0.06] py-14 md:py-16">
          <div className="container">
            <h2 className="text-[1.6rem] font-bold leading-tight tracking-tight md:text-3xl">
              Cheaper inside a stack
            </h2>
            <p className="mt-3 max-w-2xl text-[0.95rem] leading-relaxed text-muted-foreground">
              {u.name} is part of {stacks.length === 1 ? "one stack" : `${stacks.length} stacks`}.
              Every total below is computed from the same prices on this page.
            </p>

            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              {stacks.map((b) => (
                <Link
                  key={b.key}
                  href={`/stacks/${b.key}`}
                  className={cn(
                    "group flex flex-col rounded-2xl border bg-black/20 p-5 transition-colors md:p-6",
                    b.apex
                      ? "border-gold/30 hover:border-gold/60"
                      : "border-white/[0.07] hover:border-cyan/40",
                  )}
                >
                  <h3 className="text-lg font-bold tracking-tight">{b.name}</h3>
                  <p className="mt-2 text-[0.85rem] leading-relaxed text-muted-foreground">
                    {b.promise}
                  </p>
                  <ul className="mt-4 space-y-1.5 border-t border-white/[0.06] pt-4">
                    {bundleMembers(b).map((m) => (
                      <li
                        key={m.key}
                        className={cn(
                          "flex items-baseline justify-between gap-3 text-[0.82rem]",
                          m.key === u.key ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        <span className="min-w-0 truncate">{m.name}</span>
                        <span className="shrink-0 font-mono text-[0.72rem] tabular-nums text-muted-foreground/60 line-through">
                          {formatCurrency(m.price)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-5">
                    <div className="font-mono text-2xl font-bold tabular-nums tracking-tight">
                      {formatCurrency(b.price)}
                      <span className="ml-1 text-sm font-normal text-muted-foreground">/mo</span>
                      <span className="ml-2 align-middle font-mono text-[0.76rem] font-normal tabular-nums text-muted-foreground/50 line-through">
                        {formatCurrency(bundleListPrice(b))}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[0.74rem] tabular-nums text-signal">
                      Saves {formatCurrency(bundleSaving(b))}/mo
                    </p>
                    <span className="mt-3 inline-flex items-center gap-1.5 text-[0.8rem] text-cyan">
                      See the stack
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── The rest of the fan on this service ────────────────────────── */}
      {siblings.length > 0 && (
        <section className="border-t border-white/[0.06] py-14 md:py-16">
          <div className="container">
            <h2 className="text-[1.6rem] font-bold leading-tight tracking-tight md:text-3xl">
              Also on {service.name}
            </h2>
            <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {siblings.map((s) => (
                <Link
                  key={s.key}
                  href={`/upgrades/${s.key}`}
                  className="group flex items-baseline justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/20 px-4 py-3.5 transition-colors hover:border-cyan/40"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold">{s.name}</span>
                    <span className="mt-0.5 block text-[0.76rem] text-muted-foreground">
                      {s.fixes}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[0.76rem] tabular-nums text-muted-foreground">
                    {formatCurrency(s.price)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── The proof posture, said here too ───────────────────────────── */}
      <section className="border-t border-white/[0.06] py-14 md:py-16">
        <div className="container">
          <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-6 md:p-8">
            <p className="eyebrow text-[0.6rem] text-muted-foreground/70">
              {PROOF_POSTURE.eyebrow}
            </p>
            <h2 className="mt-3 max-w-2xl text-xl font-bold leading-snug tracking-tight md:text-2xl">
              {PROOF_POSTURE.headline}
            </h2>
            <p className="mt-3 max-w-2xl text-[0.9rem] leading-relaxed text-muted-foreground">
              {PROOF_POSTURE.body}
            </p>
            <p className="mt-3 max-w-2xl text-[0.9rem] leading-relaxed text-foreground/80">
              {PROOF_POSTURE.founding}
            </p>
          </div>
        </div>
      </section>

      {/* ── The form, with this upgrade already ticked ─────────────────── */}
      <section id="enquiry" className="scroll-mt-24 border-t border-white/[0.06] py-14 md:py-16">
        <div className="container">
          <h2 className="text-[1.75rem] font-bold leading-tight tracking-tight md:text-4xl">
            Get a price for {u.name}
          </h2>
          <p className="mt-3 max-w-2xl text-[0.95rem] leading-relaxed text-muted-foreground">
            It arrives ticked because you opened its page — nothing else is pre-selected.
          </p>
          <div className="mt-8">
            <Enquiry preselect={[u.key]} />
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
