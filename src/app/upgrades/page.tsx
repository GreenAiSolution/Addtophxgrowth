import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, ArrowLeft, ArrowRight, Check } from "lucide-react";
import { BRAND } from "@/lib/brand";
import {
  PARENT_SERVICES,
  UPGRADES,
  BUNDLES,
  FLIGHT_PLANS,
  FAIR_QUESTIONS,
  PROOF_POSTURE,
  FLIGHT_CHECK,
  HOUSE_STRIP,
  THESIS,
  AUTOMATION_SPINE,
  AUTOMATION_LOOPS,
  FLAGSHIP,
  automationBuilds,
  bundleMembers,
  bundleListPrice,
  bundleSaving,
  upgradesFor,
  entryPrice,
} from "@/lib/upgrades";
import { formatCurrency, cn } from "@/lib/utils";
import { env } from "@/lib/env";
import { Enquiry } from "@/components/marketing/enquiry";
import { Wordmark, SiteFooter } from "@/components/marketing/site-chrome";

/**
 * THE PRICE LIST.
 *
 * DIRECTION
 *   The home page is an instrument deck. It is the better experience and it is
 *   the reason this property exists — but it asks a visitor to work eight
 *   modules before they can find out what anything costs, and for a while it
 *   was the only public page on the site. A contractor who arrives already sold,
 *   or arrives impatient, had nowhere to go.
 *
 *   This is that somewhere. No canvases, no sliders, no verdicts. What we sell,
 *   what it bolts onto, what it costs, and the form. Somebody who wants to read
 *   a price and send an enquiry can do both without touching a single control.
 *
 *   It is deliberately the plainer page. The deck sells better; this one closes
 *   the visitor the deck would have lost.
 *
 * ALIGNMENT
 *   Not one number on this page is typed. Prices, savings, service names, the
 *   parent's own price labels and performance-fee rates, the guarantee, the
 *   questions and the proof posture all resolve through `@/lib/upgrades`, which
 *   is the file checked against phxgrowth.com's own copy. A price list is the
 *   single worst place for a figure to drift, because it is the page a client
 *   screenshots — so it is built from the same source as the contract, the
 *   receipt email and `/api/catalogue`, and `consistency.test.ts` reads this
 *   file to prove it.
 *
 * BLUEPRINTS
 *   Server component. `<Enquiry />` is the only client boundary, and the server
 *   recomputes every total in `/api/reserve` regardless — a posted price is
 *   user input.
 */

const TITLE = `Upgrades & prices — ${BRAND.name}`;
const DESCRIPTION =
  `Every ${BRAND.name} upgrade, what it bolts onto and what it costs. ` +
  `${UPGRADES.length} upgrades and ${BUNDLES.length} bundles for ${BRAND.parent.name} ` +
  `clients, from ${formatCurrency(entryPrice())} a month. Month to month, ` +
  `covered by ${FLIGHT_CHECK.label}.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/upgrades" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${env.siteUrl}/upgrades` },
  twitter: { title: TITLE, description: DESCRIPTION },
};

/**
 * A price list is the page assistants quote from, so it is published
 * machine-readably too — same figures, same source, no second opinion.
 */
function structuredData() {
  return {
    "@context": "https://schema.org",
    "@type": "OfferCatalog",
    name: `${BRAND.name} — upgrades & prices`,
    url: `${env.siteUrl}/upgrades`,
    provider: {
      "@type": "Organization",
      name: BRAND.name,
      parentOrganization: {
        "@type": "Organization",
        name: BRAND.parent.name,
        url: BRAND.parent.url,
      },
    },
    itemListElement: [
      ...UPGRADES.map((u) => ({
        "@type": "Offer",
        name: u.name,
        description: u.promise,
        price: (u.price / 100).toFixed(2),
        priceCurrency: "USD",
        category: "Upgrade",
      })),
      ...BUNDLES.map((b) => ({
        "@type": "Offer",
        name: b.name,
        description: b.promise,
        price: (b.price / 100).toFixed(2),
        priceCurrency: "USD",
        category: "Bundle",
      })),
    ],
  };
}

