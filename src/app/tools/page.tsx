import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, ArrowRight } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { DECK_INDEX, TOOL_IDS } from "@/lib/deck";
import { UPGRADES, entryPrice } from "@/lib/upgrades";
import { formatCurrency } from "@/lib/utils";
import { env } from "@/lib/env";
import { Wordmark, SiteFooter } from "@/components/marketing/site-chrome";

/**
 * THE CONTENTS PAGE, AS A PAGE.
 *
 * DIRECTION
 *   The deck is one long scroll and that is right for it — the tools build on
 *   each other, and three of them sit behind a fold precisely so the page does
 *   not open as a wall. What that shape cannot do is answer "what tools are
 *   there?" without making somebody scroll to find out.
 *
 *   So the index that already lives at the top of the deck gets its own
 *   address, with room per tool for a line about what looking at it tells you.
 *   Every entry links to the live instrument.
 *
 * WHY THIS IS AN INDEX AND NOT A SECOND DECK
 *   Rendering the instruments here as well would put the same seven tools on
 *   two URLs, which is a duplicate of the most expensive page on the site and
 *   splits whichever one a search engine decides to keep. The tools stay in one
 *   place; this page is the way in.
 *
 * ONE SOURCE, THREE READERS
 *   `DECK_INDEX` already drives the deck's render order and the contents list
 *   on the home page, and `consistency.test.ts` fails if those two disagree.
 *   This is the third reader of the same array, so a tool added to the deck
 *   appears here without anybody remembering to add it.
 */

const TITLE = `The tools — ${BRAND.name}`;
const DESCRIPTION =
  `${TOOL_IDS.length} free tools that show you what you can't currently see about your own ` +
  `business — what AI knows about you, what a missed call costs, and where your next ad dollar ` +
  `should go. Your numbers, nothing to sign up for.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/tools" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${env.siteUrl}/tools` },
  twitter: { title: TITLE, description: DESCRIPTION },
};

export default function ToolsPage() {
  const map = DECK_INDEX.find((d) => d.id === "map")!;
  const tools = DECK_INDEX.filter((d) => d.id !== "map");

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
            <Link href="/upgrades" className="pill-ghost px-4 py-2.5 text-sm">
              Prices
            </Link>
            <Link href="/" className="pill-primary px-4 py-2.5 text-sm sm:px-5">
              <span className="sm:hidden">Open</span>
              <span className="hidden sm:inline">Open the deck</span>
            </Link>
          </div>
        </div>
      </header>

      <section className="relative grain overflow-hidden py-14 md:py-20">
        <div className="aurora" />
        <div className="container relative">
          <p className="eyebrow text-[0.68rem] text-muted-foreground">
            {TOOL_IDS.length} tools · one live map · one of them sells you nothing
          </p>
          <h1 className="mt-5 max-w-3xl text-[2.4rem] font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
            Everything you can
            <br />
            <span className="text-gradient">measure for free.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            No slide deck, no case studies, no sign-up. Each one runs on your numbers and tells
            you something you can act on whether or not you ever buy anything here.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/" className="pill-primary px-5 py-2.5 text-sm">
              Open the deck <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/map" className="pill-ghost px-5 py-2.5 text-sm">
              Start with the map
            </Link>
          </div>
        </div>
      </section>

      {/* The map first, because it is the shape everything else sits inside. */}
      <section className="border-t border-white/[0.06] py-14 md:py-16">
        <div className="container">
          <Link
            href="/map"
            className="group flex flex-wrap items-baseline gap-x-4 gap-y-2 rounded-2xl border border-cyan/25 bg-cyan/[0.03] p-5 transition-colors hover:border-cyan/50 md:p-6"
          >
            <span className="font-mono text-[0.8rem] tracking-[0.2em] text-cyan">{map.n}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-xl font-bold tracking-tight">{map.name}</span>
              <span className="mt-1 block text-[0.88rem] text-muted-foreground">{map.reads}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-[0.82rem] text-cyan">
              Open
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </div>
      </section>

      <section className="border-t border-white/[0.06] py-14 md:py-16">
        <div className="container">
          <h2 className="text-[1.6rem] font-bold leading-tight tracking-tight md:text-3xl">
            The {tools.length} tools
          </h2>

          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/#${t.id}`}
                  className="group flex h-full flex-col rounded-2xl border border-white/[0.07] bg-black/20 p-5 transition-colors hover:border-cyan/40"
                >
                  <span className="font-mono text-[0.72rem] tabular-nums tracking-[0.2em] text-cyan">
                    {t.n}
                  </span>
                  <span className="mt-2.5 block text-lg font-bold leading-tight tracking-tight">
                    {t.name}
                  </span>
                  <span className="mt-1.5 block text-[0.84rem] leading-relaxed text-muted-foreground">
                    {t.reads}
                  </span>
                  {t.folded && (
                    <span className="mt-3 self-start rounded-full border border-white/10 px-2.5 py-1 text-[0.66rem] text-muted-foreground/70">
                      Behind the fold — the link still opens it
                    </span>
                  )}
                  <span className="mt-auto pt-4 inline-flex items-center gap-1.5 text-[0.8rem] text-cyan">
                    Run it
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t border-white/[0.06] py-14 md:py-16">
        <div className="container">
          <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-6 md:p-8">
            <h2 className="max-w-2xl text-xl font-bold leading-snug tracking-tight md:text-2xl">
              Already know what you want?
            </h2>
            <p className="mt-3 max-w-2xl text-[0.92rem] leading-relaxed text-muted-foreground">
              The tools are the better way in, but they are not a toll gate. All {UPGRADES.length}{" "}
              upgrades and every price are on one page, from {formatCurrency(entryPrice())} a month.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/upgrades" className="pill-primary px-5 py-2.5 text-sm">
                See the prices <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/get-a-price" className="pill-ghost px-5 py-2.5 text-sm">
                Get a price
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
