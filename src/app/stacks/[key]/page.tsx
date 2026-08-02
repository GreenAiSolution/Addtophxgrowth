import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, ArrowLeft, Check, ArrowRight } from "lucide-react";
import { BRAND } from "@/lib/brand";
import {
  BUNDLES,
  PROOF_POSTURE,
  FLIGHT_CHECK,
  bundleByKey,
  bundleMembers,
  bundleListPrice,
  bundleSaving,
  serviceByKey,
} from "@/lib/upgrades";
import { formatCurrency, cn } from "@/lib/utils";
import { env } from "@/lib/env";
import { Enquiry } from "@/components/marketing/enquiry";
import { Wordmark, SiteFooter } from "@/components/marketing/site-chrome";

/**
 * ONE STACK, ONE URL.
 *
 * DIRECTION
 *   The stacks are the reason this property exists as a separate site — they
 *   are the combinations the main site does not carry, and the apex one is the
 *   largest ticket either property sells. On `/upgrades` they are three cards
 *   in a row below eight upgrade cards, which is the least room the biggest
 *   thing we sell has ever been given.
 *
 *   Here each one gets the argument its price implies: what the combination
 *   does that the parts don't, every member priced and linked, and the saving
 *   computed rather than asserted.
 *
 * THE SAVING IS ARITHMETIC, NOT COPY
 *   `bundleListPrice` and `bundleSaving` both read the member keys, so the
 *   struck-through total and the "saves" line cannot drift from the upgrade
 *   prices printed directly beneath them. A stack page that quotes a saving its
 *   own member list contradicts is the single most expensive kind of typo on
 *   the site, and the arithmetic here makes it unavailable.
 */

export function generateStaticParams() {
  return BUNDLES.map((b) => ({ key: b.key }));
}

export function generateMetadata({ params }: { params: { key: string } }): Metadata {
  const b = bundleByKey(params.key);
  if (!b) return { title: "Not found" };

  const title = `${b.name} — ${formatCurrency(b.price)}/mo — ${BRAND.name}`;
  const description =
    `${b.promise} ${bundleMembers(b).length} upgrades taken together, ` +
    `${formatCurrency(bundleSaving(b))}/mo below buying them one at a time. ` +
    `For ${BRAND.parent.name} clients, month to month.`;

  return {
    title,
    description,
    alternates: { canonical: `/stacks/${b.key}` },
    openGraph: { title, description, url: `${env.siteUrl}/stacks/${b.key}` },
    twitter: { title, description },
  };
}

function structuredData(key: string) {
  const b = bundleByKey(key)!;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: b.name,
    description: b.promise,
    url: `${env.siteUrl}/stacks/${b.key}`,
    brand: { "@type": "Brand", name: BRAND.name },
    offers: {
      "@type": "Offer",
      price: (b.price / 100).toFixed(2),
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: `${env.siteUrl}/stacks/${b.key}`,
    },
  };
}

