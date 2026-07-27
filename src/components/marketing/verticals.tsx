import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { VERTICAL_PACKS } from "@/lib/verticals";

/**
 * Trade strip. Server component — these are static links, no client JS.
 * Its job on the landing page is recognition: a roofer should see the word
 * "roofing" within one scroll and stop scanning.
 */
export function VerticalStrip() {
  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {VERTICAL_PACKS.map((pack) => (
          <Link
            key={pack.key}
            href={`/verticals/${pack.key}`}
            className="hud-panel group flex flex-col p-5 transition-colors hover:border-cyan/60"
          >
            <span className="hud-label">{pack.trade}</span>
            <span className="mt-1 font-heading text-base font-bold">{pack.name}</span>
            <span className="mt-2 flex-1 text-xs text-muted-foreground">{pack.painPoints[0]}</span>
            <span className="mt-3 inline-flex items-center gap-1.5 font-mono text-[0.62rem] uppercase tracking-widest text-cyan">
              open the pack
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Not on the list?{" "}
        <Link href="/#contact" className="text-cyan hover:underline">
          Tell us your trade
        </Link>{" "}
        — the build phase tunes the desk to any business.
      </p>
    </div>
  );
}
