import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { HOUSE_THESIS } from "@/lib/house";
import {
  OFFERS,
  SHELVES,
  offersOnShelf,
  offerHref,
  offerSaving,
  priceRange,
  type Offer,
} from "@/lib/storefront";
import { SHELF_ICONS } from "@/lib/showroom-icons";
import { formatCurrency } from "@/lib/utils";
import { env } from "@/lib/env";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiteHeader, SiteFooter } from "@/components/marketing/site-chrome";

export const metadata: Metadata = {
  title: `The Showroom — ${BRAND.name}`,
  description:
    "Every system and every service we sell, opened up: what it contains, what it costs, and a way to buy it without a proposal. Memberships, creative production, foundations, intelligence and capacity — all priced on the wall.",
  alternates: { canonical: "/showroom" },
};

/**
 * The Showroom — the reason this site exists separately from the agency.
 *
 * An agency site sells a relationship and hides the price. This page does the
 * opposite: it puts the entire catalogue on one surface, with the manifest and
 * the number attached to each item, so a buyer can qualify themselves without
 * booking a call. That transparency is the strategic bet — it loses the
 * prospects who were never going to afford it, and wins the ones who are tired
 * of being handled.
 */

function priceBlock(offer: Offer) {
  const saving = offerSaving(offer);
  return (
    <div className="mt-4 border-t border-border/50 pt-3">
      <div className="flex items-baseline gap-1.5">
        <span className="hud-value text-2xl font-bold">{formatCurrency(offer.price)}</span>
        <span className="text-xs text-muted-foreground">
          {offer.billing === "monthly" ? "/mo" : "once"}
        </span>
      </div>
      {offer.setupFee ? (
        <div className="mt-0.5 font-mono text-[0.62rem] text-secondary">
          + {formatCurrency(offer.setupFee)} one-time build
        </div>
      ) : null}
      {saving > 0 && (
        <div className="mt-0.5 font-mono text-[0.62rem] uppercase tracking-widest text-emerald-400">
          saves {formatCurrency(saving)}
        </div>
      )}
    </div>
  );
}

function OfferCard({ offer }: { offer: Offer }) {
  return (
    <Link
      href={offerHref(offer)}
      className="hud-panel lift flex flex-col p-5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-heading text-base font-bold">{offer.name}</h3>
        {offer.featured && (
          <Badge variant="violet" className="shrink-0">
            {offer.kind === "PLAN" ? "most chosen" : "most paired"}
          </Badge>
        )}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{offer.blurb}</p>

      <ul className="mt-3 flex-1 space-y-1">
        {offer.includes.slice(0, 3).map((item) => (
          <li key={item} className="flex items-start gap-1.5 text-[0.7rem] text-foreground/75">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-cyan" />
            <span className="line-clamp-2">{item}</span>
          </li>
        ))}
        {offer.includes.length > 3 && (
          <li className="pl-3 font-mono text-[0.6rem] uppercase tracking-widest text-cyan/70">
            +{offer.includes.length - 3} more
          </li>
        )}
      </ul>

      {priceBlock(offer)}

      <span className="mt-3 inline-flex items-center gap-1 font-mono text-[0.62rem] uppercase tracking-widest text-cyan">
        Open the spec <ArrowUpRight className="h-3 w-3" />
      </span>
    </Link>
  );
}

/**
 * Structured data for the catalogue. Each shelf becomes an OfferCatalog, which
 * is what earns the price-annotated result for searches like "AI lead
 * qualification pricing" — the exact query a self-qualifying buyer types.
 */
function structuredData() {
  const base = env.appUrl.replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "OfferCatalog",
    name: `${BRAND.name} Showroom`,
    url: `${base}/showroom`,
    numberOfItems: OFFERS.length,
    itemListElement: OFFERS.map((o, i) => ({
      "@type": "Offer",
      position: i + 1,
      name: o.name,
      description: o.blurb,
      price: (o.price / 100).toFixed(2),
      priceCurrency: "USD",
      url: `${base}${offerHref(o)}`,
      ...(o.billing === "monthly"
        ? {
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: (o.price / 100).toFixed(2),
              priceCurrency: "USD",
              billingDuration: 1,
              billingIncrement: 1,
              unitCode: "MON",
            },
          }
        : {}),
    })),
  };
}