export default function StackDetailPage({ params }: { params: { key: string } }) {
  const b = bundleByKey(params.key);
  if (!b) notFound();

  const members = bundleMembers(b);
  const list = bundleListPrice(b);
  const saving = bundleSaving(b);
  const others = BUNDLES.filter((x) => x.key !== b.key);

  return (
    <div className="relative">
      {/* eslint-disable-next-line react/no-danger */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(b.key)) }}
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
            <span className="text-foreground/80">{b.name}</span>
          </nav>

          <div className="mt-6 grid gap-8 lg:grid-cols-[1.55fr_1fr]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "chip",
                    b.apex
                      ? "border-gold/40 bg-gold/10 text-gold"
                      : "border-white/10 bg-white/[0.03] text-muted-foreground",
                  )}
                >
                  {b.apex ? "Everything, at once" : `${members.length} upgrades, taken together`}
                </span>
              </div>

              <h1 className="mt-4 text-[2.3rem] font-bold leading-[1.05] tracking-tight sm:text-5xl">
                {b.name}
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                {b.promise}
              </p>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-black/25 p-5">
              <div className="font-mono text-3xl font-bold tabular-nums tracking-tight">
                {formatCurrency(b.price)}
                <span className="ml-1 text-base font-normal text-muted-foreground">/mo</span>
              </div>
              <p className="mt-1 font-mono text-[0.78rem] tabular-nums text-muted-foreground/60">
                <span className="line-through">{formatCurrency(list)}</span> bought separately
              </p>
              <p className="mt-1.5 font-mono text-[0.82rem] tabular-nums text-signal">
                Saves {formatCurrency(saving)}/mo
              </p>
              <Link
                href={`/get-a-price?stack=${b.key}`}
                className="pill-primary mt-4 w-full justify-center px-4 py-2.5 text-sm"
              >
                Get a price <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <p className="mt-3 text-[0.72rem] leading-relaxed text-muted-foreground/70">
                {FLIGHT_CHECK.label} applies. No lock-in.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Why these compound ─────────────────────────────────────────── */}
      <section className="border-t border-white/[0.06] py-14 md:py-16">
        <div className="container">
          <h2 className="text-[1.6rem] font-bold leading-tight tracking-tight md:text-3xl">
            Why these, together
          </h2>
          <p className="mt-4 max-w-3xl text-[1.02rem] leading-relaxed text-muted-foreground">
            {b.rationale}
          </p>
        </div>
      </section>

      {/* ── The members ────────────────────────────────────────────────── */}
      <section className="border-t border-white/[0.06] py-14 md:py-16">
        <div className="container">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h2 className="text-[1.6rem] font-bold leading-tight tracking-tight md:text-3xl">
              What&rsquo;s in it
            </h2>
            <span className="font-mono text-[0.74rem] tabular-nums text-muted-foreground">
              {members.length} upgrades · {formatCurrency(list)} separately
            </span>
          </div>

          <div className="mt-8 space-y-4">
            {members.map((m) => {
              const service = serviceByKey(m.attachesTo)!;
              return (
                <article
                  key={m.key}
                  className="rounded-2xl border border-white/[0.07] bg-black/20 p-5 md:p-6"
                >
                  <div className="grid gap-5 md:grid-cols-[1.6fr_1fr]">
                    <div className="min-w-0">
                      <span className="chip border-white/10 bg-white/[0.03] text-muted-foreground">
                        Bolts onto {service.name}
                      </span>
                      <h3 className="mt-3 text-xl font-bold tracking-tight md:text-2xl">
                        <Link
                          href={`/upgrades/${m.key}`}
                          className="transition-colors hover:text-cyan"
                        >
                          {m.name}
                        </Link>
                      </h3>
                      <p className="mt-2 max-w-xl text-[0.92rem] leading-relaxed text-muted-foreground">
                        {m.promise}
                      </p>
                      <Link
                        href={`/upgrades/${m.key}`}
                        className="mt-4 inline-flex items-center gap-1.5 text-[0.82rem] text-cyan hover:underline"
                      >
                        Read the full case for {m.name}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>

                    <div>
                      <div className="font-mono text-lg font-bold tabular-nums tracking-tight text-muted-foreground">
                        {formatCurrency(m.price)}
                        <span className="ml-1 text-xs font-normal text-muted-foreground/60">
                          {m.billing === "monthly" ? "/mo alone" : "once, alone"}
                        </span>
                      </div>
                      <ul className="mt-3 space-y-1.5">
                        {m.delivers.slice(0, 3).map((d) => (
                          <li
                            key={d}
                            className="flex items-start gap-2 text-[0.8rem] leading-relaxed text-muted-foreground"
                          >
                            <Check className="mt-1 h-3 w-3 shrink-0 text-signal/70" />
                            {d}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* The arithmetic, shown rather than claimed. */}
          <div className="mt-6 rounded-2xl border border-signal/25 bg-signal/[0.04] p-5 md:p-6">
            <dl className="grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="eyebrow text-[0.56rem] text-muted-foreground/70">
                  Bought one at a time
                </dt>
                <dd className="mt-1 font-mono text-xl font-bold tabular-nums text-muted-foreground line-through">
                  {formatCurrency(list)}
                </dd>
              </div>
              <div>
                <dt className="eyebrow text-[0.56rem] text-muted-foreground/70">
                  Taken as {b.name}
                </dt>
                <dd className="mt-1 font-mono text-xl font-bold tabular-nums">
                  {formatCurrency(b.price)}
                </dd>
              </div>
              <div>
                <dt className="eyebrow text-[0.56rem] text-signal">You keep</dt>
                <dd className="mt-1 font-mono text-xl font-bold tabular-nums text-signal">
                  {formatCurrency(saving)}/mo
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* ── The other stacks ───────────────────────────────────────────── */}
      <section className="border-t border-white/[0.06] py-14 md:py-16">
        <div className="container">
          <h2 className="text-[1.6rem] font-bold leading-tight tracking-tight md:text-3xl">
            The other stacks
          </h2>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((o) => (
              <Link
                key={o.key}
                href={`/stacks/${o.key}`}
                className={cn(
                  "group rounded-xl border bg-black/20 px-4 py-4 transition-colors",
                  o.apex
                    ? "border-gold/25 hover:border-gold/50"
                    : "border-white/[0.07] hover:border-cyan/40",
                )}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">{o.name}</span>
                  <span className="shrink-0 font-mono text-[0.74rem] tabular-nums text-muted-foreground">
                    {formatCurrency(o.price)}/mo
                  </span>
                </span>
                <span className="mt-1 block text-[0.78rem] leading-relaxed text-muted-foreground">
                  {o.promise}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Proof posture ──────────────────────────────────────────────── */}
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

      {/* ── The form, with the whole stack ticked ──────────────────────── */}
      <section id="enquiry" className="scroll-mt-24 border-t border-white/[0.06] py-14 md:py-16">
        <div className="container">
          <h2 className="text-[1.75rem] font-bold leading-tight tracking-tight md:text-4xl">
            Get a price for {b.name}
          </h2>
          <p className="mt-3 max-w-2xl text-[0.95rem] leading-relaxed text-muted-foreground">
            Every member arrives ticked, and the stack price applies automatically once they all
            are — the server recomputes it from the same catalogue either way.
          </p>
          <div className="mt-8">
            <Enquiry preselect={b.members} />
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
