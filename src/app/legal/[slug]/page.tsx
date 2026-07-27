import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { LEGAL_DOCUMENTS, legalBySlug, LEGAL_LAST_UPDATED } from "@/lib/legal";
import { BRAND } from "@/lib/brand";
import { Button } from "@/components/ui/button";

/**
 * One template, three documents. Static — these have to be readable when
 * everything else is down, and they need to be crawlable so Stripe and anyone
 * doing diligence can find them.
 */

export function generateStaticParams() {
  return LEGAL_DOCUMENTS.map((d) => ({ slug: d.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const doc = legalBySlug(params.slug);
  if (!doc) return { title: "Not found" };
  return {
    title: `${doc.title} — ${BRAND.name}`,
    description: doc.summary,
  };
}

export default function LegalPage({ params }: { params: { slug: string } }) {
  const doc = legalBySlug(params.slug);
  if (!doc) notFound();

  return (
    <div className="min-h-screen">
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
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" /> Home
            </Link>
          </Button>
        </div>
      </header>

      <article className="container max-w-3xl py-14">
        <h1 className="font-heading text-3xl font-bold md:text-4xl">{doc.title}</h1>
        <p className="mt-3 text-muted-foreground">{doc.summary}</p>
        <p className="hud-label mt-4">Last updated {LEGAL_LAST_UPDATED}</p>

        {/* Sibling documents — someone reading one usually wants another. */}
        <nav className="mt-6 flex flex-wrap gap-2 border-y border-border/60 py-4">
          {LEGAL_DOCUMENTS.map((d) => (
            <Link
              key={d.slug}
              href={`/legal/${d.slug}`}
              className={`rounded-full border px-4 py-1.5 text-xs transition-colors ${
                d.slug === doc.slug
                  ? "border-cyan/70 bg-cyan/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-cyan/40"
              }`}
            >
              {d.title}
            </Link>
          ))}
        </nav>

        <div className="mt-10 space-y-9">
          {doc.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-heading text-lg font-bold">{section.heading}</h2>
              <div className="mt-2 space-y-3">
                {section.body.map((p, i) => (
                  <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                    {p}
                  </p>
                ))}
              </div>
              {section.bullets && (
                <ul className="mt-3 space-y-1.5 border-l border-cyan/25 pl-4">
                  {section.bullets.map((b) => (
                    <li key={b} className="text-sm leading-relaxed text-muted-foreground">
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <div className="mt-14 border-t border-border/60 pt-6">
          <p className="text-xs text-muted-foreground">
            Questions about any of this? Email{" "}
            <a href={`mailto:${BRAND.notifyEmail}`} className="text-cyan hover:underline">
              {BRAND.notifyEmail}
            </a>{" "}
            and a person will answer.
          </p>
        </div>
      </article>
    </div>
  );
}
