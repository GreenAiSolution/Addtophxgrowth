import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CockpitConfigurator } from "@/components/cockpit/configurator";

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
export default async function CockpitPage() {
  const session = await auth();

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

      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 whitespace-nowrap font-heading text-base font-bold"
          >
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary/15 text-cyan shadow-hud">
              ◈
            </span>
            {BRAND.wordmarkLead}
            <span className="text-gradient">{BRAND.wordmarkAccent}</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/">
                <ArrowLeft className="h-4 w-4" /> Home
              </Link>
            </Button>
            {!session?.user && (
              <Button asChild variant="outline" size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

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
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
          <span>No contract</span>
          <span className="text-cyan">◆</span>
          <span>Change tiers any time</span>
          <span className="text-violet">◆</span>
          <span>Build fee charged once</span>
        </div>
      </section>

      <CockpitConfigurator signedIn={Boolean(session?.user)} />
    </div>
  );
}
