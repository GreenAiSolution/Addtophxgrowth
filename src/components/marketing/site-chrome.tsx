import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { BRAND } from "@/lib/brand";

/**
 * Chrome for the pages that are not the page — legal documents, essentially.
 *
 * There is exactly one marketing page now, and it carries its own header and
 * footer because both are part of its composition. This is the plain version
 * everything else wears: a way back, the mark, and the relationship to the
 * parent agency. It deliberately has no nav, because there is nowhere else to
 * navigate to, and a nav bar full of anchors into another page is how the old
 * site accumulated dead links.
 */

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2 whitespace-nowrap font-heading text-base font-bold"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/15 shadow-hud transition-transform duration-500 group-hover:rotate-90">
            <span className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-gradient-to-br from-cyan via-violet to-magenta" />
          </span>
          {BRAND.wordmarkLead}
          <span className="text-gradient">{BRAND.wordmarkAccent}</span>
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Back
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 py-10">
      <div className="container space-y-5">
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">Upgrades</Link>
          <a href={`mailto:${BRAND.notifyEmail}`} className="hover:text-foreground">
            {BRAND.notifyEmail}
          </a>
          <Link href="/legal/terms" className="hover:text-foreground">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/legal/msa" className="hover:text-foreground">Services agreement</Link>
          <Link href="/login" className="hover:text-foreground">Client sign-in</Link>
        </div>

        <div className="flex flex-col items-center gap-2 border-t border-border/40 pt-5 text-center">
          <a
            href={BRAND.parent.url}
            className="inline-flex items-center gap-1.5 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-cyan transition-colors hover:text-foreground"
          >
            A {BRAND.parent.name} property <ArrowUpRight className="h-3 w-3" />
          </a>
          <span className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} {BRAND.name}
          </span>
        </div>
      </div>
    </footer>
  );
}
