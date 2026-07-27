import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { parseCockpitLink, type CockpitLinkParams } from "@/lib/cockpit";
import { Badge } from "@/components/ui/badge";
import { CockpitConfigurator } from "@/components/cockpit/configurator";
import { SiteHeader, SiteFooter } from "@/components/marketing/site-chrome";

export const metadata: Metadata = {
  title: `Build your cockpit — ${BRAND.name}`,
  description:
    "Choose a signature build or assemble your own: automation crew, ad operations desk, industry pack and pairings, with the price adding up as you go.",
};

/**
 * The reservation floor. Everything above the configurator is atmosphere; the
 * configurator itself is the product decision. Server component so the only
 * client JS on the route is the configurator island.
 */
export default async function CockpitPage({
  searchParams,
}: {
  searchParams: CockpitLinkParams;
}) {
  const session = await auth();
  const initial = parseCockpitLink(searchParams);

  // Note: no `overflow-hidden` on the wrapper below. It would make that element
  // the scroll container and silently break `position: sticky` on the summary
  // rail — the one thing on this page that must never scroll out of view. The
  // ambient layer clips itself instead.
  return (
    <div className="relative min-h-screen">
      {/* Ambient depth — a faint grid and two soft light sources, so the page
          reads as a lit room rather than a flat form. Pointer-events off. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgb(34 211 238 / 0.35) 1px, transparent 1px), linear-gradient(to bottom, rgb(34 211 238 / 0.35) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
            maskImage: "radial-gradient(ellipse 90% 55% at 50% 0%, #000 40%, transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 90% 55% at 50% 0%, #000 40%, transparent 100%)",
          }}
        />
        <div className="absolute -top-40 left-1/2 h-[34rem] w-[64rem] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute right-[-10rem] top-[28rem] h-[26rem] w-[26rem] rounded-full bg-secondary/10 blur-[120px]" />
      </div>

      <SiteHeader />

      {/* Hero */}
      <section className="container py-16 text-center md:py-20">
        <Badge className="mx-auto">Reservations</Badge>
        <h1 className="mx-auto mt-6 max-w-3xl font-heading text-4xl font-bold leading-[1.03] md:text-6xl">
          Build your <span className="text-gradient">cockpit</span>.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
          Take a signature build exactly as it comes, or assemble your own — crew, ad desk, trade
          and pairings. The price adds up as you go, and what you see here is what gets invoiced.
        </p>
        {initial && (
          <p className="mx-auto mt-4 inline-flex max-w-xl items-center gap-2 rounded-full border border-cyan/30 bg-primary/5 px-4 py-1.5 font-mono text-[0.65rem] uppercase tracking-widest text-cyan">
            Loaded from your link — edit anything below
          </p>
        )}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
          <span>No contract</span>
          <span className="text-cyan">◆</span>
          <span>Change tiers any time</span>
          <span className="text-violet">◆</span>
          <span>Build fee charged once</span>
        </div>
      </section>

      <CockpitConfigurator signedIn={Boolean(session?.user)} initial={initial} />

      <SiteFooter />
    </div>
  );
}
