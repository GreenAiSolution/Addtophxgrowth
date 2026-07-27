import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { VERTICAL_PACKS } from "@/lib/verticals";
import { BRAND } from "@/lib/brand";
import { Badge } from "@/components/ui/badge";
import { SiteHeader, SiteFooter } from "@/components/marketing/site-chrome";

export const metadata: Metadata = {
  title: `Built for your trade — ${BRAND.name}`,
  description:
    "The same growth desk, pre-tuned per industry. Roofing, HVAC, med spa, dental, legal and remodeling packs arrive with the rubric, escalation matrix and playbooks already written.",
};

export default function VerticalsIndex() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      <section className="container py-16 text-center">
        <Badge>Industry packs</Badge>
        <h1 className="mx-auto mt-5 max-w-3xl font-heading text-4xl font-bold leading-[1.05] md:text-5xl">
          Same desk. Already speaking your trade.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
          Generic software makes you do the translating. Pick your trade and the qualification bar,
          escalation rules and one-click jobs arrive written — then you edit them until they&apos;re
          exactly yours.
        </p>
      </section>

      <section className="container pb-20">
        <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-2">
          {VERTICAL_PACKS.map((pack) => (
            <Link
              key={pack.key}
              href={`/verticals/${pack.key}`}
              className="hud-panel hud-corners group flex flex-col p-6 transition-colors hover:border-cyan/60"
            >
              <span className="hud-label">{pack.trade}</span>
              <h2 className="mt-1 font-heading text-xl font-bold">{pack.name}</h2>
              <p className="mt-3 flex-1 text-sm text-muted-foreground">{pack.promise}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 font-mono text-[0.68rem] uppercase tracking-widest text-cyan">
                open the pack
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted-foreground">
          Don&apos;t see your trade?{" "}
          <Link href="/#contact" className="text-cyan hover:underline">
            Tell us what you do
          </Link>{" "}
          — the build phase tunes the system to any business, pack or no pack.
        </p>
      </section>

      <SiteFooter />
    </div>
  );
}