export default function ShowroomPage() {
  const { low, high } = priceRange();
  const services = OFFERS.filter((o) => o.kind !== "PLAN").length;

  return (
    <div className="relative min-h-screen">
      {/* eslint-disable-next-line react/no-danger */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()) }}
      />
      <SiteHeader />

      {/* Hero */}
      <section className="relative grain py-20 md:py-28">
        <div className="aurora" />
        <div className="container text-center">
          <Badge className="mx-auto">Everything on one wall</Badge>
          <h1 className="mx-auto mt-6 max-w-4xl font-heading text-5xl font-bold leading-[1.02] md:text-7xl">
            The <span className="text-kinetic">Showroom</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Every system and every service, opened up — what it contains, what it costs, and a way
            to buy it in one sitting. No proposal, no discovery call to find out the number.
          </p>

          <dl className="mx-auto mt-10 grid max-w-2xl grid-cols-3 gap-4">
            {[
              { k: String(OFFERS.length), v: "things you can buy" },
              { k: String(services), v: "à la carte services" },
              { k: `${formatCurrency(low)}–${formatCurrency(high)}`, v: "monthly range" },
            ].map((s) => (
              <div key={s.v} className="hud-panel p-4">
                <dt className="hud-value text-lg font-bold text-gradient sm:text-2xl">{s.k}</dt>
                <dd className="hud-label mt-1 leading-tight">{s.v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/cockpit">
                Build your cockpit <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#shelves">Browse the shelves</a>
            </Button>
          </div>
        </div>
      </section>

      {/* Why this exists — stated once, at the top, so nobody wonders why a
          growth agency has a second website. */}
      <section className="container pb-4">
        <div className="hud-panel hud-corners mx-auto max-w-3xl p-6 text-center">
          <h2 className="font-heading text-lg font-bold">{HOUSE_THESIS.headline}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{HOUSE_THESIS.body}</p>
        </div>
      </section>

      {/* Shelf index — a long catalogue needs a way in that isn't scrolling. */}
      <section id="shelves" className="container py-10">
        <div className="flex flex-wrap justify-center gap-2">
          {SHELVES.map((shelf) => {
            const Icon = SHELF_ICONS[shelf.key];
            return (
              <a
                key={shelf.key}
                href={`#${shelf.key}`}
                className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs text-muted-foreground transition-colors hover:border-cyan/50 hover:text-foreground"
              >
                <Icon className="h-3.5 w-3.5 text-cyan" />
                {shelf.label}
                <span className="hud-value text-[0.65rem] text-cyan/60">
                  {offersOnShelf(shelf.key).length}
                </span>
              </a>
            );
          })}
        </div>
      </section>

      {/* The shelves */}
      {SHELVES.map((shelf, i) => {
        const items = offersOnShelf(shelf.key);
        const Icon = SHELF_ICONS[shelf.key];
        return (
          <section key={shelf.key} id={shelf.key} className="container scroll-mt-20 py-12">
            <div className="mb-6">
              <hr className="rule-glow mb-6" />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <span className="section-index">
                    {String(i + 1).padStart(2, "0")} — {shelf.kicker}
                  </span>
                  <h2 className="mt-1.5 flex items-center gap-2.5 font-heading text-2xl font-bold md:text-3xl">
                    <Icon className="h-6 w-6 shrink-0 text-cyan" />
                    {shelf.label}
                  </h2>
                </div>
                <p className="max-w-md text-sm text-muted-foreground sm:text-right">{shelf.note}</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((offer) => (
                <OfferCard key={offer.slug} offer={offer} />
              ))}
            </div>
          </section>
        );
      })}

      {/* Close */}
      <section className="container py-16">
        <div className="hud-panel hud-corners relative overflow-hidden p-10 text-center md:p-14">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-cyan/10 via-violet/10 to-magenta/10" />
          <h2 className="relative font-heading text-3xl font-bold md:text-4xl">
            Take any combination of it.
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-muted-foreground">
            The configurator adds it up in front of you — the same arithmetic your invoice will
            use. Nothing is charged until you say so.
          </p>
          <div className="relative mt-7">
            <Button asChild size="lg">
              <Link href="/cockpit">
                Build your cockpit <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
