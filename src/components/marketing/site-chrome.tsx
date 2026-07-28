import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * The mark, and the plain chrome that legal pages wear.
 *
 * ALIGNMENT
 *   The mark is phxgrowth.com's, not a variant of it: a diamond in a glowing
 *   gradient disc, then `PHX` in the cyan→magenta gradient and `/GROWTH` solid
 *   white, heavily letter-spaced. The only addition is a gold PLUS chip, using
 *   the parent's own apex accent — a separate logo here would read as a
 *   separate company, which is exactly the confusion this property must avoid.
 *
 *   The two marketing pages carry their own headers, because in both cases the
 *   header is part of the composition. This is the plain version legal
 *   documents wear: a way back, the mark, and the parent relationship.
 *
 *   The footer is shared, and it names both public pages. It used to offer one
 *   link, labelled "Upgrades", pointing at the instrument deck — which was the
 *   only page there was. Somebody who reached the bottom of a contract wanting
 *   a price got a canvas.
 */

export function Wordmark({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <Link
      href="/"
      aria-label={`${BRAND.name} — home`}
      className="group flex shrink-0 items-center gap-2.5 whitespace-nowrap"
    >
      {/* Drawn rather than typed: the diamond glyph this replaces rendered as
          tofu in the OG image renderer and in a couple of Android fonts. */}
      <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-cyan via-violet to-magenta transition-transform duration-500 group-hover:rotate-90">
        <span className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan via-violet to-magenta blur-md opacity-60" />
        <span className="relative h-3 w-3 rotate-45 rounded-[2px] bg-white" />
      </span>
      <span
        className={cn(
          "font-bold tracking-[0.16em]",
          size === "lg" ? "text-lg sm:text-xl" : "text-base sm:text-lg",
        )}
      >
        <span className="text-gradient">{BRAND.wordmarkLead}</span>
        <span className="text-foreground">{BRAND.wordmarkMid}</span>
      </span>
      <span className="chip border-gold/40 bg-gold/10 text-gold">{BRAND.wordmarkAccent}</span>
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-background/80 backdrop-blur-xl">
      <div className="container flex h-[4.5rem] items-center justify-between gap-4">
        <Wordmark />
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.06] py-12">
      <div className="container space-y-6">
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link href="/" className="transition-colors hover:text-foreground">The tools</Link>
          <Link href="/upgrades" className="transition-colors hover:text-foreground">
            Upgrades &amp; prices
          </Link>
          <a
            href={`mailto:${BRAND.parent.email}`}
            className="transition-colors hover:text-foreground"
          >
            {BRAND.parent.email}
          </a>
          <Link href="/legal/terms" className="transition-colors hover:text-foreground">Terms</Link>
          <Link href="/legal/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
          <Link href="/legal/msa" className="transition-colors hover:text-foreground">Services agreement</Link>
          <Link href="/login" className="transition-colors hover:text-foreground">Client sign-in</Link>
        </div>

        <div className="flex flex-col items-center gap-2 border-t border-white/[0.06] pt-6 text-center">
          <a
            href={BRAND.parent.url}
            className="inline-flex items-center gap-1.5 text-sm text-cyan transition-colors hover:text-foreground"
          >
            An upgrade counter for {BRAND.parent.name} <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
          <span className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} {BRAND.name}
          </span>
        </div>
      </div>
    </footer>
  );
}
