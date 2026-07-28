import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { BRAND } from "@/lib/brand";
import {
  PARENT_SERVICES,
  UPGRADES,
  THESIS,
  FLIGHT_CHECK,
  PROOF_POSTURE,
  entryPrice,
} from "@/lib/upgrades";
import { formatCurrency } from "@/lib/utils";
import { env } from "@/lib/env";
import { DECK_INDEX } from "@/lib/deck";
import { Enquiry } from "@/components/marketing/enquiry";
import { Pulse } from "@/components/marketing/pulse";
import { Wordmark } from "@/components/marketing/site-chrome";
import { Deck } from "@/components/marketing/deck";
import { SeedButton } from "@/components/marketing/playground";
import { SystemField } from "@/components/marketing/system-field";

/**
 * THE INSTRUMENT DECK
 *
 * DIRECTION
 *   This page used to argue. It had a thesis section, a three-shifts section, a
 *   proof-posture section and a close, and every one of them was a paragraph
 *   asking to be believed. An owner who has been pitched by four agencies this
 *   year does not read those. They have a working filter for them.
 *
 *   So there is no argument left on the page. There are seven instruments, and
 *   each one takes something the visitor cannot currently see about their own
 *   business and makes it legible: what a model can determine about them,
 *   which questions silently exclude them, who corroborates them, what the
 *   five minutes after a missed call actually look like, where the next
 *   advertising dollar should go. The only claims made are arithmetic
 *   performed on numbers the visitor typed.
 *
 *   The selling happens as a consequence. An instrument finds a gap, names
 *   what closes it, and the readout adds it to the stack. If it finds nothing,
 *   it says so.
 *
 * WHY ONE OF THE SEVEN SELLS NOTHING
 *   The Marginal Dollar concludes that PHX/GROWTH already does this, on a
 *   fifteen-minute loop, and offers no upgrade at all. Every owner reading this
 *   has been through a diagnostic that happened to diagnose exactly what its
 *   author was selling, and they discount everything downstream of it. One
 *   instrument that can say "not ours" is what buys the other six their
 *   credibility.
 *
 * BLUEPRINTS
 *   Server component. `<Deck />` is the single client boundary; the seven
 *   instruments share one store behind it, which is what lets the Inspector's
 *   answers drive the Query Fan and one button fill every panel at once. Every
 *   price resolves through the catalogue, and `/api/reserve` recomputes the
 *   total server-side regardless — a posted price is user input.
 */

function structuredData() {
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: BRAND.name,
    description: THESIS.body,
    url: env.siteUrl,
    email: BRAND.notifyEmail,
    areaServed: "United States",
    parentOrganization: {
      "@type": "Organization",
      name: BRAND.parent.name,
      url: BRAND.parent.url,
      description: BRAND.parent.tagline,
    },
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Upgrades & add-ons",
      itemListElement: UPGRADES.map((u) => ({
        "@type": "Offer",
        name: u.name,
        description: u.promise,
        price: (u.price / 100).toFixed(2),
        priceCurrency: "USD",
      })),
    },
  };
}

/** The contents page for the deck. Its order is the deck's order — see `@/lib/deck`. */
const DECK = DECK_INDEX;

