import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, ArrowUpRight, Check, ChevronRight, Receipt, Sparkles } from "lucide-react";
import { BRAND } from "@/lib/brand";
import {
  OFFERS,
  offerBySlug,
  offerHref,
  offerSaving,
  firstInvoice,
  relatedOffers,
  shelfByKey,
  anchorPlanFor,
  type Offer,
} from "@/lib/storefront";
import { SHELF_ICONS } from "@/lib/showroom-icons";
import { blueprintFor } from "@/lib/systems";
import { modulesByDelivery } from "@/lib/systems";
import { formatCurrency } from "@/lib/utils";
import { env } from "@/lib/env";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiteHeader, SiteFooter } from "@/components/marketing/site-chrome";

/**
 * One page per purchasable thing.
 *
 * The premium product view: what it is, everything it contains, exactly what
 * leaves your account and when, and a button that puts it in the configurator.
 * A visitor should be able to finish this page and know whether they want it
 * without speaking to anyone — that is the entire proposition of a storefront
 * over an agency site.
 *
 * Static at build time. Every offer is derived from the catalogue, so a new
 * service ships with a page, a sitemap entry and structured data attached.
 */

export function generateStaticParams() {
  return OFFERS.map((o) => ({ slug: o.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const offer = offerBySlug(params.slug);
  if (!offer) return { title: `Not found — ${BRAND.name}` };

  const price =
    offer.billing === "monthly"
      ? `${formatCurrency(offer.price)}/mo`
      : `${formatCurrency(offer.price)} once`;

  return {
    title: `${offer.name} — ${price} — ${BRAND.name}`,
    description: `${offer.blurb} ${offer.includes.slice(0, 2).join(". ")}.`,
    alternates: { canonical: offerHref(offer) },
    openGraph: {
      title: `${offer.name} — ${price}`,
      description: offer.blurb,
      url: `${env.appUrl.replace(/\/$/, "")}${offerHref(offer)}`,
    },
  };
}

function structuredData(offer: Offer) {
  const base = env.appUrl.replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: offer.name,
    description: offer.blurb,
    brand: { "@type": "Brand", name: BRAND.name },
    url: `${base}${offerHref(offer)}`,
    offers: {
      "@type": "Offer",
      price: (offer.price / 100).toFixed(2),
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: `${base}${offerHref(offer)}`,
    },
  };
}

export default function OfferPage({ params }: { params: { slug: string } }) {
  const offer = offerBySlug(params.slug);
  if (!offer) notFound();

  const shelf = shelfByKey(offer.shelf);
  const Icon = SHELF_ICONS[offer.shelf];
  const saving = offerSaving(offer);
  const blueprint = offer.kind === "PLAN" ? blueprintFor(offer.slug) : undefined;
  const anchor = anchorPlanFor(offer);
  const related = relatedOffers(offer);

  const instant = blueprint ? modulesByDelivery(blueprint, "INSTANT").length : 0;
  const built = blueprint ? modulesByDelivery(blueprint, "BUILD").length : 0;

  return (
    <div className="relative min-h-screen">
      {/* eslint-disable-next-line react/no-danger */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(offer)) }}
      />
      <SiteHeader />

      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="container flex flex-wrap items-center gap-1.5 pt-8 font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground"
      >
        <Link href="/showroom" className="transition-colors hover:text-foreground">
          Showroom
        </Link>
        <ChevronRight className="h-3 w-3" />
        <a href={`/showroom#${offer.shelf}`} className="transition-colors hover:text-foreground">
          {shelf?.label}
        </a>
        <ChevronRight className="h-3 w-3" />
        <span className="text-cyan">{offer.name}</span>
      </nav>

      {/* Hero */}
      <section className="relative grain pb-14 pt-8">
        <div className="aurora" />
        <div className="container grid gap-10 lg:grid-cols-[1fr_20rem] lg:items-start">
          <div>
            <span className="section-index flex items-center gap-2">
              <Icon className="h-3.5 w-3.5" />
              {shelf?.label}
            </span>
            <h1 className="mt-3 max-w-2xl font-heading text-4xl font-bold leading-[1.05] md:text-6xl">
              {offer.name}
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-muted-foreground">{offer.blurb}</p>

            {blueprint && (
              <p className="mt-5 max-w-2xl border-l-2 border-cyan/50 pl-4 text-base italic text-foreground/85">
                {blueprint.promise}
              </p>
            )}

            {/* At a glance. On a five-figure purchase "when does this actually
                start working" and "what am I tied to" are the next two
                questions after price, so they get answered in the hero rather
                than three sections down. Plans can answer with real delivery
                counts from the blueprint; services answer with cadence and
                commitment, which is what a buyer is weighing there instead. */}
            <div className="mt-8 flex flex-wrap gap-3">
              {blueprint ? (
                <>
                  <div className="hud-panel px-4 py-3">
                    <div className="hud-value text-xl font-bold text-cyan">{instant}</div>
                    <div className="hud-label mt-0.5">live the moment you pay</div>
                  </div>
                  <div className="hud-panel px-4 py-3">
                    <div className="hud-value text-xl font-bold text-secondary">{built}</div>
                    <div className="hud-label mt-0.5">built with you, in the build</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="hud-panel px-4 py-3">
                    <div className="hud-value text-xl font-bold text-cyan">
                      {offer.includes.length}
                    </div>
                    {/* "items in the spec", not "things delivered" — a service
                        whose first line reads "10 edited video ads" must not
                        sit under a tile saying 4. */}
                    <div className="hud-label mt-0.5">items in the spec</div>
                  </div>
                  <div className="hud-panel px-4 py-3">
                    <div className="hud-value text-xl font-bold text-secondary">
                      {offer.billing === "monthly" ? "Monthly" : "Once"}
                    </div>
                    <div className="hud-label mt-0.5">
                      {offer.billing === "monthly" ? "cancel any time" : "then it's yours"}
                    </div>
                  </div>
                  <div className="hud-panel px-4 py-3">
                    <div className="hud-value text-xl font-bold text-magenta">No</div>
                    <div className="hud-label mt-0.5">contract or minimum term</div>
                  </div>
                </>
              )}
            </div>

            {/* Why this shelf exists at all — orients somebody who arrived on
                this page cold from a search result rather than from the
                showroom, which for a long-tail page is most of them. */}
            {shelf && (
              <p className="mt-7 max-w-xl border-l-2 border-border pl-4 text-sm leading-relaxed text-muted-foreground">
                <span className="text-foreground/80">{shelf.label}.</span> {shelf.note}
              </p>
            )}
          </div>

          {/* Buy rail */}
          <aside className="lg:sticky lg:top-24">
            <div className="hud-panel hud-corners p-6">
              <div className="hud-label">{offer.billing === "monthly" ? "Monthly" : "One-time"}</div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="hud-value text-4xl font-bold text-gradient">
                  {formatCurrency(offer.price)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {offer.billing === "monthly" ? "/mo" : "once"}
                </span>
              </div>

              {offer.setupFee ? (
                <div className="mt-2 font-mono text-xs text-secondary">
                  + {formatCurrency(offer.setupFee)} one-time build
                </div>
              ) : null}

              {saving > 0 && (
                <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-[0.7rem] text-emerald-300">
                  {formatCurrency(saving)} less than buying these separately.
                </div>
              )}

              {offer.setupFee ? (
                <div className="mt-4 flex items-baseline justify-between border-t border-border/50 pt-3">
                  <span className="hud-label">First invoice</span>
                  <span className="hud-value text-sm font-bold">
                    {formatCurrency(firstInvoice(offer))}
                  </span>
                </div>
              ) : null}

              <div className="mt-5 space-y-2">
                <Button asChild className="w-full" size="lg">
                  <Link href={offer.configure}>
                    Add to your cockpit <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                {offer.deepDive && (
                  <Button asChild variant="outline" className="w-full" size="sm">
                    <Link href={offer.deepDive}>See every module</Link>
                  </Button>
                )}
              </div>

              <p className="mt-3 text-center text-[0.65rem] leading-relaxed text-muted-foreground">
                Nothing is charged from this page. The configurator totals your whole build first.
              </p>

              {offer.pairsWith && (
                <p className="hud-label mt-4 border-t border-border/50 pt-3">
                  Usually taken with {offer.pairsWith}
                </p>
              )}
            </div>
          </aside>
        </div>
      </section>

      {/* The manifest */}
      <section className="container py-12">
        <hr className="rule-glow mb-8" />
        <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
          <div>
            <span className="section-index">What you receive</span>
            <h2 className="mt-1.5 font-heading text-2xl font-bold md:text-3xl">
              {offer.kind === "PLAN" ? "Included every month" : "Delivered"}
            </h2>
            <ul className="mt-6 space-y-3">
              {offer.includes.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan" />
                  <span className="text-sm leading-relaxed text-foreground/90">{item}</span>
                </li>
              ))}
            </ul>

            {blueprint && (
              <div className="mt-8">
                <span className="section-index">What changes in your business</span>
                <ul className="mt-3 space-y-2">
                  {blueprint.outcomes.map((o) => (
                    <li key={o} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-magenta" />
                      {o}
                    </li>
                  ))}
                </ul>
                {offer.deepDive && (
                  <Link
                    href={offer.deepDive}
                    className="mt-5 inline-flex items-center gap-1.5 font-mono text-[0.68rem] uppercase tracking-widest text-cyan hover:underline"
                  >
                    The full manifest, module by module <ArrowUpRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* How it bills. Written out because vague billing is the fastest way
              to lose a buyer who is otherwise ready. */}
          <div className="hud-panel h-fit p-6">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-cyan" />
              <h3 className="font-heading text-base font-bold">How this bills</h3>
            </div>
            <ul className="mt-4 space-y-3 text-xs leading-relaxed text-muted-foreground">
              {offer.billing === "monthly" ? (
                <li>
                  <span className="text-foreground">{formatCurrency(offer.price)} every month</span>,
                  starting the day you activate. Change or cancel from your console at any time —
                  changes prorate automatically.
                </li>
              ) : (
                <li>
                  <span className="text-foreground">{formatCurrency(offer.price)} once.</span> It is
                  a build, not a subscription — you own the result and nothing recurs.
                </li>
              )}
              {offer.setupFee ? (
                <li>
                  The <span className="text-foreground">{formatCurrency(offer.setupFee)} build</span>{" "}
                  lands on your first invoice alongside month one, and is never charged again — not
                  even if you change tiers later.
                </li>
              ) : null}
              <li>No contract and no minimum term. Nothing is charged until you check out.</li>
              {anchor && offer.kind !== "PLAN" && (
                <li>
                  Most often added to{" "}
                  <Link href={`/showroom/${anchor.key}`} className="text-cyan hover:underline">
                    {anchor.name}
                  </Link>
                  , but it works on any membership.
                </li>
              )}
            </ul>
            <Link
              href="/legal/msa"
              className="hud-label mt-5 inline-block hover:text-foreground"
            >
              Read the services agreement
            </Link>
          </div>
        </div>
      </section>

      {/* Related */}
      {related.length > 0 && (
        <section className="container py-12">
          <hr className="rule-glow mb-8" />
          <span className="section-index">Also on the counter</span>
          <h2 className="mt-1.5 font-heading text-2xl font-bold">
            What people look at next
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((r) => (
              <Link key={r.slug} href={offerHref(r)} className="hud-panel lift flex flex-col p-5">
                <span className="hud-label">{shelfByKey(r.shelf)?.label}</span>
                <span className="mt-1 font-heading text-base font-bold">{r.name}</span>
                <span className="mt-1.5 flex-1 text-xs leading-relaxed text-muted-foreground">
                  {r.blurb}
                </span>
                <span className="mt-3 flex items-baseline gap-1 border-t border-border/50 pt-3">
                  <span className="hud-value text-lg font-bold">{formatCurrency(r.price)}</span>
                  <span className="text-[0.65rem] text-muted-foreground">
                    {r.billing === "monthly" ? "/mo" : "once"}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Close */}
      <section className="container py-14">
        <div className="hud-panel hud-corners flex flex-col items-center gap-5 p-8 text-center sm:flex-row sm:text-left">
          <div className="flex-1">
            <h2 className="font-heading text-xl font-bold">
              Want {offer.name} alongside something else?
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Open the configurator and stack it with a membership, a trade pack and anything else
              on the counter. The total assembles as you go.
            </p>
          </div>
          <Button asChild size="lg" className="shrink-0">
            <Link href={offer.configure}>
              Add to your cockpit <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
