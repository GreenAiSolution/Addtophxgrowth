import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, ArrowLeft, ArrowRight } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { PARENT_SERVICES, UPGRADES, BUNDLES, OPERATORS, MANIFEST } from "@/lib/upgrades";
import { env } from "@/lib/env";
import { Playground } from "@/components/marketing/playground";
import { SystemMap } from "@/components/marketing/system-map";
import { Wordmark, SiteFooter } from "@/components/marketing/site-chrome";

/**
 * THE MAP, ON ITS OWN ADDRESS.
 *
 * DIRECTION
 *   The map is the one thing on this site that explains the whole business in
 *   a single object: the agency at the centre, the services orbiting it, the
 *   upgrades hanging off those, and gold arcs where two upgrades make each
 *   other worth more. It opens the deck for exactly that reason.
 *
 *   It was also only ever reachable as `#map` — an anchor into the middle of a
 *   long page. That is the wrong shape for the thing you would send somebody
 *   who asks "so what do you actually do?", and it is the wrong shape for a
 *   search result.
 *
 * WHY THIS IS NOT A COPY OF THE HOME PAGE
 *   The deck keeps its map: it is the opener, and removing it would leave the
 *   tools below with nowhere to sit in the reader's head. What this page adds
 *   is the reading — what the bands mean, what the counts are, and where to go
 *   next — which the deck deliberately does not stop to explain because the
 *   seven instruments underneath it are the point there.
 *
 *   Every number below is counted from the catalogue, so this page cannot claim
 *   a roster or a gap count the map itself does not draw.
 */

const TITLE = `The system map — ${BRAND.name}`;
const DESCRIPTION =
  `Your agency at the centre, the ${PARENT_SERVICES.length} services you already buy orbiting it, ` +
  `and the ${UPGRADES.length} upgrades that bolt onto them — as one object you can spin. ` +
  `Gold lines mark the ${BUNDLES.length} stacks that are cheaper taken together.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/map" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${env.siteUrl}/map` },
  twitter: { title: TITLE, description: DESCRIPTION },
};

/** Counted, never typed — the map draws from the same arrays. */
const BANDS = [
  {
    label: "Your agency",
    detail: `${BRAND.parent.name} at the centre. Everything else on the map already runs on your account or bolts onto something that does.`,
    count: 1,
  },
  {
    label: "Services you already buy",
    detail: `The ${PARENT_SERVICES.length} à la carte services, each with its own published bullet list. Nothing sold here replaces any of them.`,
    count: PARENT_SERVICES.length,
  },
  {
    label: "Upgrades sold here",
    detail: `The ${UPGRADES.length} gaps left over once the flight plan is flying — each one checked against the roster of ${OPERATORS.length} operators and the ${MANIFEST.length}-item Manifest before it earned a place.`,
    count: UPGRADES.length,
  },
  {
    label: "Gold arcs",
    detail: `The ${BUNDLES.length} stacks. An arc is drawn wherever two upgrades belong to the same stack, because those two make each other worth more.`,
    count: BUNDLES.length,
  },
];

export default function MapPage() {
  return (
    <div className="relative">
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
              <span className="hidden sm:inline">The tools</span>
            </Link>
            <Link href="/upgrades" className="pill-primary px-4 py-2.5 text-sm sm:px-5">
              Prices
            </Link>
          </div>
        </div>
      </header>

      <section className="relative grain overflow-hidden pt-14 md:pt-20">
        <div className="aurora" />
        <div className="container relative">
          <p className="eyebrow text-[0.68rem] text-muted-foreground">The whole business</p>
          <h1 className="mt-5 max-w-3xl text-[2.4rem] font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
            One object.
            <br />
            <span className="text-gradient">Every moving part.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Drag it, tap any dot. The bright centre is everything you already pay for; the small
            outer dots are the only things sold on this site.
          </p>
        </div>
      </section>

      {/* The instrument itself, unchanged — same component the deck opens with.
          It reads the shared selection store, so it needs the provider; the
          deck's instrument rail does not come with it, because the modules its
          dots point at are not on this page. */}
      <Playground rail={false}>
        <SystemMap />
      </Playground>

      <section className="border-t border-white/[0.06] py-14 md:py-16">
        <div className="container">
          <h2 className="text-[1.6rem] font-bold leading-tight tracking-tight md:text-3xl">
            How to read it
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {BANDS.map((band) => (
              <div
                key={band.label}
                className="rounded-2xl border border-white/[0.07] bg-black/20 p-5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold">{band.label}</h3>
                  <span className="font-mono text-[0.74rem] tabular-nums text-muted-foreground">
                    {band.count}
                  </span>
                </div>
                <p className="mt-2 text-[0.86rem] leading-relaxed text-muted-foreground">
                  {band.detail}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/upgrades" className="pill-primary px-5 py-2.5 text-sm">
              See every upgrade and price <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/tools" className="pill-ghost px-5 py-2.5 text-sm">
              Run the tools on your own numbers
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