export default function Home() {
  const from = entryPrice();

  return (
    <div className="relative">
      {/* The live substrate everything sits on. Seven panels on flat black
          read as seven widgets; seven panels over a running graph read as one
          machine. Fixed, behind everything, and it never takes a click. */}
      <SystemField />
      <Pulse />
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
            {/* The escape hatch, and it is never hidden.
                The deck is the better experience and it stays the primary
                action — but it asks for eight modules of attention before it
                will show a number, and for a while it was the only public page
                on the site. Anybody who arrives already sold, or arrives with
                four minutes, gets a straight route to the price list. */}
            <Link href="/upgrades" className="pill-ghost px-4 py-2.5 text-sm">
              Prices
            </Link>
            <a href="#map" className="pill-primary px-4 py-2.5 text-sm sm:px-5">
              <span className="sm:hidden">Start</span>
              <span className="hidden sm:inline">Start reading</span>
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero — a contents page for the machine, not a pitch ────────── */}
      <section className="relative grain overflow-hidden py-20 md:py-28">
        <div className="aurora" />
        <div className="container relative">
          {/* items-start, not items-center: at 390px this wraps to two lines
              and a centred dot floats between them. */}
          <p className="inline-flex items-start gap-2.5 rounded-full border border-white/10 px-5 py-2">
            <span className="mt-[0.42rem] h-1.5 w-1.5 shrink-0 rounded-full bg-magenta" />
            <span className="eyebrow text-[0.68rem] text-muted-foreground">
              One live map · {DECK.length - 1} tools · one of them sells you nothing
            </span>
          </p>

          <h1 className="mt-7 max-w-4xl text-[2.6rem] font-bold leading-[1.03] tracking-tight sm:text-6xl md:text-7xl">
            See your business
            <br />
            <span className="text-gradient">the way AI sees it.</span>
          </h1>

          <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground">
            No slide deck, no case studies. Seven connected tools that show you what you
            can&rsquo;t currently see about your own business — using your numbers, not ours.
            Free to play with, nothing to sign up for.
          </p>

          {/* An empty instrument is a chore. One click fills all seven with a
              real-shaped account so the machine is running before anybody has
              decided whether to bother typing. */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <SeedButton />
            <a href="#map" className="pill-ghost text-sm">
              Or use my own numbers <ArrowRight className="h-4 w-4" />
            </a>
            <Link
              href="/upgrades"
              className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Skip to prices
            </Link>
          </div>

          {/* The index. Every entry is a real anchor, so the machine is
              legible before a single control is touched. */}
          {/* Borders on the items, not a gap-px grid over a tinted background:
              seven cards in three columns leaves two empty cells, and with the
              old approach those rendered as a phantom lit block. */}
          <ol className="mt-11 grid overflow-hidden rounded-xl border border-white/[0.07] sm:grid-cols-2 lg:grid-cols-3">
            {DECK.map((d) => (
              <li
                key={d.id}
                className="border-b border-white/[0.07] last:border-b-0 sm:[&:nth-last-child(-n+1)]:border-b-0 sm:odd:border-r lg:[&:nth-child(3n)]:border-r-0 lg:[&:not(:nth-child(3n))]:border-r"
              >
                <a
                  href={`#${d.id}`}
                  className="group flex h-full items-baseline gap-3 p-4 transition-colors hover:bg-white/[0.03]"
                >
                  <span className="font-mono text-[0.7rem] tabular-nums tracking-[0.2em] text-cyan">
                    {d.n}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[0.92rem] font-semibold leading-tight">
                      {d.name}
                    </span>
                    <span className="mt-0.5 block text-[0.75rem] text-muted-foreground">
                      {d.reads}
                      {d.folded && (
                        <span className="text-muted-foreground/50"> · under “more tools”</span>
                      )}
                    </span>
                  </span>
                  <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 self-center text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-cyan" />
                </a>
              </li>
            ))}
          </ol>

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
        </div>
      </section>

      {/* ── System header — names the machine before its first module ──── */}
      <section className="relative border-y border-white/[0.07] bg-black/30 py-5 backdrop-blur-sm">
        <div className="fx-rainbow-rule absolute inset-x-0 top-0" />
        <div className="container flex flex-wrap items-center gap-x-8 gap-y-3">
          <div className="flex items-center gap-2.5">
            <span className="fx-live h-1.5 w-1.5 rounded-full bg-signal text-signal" />
            <span className="eyebrow text-[0.6rem] text-signal">System online</span>
          </div>
          <span className="eyebrow text-[0.6rem] text-muted-foreground">
            {BRAND.name} Growth Intelligence
          </span>
          <span className="hidden text-[0.75rem] text-muted-foreground sm:inline">
            {DECK.length - 1} modules · one shared brain · everything you type stays in this tab
          </span>
          <span className="ml-auto font-mono text-[0.62rem] tracking-[0.2em] text-muted-foreground/50">
            v1 · {BRAND.parent.name}
          </span>
        </div>
      </section>

      {/* ── The deck ───────────────────────────────────────────────────── */}
      <Deck />

      {/* ── Enquiry ────────────────────────────────────────────────────── */}
      <section
        id="enquiry"
        className="scroll-mt-24 border-t border-white/[0.06] py-16 md:py-20"
      >
        <div className="container">
          <div className="flex flex-col gap-3 md:flex-row md:items-baseline md:gap-6">
            <span className="font-mono text-[0.7rem] tabular-nums tracking-[0.3em] text-cyan">
              07
            </span>
            <div>
              <h2 className="text-[1.75rem] font-bold leading-[1.1] tracking-tight md:text-4xl">
                Send it to us
              </h2>
              <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-muted-foreground">
                Whatever the tools found is already ticked. A real person reads it and sends you a
                price in writing. No card, no automated sequence, nothing charged.
              </p>
            </div>
          </div>
          <div className="mt-9">
            <Enquiry />
          </div>
        </div>
      </section>

      {/* ── The one thing this page still says in words ────────────────── */}
      <section className="border-t border-white/[0.06] py-16">
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

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      {/* Room for the instrument rail, which is fixed and would otherwise sit
          on top of the last thing anybody reads. */}
      <footer className="border-t border-white/[0.06] py-14 pb-28">
        <div className="container grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <a href={BRAND.parent.url} className="text-xl font-bold tracking-[0.12em] text-cyan">
              {BRAND.parent.name}
            </a>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {BRAND.parent.tagline}
            </p>
            <a
              href={`mailto:${BRAND.parent.email}`}
              className="mt-3 inline-block text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {BRAND.parent.email}
            </a>
          </div>

          <div>
            <p className="eyebrow text-muted-foreground">The deck</p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/upgrades" className="text-cyan transition-colors hover:text-foreground">
                  Upgrades &amp; prices
                </Link>
              </li>
              {DECK.map((d) => (
                <li key={d.id}>
                  <a href={`#${d.id}`} className="transition-colors hover:text-foreground">
                    {d.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="eyebrow text-muted-foreground">Fly</p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              {PARENT_SERVICES.map((s) => (
                <li key={s.key}>
                  <a href={BRAND.parent.url} className="transition-colors hover:text-foreground">
                    {s.name}
                  </a>
                </li>
              ))}
              <li>
                <Link href="/login" className="transition-colors hover:text-foreground">
                  Client sign-in
                </Link>
              </li>
              <li>
                <Link href="/legal/terms" className="transition-colors hover:text-foreground">
                  Terms
                </Link>
              </li>
              <li>
                <Link href="/legal/privacy" className="transition-colors hover:text-foreground">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/legal/msa" className="transition-colors hover:text-foreground">
                  Services agreement
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="container mt-10 border-t border-white/[0.06] pt-6 text-sm text-muted-foreground">
          © {new Date().getFullYear()} {BRAND.name} · an upgrade counter for{" "}
          <a href={BRAND.parent.url} className="text-cyan hover:underline">
            {BRAND.parent.name}
          </a>
        </div>
      </footer>
    </div>
  );
}
