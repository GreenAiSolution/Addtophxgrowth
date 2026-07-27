import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * The public shell — one wordmark, one nav, one footer, used everywhere.
 *
 * These were copy-pasted across six routes, which meant the mark drifted (some
 * pages had a nav, some had none, one had a stale link) and every rename meant
 * six edits. The nav uses root-relative anchors like `/#creative` rather than
 * bare `#creative`, so the same links work from a showroom page as from home.
 */

/** The luminous mark. `size` is the only thing that varies between surfaces. */
export function Wordmark({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <Link
      href="/"
      className={cn(
        "group flex shrink-0 items-center gap-2 whitespace-nowrap font-heading font-bold",
        size === "lg" ? "text-lg sm:text-xl" : "text-base sm:text-lg",
      )}
    >
      <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/15 shadow-hud transition-transform duration-500 group-hover:rotate-90">
        {/* Drawn, not typed. The diamond glyphs this replaced rendered as
            tofu in the OG image renderer and in a couple of Android fonts. */}
        <span className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-gradient-to-br from-cyan via-violet to-magenta" />
      </span>
      {BRAND.wordmarkLead}
      <span className="text-gradient">{BRAND.wordmarkAccent}</span>
    </Link>
  );
}

const NAV = [
  { href: "/showroom", label: "Showroom" },
  { href: "/#creative", label: "Creative" },
  { href: "/verticals", label: "Your Trade" },
  { href: "/#pricing", label: "Pricing" },
];

export function SiteHeader({
  signedIn = false,
  /** Hide the nav on pages that are already a focused single task. */
  showNav = true,
}: {
  signedIn?: boolean;
  showNav?: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Wordmark />
        {showNav && (
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground lg:flex">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="transition-colors hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </nav>
        )}
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href={signedIn ? "/app" : "/login"}>{signedIn ? "Console" : "Sign in"}</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/cockpit" className="whitespace-nowrap">
              <span className="sm:hidden">Build</span>
              <span className="hidden sm:inline">Build your cockpit</span>
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 py-10">
      <div className="container space-y-5">
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link href="/showroom" className="hover:text-foreground">The Showroom</Link>
          <Link href="/cockpit" className="hover:text-foreground">Build a cockpit</Link>
          <Link href="/verticals" className="hover:text-foreground">Your trade</Link>
          <Link href="/#pricing" className="hover:text-foreground">Pricing</Link>
          <Link href="/legal/terms" className="hover:text-foreground">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/legal/msa" className="hover:text-foreground">Services agreement</Link>
        </div>

        {/* The relationship, restated at the bottom of every page. A visitor
            who scrolls to the footer wondering "who are these people" should
            find the answer there rather than having to search for it. */}
        <div className="flex flex-col items-center gap-2 border-t border-border/40 pt-5 text-center">
          <a
            href={BRAND.parent.url}
            className="inline-flex items-center gap-1.5 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-cyan transition-colors hover:text-foreground"
          >
            A {BRAND.parent.name} property <ArrowRight className="h-3 w-3" />
          </a>
          <div className="flex w-full flex-col items-center justify-between gap-2 text-sm text-muted-foreground sm:flex-row">
            <span>© {new Date().getFullYear()} {BRAND.name}</span>
            <span className="font-mono text-xs uppercase tracking-widest">
              Cockpit online · systems nominal
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
