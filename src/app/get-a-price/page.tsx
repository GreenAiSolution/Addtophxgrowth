import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, ArrowLeft } from "lucide-react";
import { BRAND } from "@/lib/brand";
import {
  UPGRADES,
  BUNDLES,
  FAIR_QUESTIONS,
  FLIGHT_CHECK,
  PROOF_POSTURE,
  upgradeByKey,
  bundleByKey,
  entryPrice,
} from "@/lib/upgrades";
import { formatCurrency } from "@/lib/utils";
import { env } from "@/lib/env";
import { Enquiry } from "@/components/marketing/enquiry";
import { Wordmark, SiteFooter } from "@/components/marketing/site-chrome";

/**
 * THE FORM, ON ITS OWN ADDRESS.
 *
 * DIRECTION
 *   "Get a price" was an anchor. It worked, but only from the two pages that
 *   happened to contain the form — so the button in the header of a detail page
 *   had nowhere to point, and a link pasted into an email opened the top of a
 *   price list and asked the reader to scroll to the bottom.
 *
 *   A form people are sent to needs a URL people can be sent to.
 *
 * PRE-SELECTION IS A LINK, NOT A DEFAULT
 *   `?add=` and `?stack=` tick boxes on arrival, because the visitor pressed
 *   something specific to get here. Both are validated against the catalogue
 *   before they reach the form: an unknown key ticks nothing rather than
 *   throwing, since a bad link in the wild should degrade to the plain form
 *   instead of a 404 on the one page that takes orders.
 *
 *   Nothing is ticked without a parameter. The enquiry component is built so
 *   an upgrade arrives selected only when the visitor asked for it, and a page
 *   that quietly pre-ticked its own upsells would break that on the way in.
 */

const TITLE = `Get a price — ${BRAND.name}`;
const DESCRIPTION =
  `Pick the upgrades you want and see the total before you send anything. ` +
  `${UPGRADES.length} upgrades and ${BUNDLES.length} stacks for ${BRAND.parent.name} clients, ` +
  `from ${formatCurrency(entryPrice())} a month. Month to month, no lock-in.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/get-a-price" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${env.siteUrl}/get-a-price` },
  twitter: { title: TITLE, description: DESCRIPTION },
};

/** One string or many, from a query string we do not control. */
function asKeys(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).flatMap((v) => v.split(",")).filter(Boolean);
}

export default function GetAPricePage({
  searchParams,
}: {
  searchParams?: { add?: string | string[]; stack?: string | string[] };
}) {
  // Validated against the catalogue, so a stale or hand-edited link degrades to
  // an empty form rather than ticking something that no longer exists.
  const fromUpgrades = asKeys(searchParams?.add).filter((k) => upgradeByKey(k));
  const fromStacks = asKeys(searchParams?.stack).flatMap((k) => bundleByKey(k)?.members ?? []);
  const preselect = [...new Set([...fromUpgrades, ...fromStacks])];

  const billing = FAIR_QUESTIONS.find((f) => f.q.toLowerCase().includes("bill"));
  const eligibility = FAIR_QUESTIONS.find((f) => f.q.toLowerCase().includes("need to be"));

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
              <ArrowLeft className="h-4 w-4" />
              <span className="sm:hidden">Prices</span>
              <span className="hidden sm:inline">Back to prices</span>
            </Link>
          </div>
        </div>
      </header>

      <section className="relative grain overflow-hidden py-14 md:py-20">
        <div className="aurora" />
        <div className="container relative">
          <p className="eyebrow text-[0.68rem] text-muted-foreground">No call required</p>
          <h1 className="mt-5 max-w-3xl text-[2.4rem] font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
            Tick what you want.
            <br />
            <span className="text-gradient">The total is on screen.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Nothing here is a payment and nothing commits you. Pick the upgrades, watch the number,
            and send it when it looks right — or{" "}
            <Link href="/upgrades" className="text-cyan underline-offset-4 hover:underline">
              read what each one does first
            </Link>
            .
          </p>

          {preselect.length > 0 && (
            <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-cyan/30 bg-cyan/[0.06] px-4 py-2 text-[0.8rem] text-cyan">
              {preselect.length === 1
                ? "One upgrade is ticked because you came from its page."
                : `${preselect.length} upgrades are ticked because you came from a stack.`}
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2">
            {[
              `From ${formatCurrency(entryPrice())}/mo`,
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

      <section id="enquiry" className="scroll-mt-24 border-t border-white/[0.06] py-12 md:py-14">
        <div className="container">
          <Enquiry preselect={preselect} />
        </div>
      </section>

      {/* The two questions people ask before sending a form, answered above it
          rather than on a page they would have to go and find. */}
      <section className="border-t border-white/[0.06] py-14 md:py-16">
        <div className="container">
          <div className="grid gap-5 lg:grid-cols-2">
            {[billing, eligibility].filter(Boolean).map((f) => (
              <div
                key={f!.q}
                className="rounded-2xl border border-white/[0.07] bg-black/20 p-5 md:p-6"
              >
                <h2 className="text-base font-bold tracking-tight">{f!.q}</h2>
                <p className="mt-2.5 text-[0.88rem] leading-relaxed text-muted-foreground">
                  {f!.a}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-white/[0.07] bg-black/20 p-5 md:p-6">
            <p className="eyebrow text-[0.6rem] text-muted-foreground/70">
              {PROOF_POSTURE.eyebrow}
            </p>
            <p className="mt-3 max-w-3xl text-[0.9rem] leading-relaxed text-muted-foreground">
              {PROOF_POSTURE.body}
            </p>
            <p className="mt-3 max-w-3xl text-[0.9rem] leading-relaxed text-foreground/80">
              {PROOF_POSTURE.founding}
            </p>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