/** The price and its cadence, formatted from the record — never typed. */
function priceLine(price: number, billing: "monthly" | "one_time") {
  return billing === "monthly" ? `${formatCurrency(price)}/mo` : `${formatCurrency(price)} once`;
}

export default function UpgradesPage() {
  const from = entryPrice();

  return (
    <div className="relative">
      {/* eslint-disable-next-line react/no-danger */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()) }}
      />

      {/* ── Header ─────────────────────────────────────────────────────── */}
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
            <Link href="/tools" className="pill-ghost px-4 py-2.5 text-sm">
              <ArrowLeft className="h-4 w-4" />
              <span className="sm:hidden">Tools</span>
              <span className="hidden sm:inline">Try the tools</span>
            </Link>
            <a href="#enquiry" className="pill-primary px-4 py-2.5 text-sm sm:px-5">
              Get a price
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero — the whole offer in one screen ───────────────────────── */}
      <section className="relative grain overflow-hidden py-16 md:py-20">
        <div className="aurora" />
        <div className="container relative">
          <p className="eyebrow text-[0.68rem] text-muted-foreground">{THESIS.eyebrow}</p>
          <h1 className="mt-5 max-w-3xl text-[2.4rem] font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
            What we sell,
            <br />
            <span className="text-gradient">and what it costs.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            {THESIS.body} No configurator, no call required to see a number — every price is on
            this page. Prefer to poke at something first?{" "}
            <Link href="/" className="text-cyan underline-offset-4 hover:underline">
              The tools are over here.
            </Link>
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2">
            {[
              `From ${formatCurrency(from)}/mo`,
              "Month to month",
              "Founding rate locks in",
              FLIGHT_CHECK.label.replace(/^The /, ""),
            ].map((item, i, all) => (
              <span key={item} className="flex items-center gap-5">
                <span className="eyebrow text-[0.62rem] text-muted-foreground/70">{item}</span>
                {i < all.length - 1 && (
                  <span aria-hidden className="text-muted-foreground/30">
                    ·
                  </span>
                )}
              </span>
            ))}
          </div>

          {/* The parent's own credential strip, so the two properties open the
              same way. Quoted from their homepage, not written here. */}
          <div className="mt-9 flex flex-wrap gap-2">
            {HOUSE_STRIP.map((claim) => (
              <span key={claim} className="chip border-white/10 bg-white/[0.03] text-muted-foreground">
                {claim}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Where these sit ────────────────────────────────────────────── */}
      {/*
        The first thing a client asks a price list is "am I already paying for
        this?" — so the answer comes before the prices, in the parent's own
        words. Each service shows what PHX/GROWTH charges for it, what their
        bullet list already includes, and only then what is left over.
      */}
      <section id="fit" className="scroll-mt-24 border-t border-white/[0.06] py-14 md:py-16">
        <div className="container">
          <h2 className="text-[1.75rem] font-bold leading-tight tracking-tight md:text-4xl">
            Everything here bolts onto something you already run.
          </h2>
          <p className="mt-3 max-w-2xl text-[0.95rem] leading-relaxed text-muted-foreground">
            {BRAND.parent.name} flies the account. These upgrades attach to one of its three
            services and are written against that service&rsquo;s own bullet list, so nothing on
            this page can bill you twice for work already on your invoice.
          </p>

          <div className="mt-9 grid gap-5 lg:grid-cols-3">
            {PARENT_SERVICES.map((service) => {
              const attached = upgradesFor(service.key);
              return (
                <div
                  key={service.key}
                  className="flex flex-col rounded-2xl border border-white/[0.07] bg-black/20 p-5 md:p-6"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h3 className="text-lg font-bold tracking-tight">{service.name}</h3>
                    <span className="font-mono text-[0.72rem] tabular-nums text-muted-foreground">
                      {service.priceLabel}
                    </span>
                  </div>
                  {service.feeLabel && (
                    <span className="mt-1 font-mono text-[0.68rem] tabular-nums text-muted-foreground/70">
                      {service.feeLabel}
                    </span>
                  )}
                  <p className="mt-3 text-[0.85rem] leading-relaxed text-muted-foreground">
                    {service.role}
                  </p>

                  <div className="mt-4 border-t border-white/[0.06] pt-4">
                    <p className="eyebrow text-[0.56rem] text-muted-foreground/70">
                      Already included
                    </p>
                    <ul className="mt-2.5 space-y-1.5">
                      {service.includes.map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-2 text-[0.8rem] text-muted-foreground"
                        >
                          <Check className="mt-0.5 h-3 w-3 shrink-0 text-signal/70" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-auto border-t border-white/[0.06] pt-4">
                    <p className="eyebrow text-[0.56rem] text-gold">
                      What PLUS adds ({attached.length})
                    </p>
                    <ul className="mt-2.5 space-y-1.5">
                      {attached.map((u) => (
                        <li key={u.key}>
                          <a
                            href={`#${u.key}`}
                            className="flex items-baseline justify-between gap-3 text-[0.82rem] transition-colors hover:text-cyan"
                          >
                            <span className="font-medium">{u.name}</span>
                            <span className="shrink-0 font-mono text-[0.7rem] tabular-nums text-muted-foreground">
                              {priceLine(u.price, u.billing)}
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── The automation spine ───────────────────────────────────────── */}
      {/*
        The parent does not merely claim automation — it prints the workflow,
        node by named node, on a public page. That is the most persuasive thing
        either property has, and it belongs on the price list rather than being
        left on a page a visitor may not have read.

        It is also the argument for the two builds. Every node in all four of
        these loops sits inside the ad account, and the chains end where a lead
        becomes a job. What this section does is show four loops that run, and
        then the place the last one stops.
      */}
      <section id="spine" className="scroll-mt-24 border-t border-white/[0.06] py-14 md:py-16">
        <div className="container">
          <p className="eyebrow text-[0.62rem] text-signal">{AUTOMATION_SPINE.eyebrow}</p>
          <h2 className="mt-4 max-w-2xl text-[1.75rem] font-bold leading-tight tracking-tight md:text-4xl">
            {AUTOMATION_SPINE.headline}
          </h2>
          <p className="mt-3 max-w-2xl text-[0.95rem] leading-relaxed text-muted-foreground">
            {AUTOMATION_SPINE.body}
          </p>

          <div className="mt-9 grid gap-4 lg:grid-cols-2">
            {AUTOMATION_LOOPS.map((loop) => (
              <div
                key={loop.name}
                className="rounded-2xl border border-white/[0.07] bg-black/20 p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <h3 className="font-bold tracking-tight">{loop.name}</h3>
                  <span className="chip border-signal/30 bg-signal/[0.08] text-signal">
                    {loop.cadence}
                  </span>
                </div>
                <p className="mt-2.5 text-[0.84rem] leading-relaxed text-muted-foreground">
                  {loop.detail}
                </p>
                <ol className="mt-4 flex flex-wrap items-center gap-x-1 gap-y-1.5 border-t border-white/[0.06] pt-4">
                  {loop.nodes.map((n, i) => (
                    <li key={n} className="flex items-center gap-1">
                      <span className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 font-mono text-[0.62rem] text-muted-foreground">
                        {n}
                      </span>
                      {i < loop.nodes.length - 1 && (
                        <span aria-hidden className="text-muted-foreground/30">
                          &rarr;
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>

          {/* Where the spine stops, and what this site sells for it. */}
          <div className="mt-6 rounded-2xl border border-gold/30 bg-gold/[0.04] p-5 md:p-7">
            <p className="eyebrow text-[0.6rem] text-gold">And then it stops</p>
            <h3 className="mt-3 max-w-2xl text-xl font-bold leading-snug tracking-tight md:text-2xl">
              Every node above sits inside the ad account. The last one ends the moment
              somebody says yes.
            </h3>
            <p className="mt-3 max-w-2xl text-[0.9rem] leading-relaxed text-muted-foreground">
              After that comes the actual business — quoting it, scheduling it, doing it,
              invoicing it, getting paid, and getting that customer back — and it runs on
              somebody&rsquo;s memory. {FLAGSHIP.name} can engineer all of it, and says so, but
              it is a private build: {FLAGSHIP.scoping.charAt(0).toLowerCase() + FLAGSHIP.scoping.slice(1)}{" "}
              These {automationBuilds().length} are the productised route, built to the same
              standard as the loops above.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {automationBuilds().map((u) => (
                <Link
                  key={u.key}
                  href={`/upgrades/${u.key}`}
                  className="flex items-baseline justify-between gap-3 rounded-xl border border-gold/25 bg-black/25 px-4 py-3.5 transition-colors hover:border-gold/50"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold">{u.name}</span>
                    <span className="mt-0.5 block text-[0.76rem] text-muted-foreground">
                      {u.fixes}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[0.78rem] tabular-nums text-gold">
                    {priceLine(u.price, u.billing)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── The upgrades ───────────────────────────────────────────────── */}
      <section id="upgrades" className="scroll-mt-24 border-t border-white/[0.06] py-14 md:py-16">
        <div className="container">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h2 className="text-[1.75rem] font-bold leading-tight tracking-tight md:text-4xl">
              The {UPGRADES.length} upgrades
            </h2>
            <span className="font-mono text-[0.72rem] tabular-nums text-muted-foreground">
              from {formatCurrency(from)}/mo
            </span>
          </div>

          <div className="mt-9 space-y-5">
            {UPGRADES.map((u) => {
              const service = PARENT_SERVICES.find((s) => s.key === u.attachesTo)!;
              return (
                <article
                  key={u.key}
                  id={u.key}
                  className={cn(
                    "scroll-mt-24 rounded-2xl border bg-black/20 p-5 md:p-7",
                    u.apex ? "border-gold/30" : "border-white/[0.07]",
                  )}
                >
                  <div className="grid gap-6 md:grid-cols-[1.6fr_1fr]">
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
                          <span className="chip border-cyan/30 bg-cyan/10 text-cyan">
                            Taken first
                          </span>
                        )}
                      </div>

                      {/* The card is the summary; the page is the argument.
                          Linking the heading rather than adding a second button
                          keeps the row's shape and gives the detail page the
                          anchor text it should actually rank for. */}
                      <h3 className="mt-3.5 text-2xl font-bold tracking-tight md:text-3xl">
                        <Link
                          href={`/upgrades/${u.key}`}
                          className="transition-colors hover:text-cyan"
                        >
                          {u.name}
                        </Link>
                      </h3>
                      <p className="mt-2.5 max-w-xl text-[0.98rem] leading-relaxed text-muted-foreground">
                        {u.promise}
                      </p>
                      <Link
                        href={`/upgrades/${u.key}`}
                        className="mt-3 inline-flex items-center gap-1.5 text-[0.82rem] text-cyan hover:underline"
                      >
                        Why this, and what it bolts onto
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>

                      <p className="mt-4 text-[0.8rem] text-muted-foreground/70">
                        <span className="eyebrow text-[0.56rem] text-gold">Fixes</span>{" "}
                        <span className="ml-1.5 text-foreground/80">{u.fixes}</span>
                      </p>

                      {/*
                        Builds only. A loop that keeps running after everyone has
                        gone home is a different promise from a crew that turns
                        up and films something, and the difference a client cares
                        about is what they can see and what they can stop. The
                        parent publishes that standard; this is it, stated per
                        build rather than assumed.
                      */}
                      {u.oversight && (
                        <div className="mt-5 rounded-xl border border-signal/25 bg-signal/[0.04] p-4">
                          <div className="eyebrow text-[0.56rem] text-signal">
                            What you can see and stop
                          </div>
                          <p className="mt-2 text-[0.82rem] leading-relaxed text-muted-foreground">
                            {u.oversight}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col">
                      <div className="rounded-xl border border-white/[0.07] bg-black/25 p-4">
                        <div className="font-mono text-2xl font-bold tabular-nums tracking-tight">
                          {formatCurrency(u.price)}
                          <span className="ml-1 text-sm font-normal text-muted-foreground">
                            {u.billing === "monthly" ? "/mo" : "once"}
                          </span>
                        </div>
                        <p className="mt-1 text-[0.72rem] text-muted-foreground">
                          {u.billing === "monthly"
                            ? "Month to month, on your existing invoice"
                            : "Billed once, you own the result"}
                        </p>
                      </div>

                      <div className="mt-4">
                        <p className="eyebrow text-[0.56rem] text-muted-foreground/70">
                          What you get
                        </p>
                        <ul className="mt-2.5 space-y-2">
                          {u.delivers.map((d) => (
                            <li
                              key={d}
                              className="flex items-start gap-2 text-[0.82rem] leading-relaxed text-muted-foreground"
                            >
                              <Check className="mt-1 h-3 w-3 shrink-0 text-signal/70" />
                              {d}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── The bundles ────────────────────────────────────────────────── */}
      <section id="bundles" className="scroll-mt-24 border-t border-white/[0.06] py-14 md:py-16">
        <div className="container">
          <h2 className="text-[1.75rem] font-bold leading-tight tracking-tight md:text-4xl">
            Or take them stacked
          </h2>
          <p className="mt-3 max-w-2xl text-[0.95rem] leading-relaxed text-muted-foreground">
            These combinations exist because the parts make each other worth more, not because a
            discount needed a name. The saving is what makes taking them together worth it.
          </p>

          <div className="mt-9 grid gap-5 lg:grid-cols-3">
            {BUNDLES.map((b) => {
              const members = bundleMembers(b);
              return (
                <div
                  key={b.key}
                  className={cn(
                    "flex flex-col rounded-2xl border bg-black/20 p-5 md:p-6",
                    b.apex ? "border-gold/30" : "border-white/[0.07]",
                  )}
                >
                  {b.apex && (
                    <span className="chip mb-3 self-start border-gold/40 bg-gold/10 text-gold">
                      Everything, at once
                    </span>
                  )}
                  <h3 className="text-xl font-bold tracking-tight">
                    <Link href={`/stacks/${b.key}`} className="transition-colors hover:text-cyan">
                      {b.name}
                    </Link>
                  </h3>
                  <p className="mt-2 text-[0.88rem] leading-relaxed text-muted-foreground">
                    {b.promise}
                  </p>

                  <ul className="mt-4 space-y-1.5 border-t border-white/[0.06] pt-4">
                    {members.map((u) => (
                      <li
                        key={u.key}
                        className="flex items-baseline justify-between gap-3 text-[0.82rem]"
                      >
                        <Link
                          href={`/upgrades/${u.key}`}
                          className="min-w-0 truncate transition-colors hover:text-cyan"
                        >
                          {u.name}
                        </Link>
                        <span className="shrink-0 font-mono text-[0.7rem] tabular-nums text-muted-foreground/60 line-through">
                          {formatCurrency(u.price)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto border-t border-white/[0.06] pt-4">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-mono text-2xl font-bold tabular-nums tracking-tight">
                        {formatCurrency(b.price)}
                        <span className="ml-1 text-sm font-normal text-muted-foreground">/mo</span>
                      </span>
                      <span className="font-mono text-[0.72rem] tabular-nums text-muted-foreground/60 line-through">
                        {formatCurrency(bundleListPrice(b))}
                      </span>
                    </div>
                    <p className="mt-1.5 font-mono text-[0.72rem] tabular-nums text-signal">
                      Saves {formatCurrency(bundleSaving(b))}/mo
                    </p>
                    <Link
                      href={`/stacks/${b.key}`}
                      className="mt-3 inline-flex items-center gap-1.5 text-[0.8rem] text-cyan hover:underline"
                    >
                      See the stack
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {/* The rationale, kept out of the cards so the cards stay scannable. */}
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {BUNDLES.map((b) => (
              <p
                key={b.key}
                className="text-[0.8rem] leading-relaxed text-muted-foreground/80"
              >
                <span className="font-semibold text-foreground/80">{b.name}.</span> {b.rationale}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* ── Where this sits against their flight plans ─────────────────── */}
      <section className="border-t border-white/[0.06] py-14">
        <div className="container">
          <h2 className="text-xl font-bold tracking-tight md:text-2xl">
            If you fly a managed plan
          </h2>
          <p className="mt-2.5 max-w-2xl text-[0.9rem] leading-relaxed text-muted-foreground">
            Upgrades sit outside the plan and outside its performance fee. They are flat, they
            attach to the services underneath, and they change none of the numbers below.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {FLIGHT_PLANS.map((plan) => (
              <div
                key={plan.key}
                className="rounded-xl border border-white/[0.07] bg-black/20 px-4 py-3.5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="eyebrow text-[0.58rem] text-muted-foreground">{plan.code}</span>
                  {plan.badge && (
                    <span className="font-mono text-[0.6rem] tracking-[0.14em] text-gold">
                      {plan.badge}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 font-mono text-[0.9rem] font-semibold tabular-nums">
                  {plan.price}
                </div>
                <div className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">
                  {plan.fee}
                </div>
                <div className="mt-1.5 text-[0.74rem] text-muted-foreground/70">
                  {plan.ceilingNote}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── The fine print, in plain English ───────────────────────────── */}
      <section id="questions" className="scroll-mt-24 border-t border-white/[0.06] py-14 md:py-16">
        <div className="container">
          <h2 className="text-[1.75rem] font-bold leading-tight tracking-tight md:text-4xl">
            Fair questions
          </h2>
          <dl className="mt-8 grid gap-x-10 gap-y-7 md:grid-cols-2">
            {FAIR_QUESTIONS.map((f) => (
              <div key={f.q}>
                <dt className="font-semibold">{f.q}</dt>
                <dd className="mt-2 text-[0.88rem] leading-relaxed text-muted-foreground">
                  {f.a}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── The posture ────────────────────────────────────────────────── */}
      <section className="border-t border-white/[0.06] py-14">
        <div className="container">
          <div className="max-w-3xl rounded-2xl border border-signal/25 bg-black/25 p-7 md:p-9">
            <p className="eyebrow text-[0.6rem] text-signal">{PROOF_POSTURE.eyebrow}</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">
              {PROOF_POSTURE.headline}
            </h2>
            <p className="mt-4 text-[0.95rem] leading-relaxed text-muted-foreground">
              {PROOF_POSTURE.body}
            </p>
            <p className="mt-4 text-[0.95rem] leading-relaxed text-foreground/90">
              {PROOF_POSTURE.founding}
            </p>
            <p className="mt-6 border-t border-white/[0.07] pt-5 text-[0.9rem] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">{FLIGHT_CHECK.label}.</span>{" "}
              {FLIGHT_CHECK.body}
            </p>
          </div>
        </div>
      </section>

      {/* ── Enquiry ────────────────────────────────────────────────────── */}
      <section id="enquiry" className="scroll-mt-24 border-t border-white/[0.06] py-16 md:py-20">
        <div className="container">
          <h2 className="text-[1.75rem] font-bold leading-[1.1] tracking-tight md:text-4xl">
            Get it in writing
          </h2>
          <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-muted-foreground">
            Tick what you want and a real person sends you a price in writing. No card, no
            automated sequence, nothing charged.
          </p>
          <div className="mt-9">
            <Enquiry />
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
