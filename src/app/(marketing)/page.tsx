import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Phone,
  Radar,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import {
  PARENT_SERVICES,
  UPGRADES,
  upgradesFor,
  entryPrice,
  THESIS,
  TERMS,
  type ServiceKey,
  type Upgrade,
} from "@/lib/upgrades";
import { formatCurrency } from "@/lib/utils";
import { env } from "@/lib/env";
import { Enquiry, AddUpgradeButton } from "@/components/marketing/enquiry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * The site. One page.
 *
 * DIRECTION
 *   PHX Growth Plus is not an agency and does not sell a growth programme —
 *   phxgrowth.com does that. This sells specialised upgrades that bolt onto the
 *   three services PHX Growth already runs, chosen because demand for each is
 *   visibly rising into 2027. Everything else that used to be here — six
 *   subscription tiers, a showroom, trade pages, a configurator — was a second
 *   agency competing with the first, and is gone.
 *
 * HOW THIS IS BUILT TO BE LOOKED AT
 *   "Attractive" is not a mood here, it is a set of decisions:
 *
 *   - ONE focal point per screen. The eye lands on the largest, highest-contrast
 *     element first; if two things compete for that, neither wins. Each section
 *     has exactly one.
 *   - Contrast carries hierarchy, colour carries meaning. Cyan means "you can
 *     act on this" and is used nowhere decorative, so a call to action is found
 *     without reading. Body copy stays under a comfortable measure (~65
 *     characters) because line length, not font size, is what makes long text
 *     tiring.
 *   - Motion only where it explains something — ambient drift in the
 *     background, a sweep on hover. Nothing animates on a timer near text,
 *     because movement beside words costs comprehension. All of it stands down
 *     under prefers-reduced-motion.
 *   - Proximity does the grouping. Related things sit close and unrelated
 *     things sit far apart, so the structure is legible before a word is read.
 *
 *   And trust is a design surface too: the price is on every card, the terms
 *   are in a section of their own rather than a footnote, and there is not a
 *   single countdown, fake scarcity marker, or invented statistic on the page.
 *
 * BLUEPRINTS
 *   Fully static and fully server-rendered apart from two small islands — the
 *   enquiry form and the "add" buttons that talk to it.
 */

const SERVICE_ICONS: Record<ServiceKey, typeof Radar> = {
  "ai-employees": Phone,
  "ad-growth": Radar,
  "web-seo-ads": Search,
};

/** The three shifts the catalogue is downstream of. Stated once, up front. */
const SHIFTS = [
  {
    title: "Answers replaced links",
    body: "Buyers ask an assistant and get two or three names. Ranking fourth on a page nobody opens is worth nothing — being the source that gets quoted is a different job entirely.",
  },
  {
    title: "The signal is disappearing",
    body: "The tracking most accounts still run was built on cookies and identifiers that keep being taken away. Measurement now has to sit on data the business owns.",
  },
  {
    title: "Speed became the product",
    body: "When every competitor advertises the same offer at the same price, the one that answers in seconds books the job. That used to be a staffing problem.",
  },
];

function structuredData() {
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: BRAND.name,
    description: THESIS.body,
    url: env.appUrl,
    email: BRAND.notifyEmail,
    areaServed: "United States",
    parentOrganization: { "@type": "Organization", name: BRAND.parent.name, url: BRAND.parent.url },
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Growth upgrades",
      itemListElement: UPGRADES.map((u) => ({
        "@type": "Offer",
        name: u.name,
        description: u.promise,
        price: (u.price / 100).toFixed(2),
        priceCurrency: "USD",
      })),
    },
  };
}

function UpgradeCard({ upgrade, index }: { upgrade: Upgrade; index: number }) {
  return (
    <article className="hud-panel lift flex flex-col p-6">
      <div className="flex items-start justify-between gap-3">
        <span className="hud-value text-xs text-cyan/50">
          {String(index + 1).padStart(2, "0")}
        </span>
        {upgrade.leading && <Badge variant="violet">Taken first</Badge>}
      </div>

      <h3 className="mt-3 font-heading text-xl font-bold">{upgrade.name}</h3>
      <p className="mt-2 text-sm leading-relaxed text-foreground/90">{upgrade.promise}</p>

      {/* The demand argument. This is the reason the upgrade is on the page at
          all, so it gets real space rather than a tooltip. */}
      <p className="mt-4 border-l-2 border-magenta/40 pl-4 text-[0.78rem] leading-relaxed text-muted-foreground">
        {upgrade.demandCase}
      </p>

      <ul className="mt-5 flex-1 space-y-2">
        {upgrade.delivers.map((line) => (
          <li key={line} className="flex items-start gap-2 text-[0.8rem] leading-relaxed text-foreground/80">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-cyan" />
            {line}
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3 border-t border-border/50 pt-4">
        <div>
          <div className="hud-label">{upgrade.fixes}</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="hud-value text-2xl font-bold">{formatCurrency(upgrade.price)}</span>
            <span className="text-xs text-muted-foreground">
              {upgrade.billing === "monthly" ? "/mo" : "one-time"}
            </span>
          </div>
        </div>
        <AddUpgradeButton upgradeKey={upgrade.key} name={upgrade.name} />
      </div>
    </article>
  );
}

export default function Home() {
  const from = entryPrice();

  return (
    <div className="relative">
      {/* eslint-disable-next-line react/no-danger */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()) }}
      />

      {/* ---------------------------------------------------------------- */}
      {/* Hero. One focal point: the headline. Everything else is quieter   */}
      {/* on purpose, including the nav, which is a single link home.       */}
      {/* ---------------------------------------------------------------- */}
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="container flex h-20 items-center justify-between">
          <span className="flex items-center gap-2.5 font-heading text-base font-bold sm:text-lg">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/15 shadow-hud">
              <span className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-gradient-to-br from-cyan via-violet to-magenta" />
            </span>
            {BRAND.wordmarkLead}
            <span className="text-gradient">{BRAND.wordmarkAccent}</span>
          </span>
          <a
            href={BRAND.parent.url}
            className="hidden items-center gap-1.5 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            {BRAND.parent.name} <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>
      </header>

      <section className="relative grain flex min-h-[92vh] items-center overflow-hidden py-28">
        <div className="aurora" />
        <div className="container relative text-center">
          <Badge className="mx-auto animate-pulse-glow">{THESIS.eyebrow}</Badge>

          <h1 className="mx-auto mt-8 max-w-5xl font-heading text-[2.75rem] font-bold leading-[1.02] sm:text-6xl md:text-7xl lg:text-8xl">
            The parts of <span className="text-kinetic">2027</span>
            <br className="hidden sm:block" /> nobody has staffed yet.
          </h1>

          {/* Measure held to ~62 characters. Long lines, not small type, are
              what make a hero paragraph go unread. */}
          <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            {BRAND.parent.name} runs your AI employees, your ad growth and your search. This is
            where you bolt on the specialised work that decides who wins locally next.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <a href="#upgrades">
                See the {UPGRADES.length} upgrades <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#enquiry">Talk to us</a>
            </Button>
          </div>

          <p className="mt-8 font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground">
            From {formatCurrency(from)}/mo · Month to month · Nothing charged today
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* What this is. Said second, plainly, before anything is sold —     */}
      {/* a visitor who cannot tell how this relates to PHX Growth will     */}
      {/* not read the prices.                                             */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-y border-border/60 bg-card/30 py-16">
        <div className="container">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
            <Sparkles className="h-9 w-9 shrink-0 text-magenta" />
            <div>
              <h2 className="font-heading text-xl font-bold">
                {BRAND.name} is the upgrade counter for {BRAND.parent.name}.
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Nothing here replaces your team or restarts your onboarding. Every upgrade assumes
                the service it attaches to is already running, and simply makes it do more. If
                you&apos;re not a {BRAND.parent.name} client yet,{" "}
                <a href={BRAND.parent.url} className="text-cyan hover:underline">
                  start there
                </a>{" "}
                — this only makes sense on top.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Why these, and not fifty others.                                  */}
      {/* ---------------------------------------------------------------- */}
      <section className="container py-24">
        <div className="mx-auto max-w-2xl text-center">
          <span className="section-index">The argument</span>
          <h2 className="mt-3 font-heading text-3xl font-bold md:text-5xl">
            Three things changed. Most local businesses have staffed for none of them.
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            Every upgrade on this page is downstream of one of these. If a service isn&apos;t, it
            isn&apos;t here — which is why there are {UPGRADES.length} of them and not fifty.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {SHIFTS.map((s, i) => (
            <div key={s.title} className="hud-panel hud-corners p-7">
              <span className="hud-value text-3xl font-bold text-cyan/40">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 font-heading text-lg font-bold">{s.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* The catalogue, grouped by the service each upgrade bolts onto.    */}
      {/* Grouping by parent service is what keeps this from reading as a   */}
      {/* rival menu — every heading is one of PHX Growth's own services.   */}
      {/* ---------------------------------------------------------------- */}
      <section id="upgrades" className="scroll-mt-4 py-10">
        {PARENT_SERVICES.map((service, si) => {
          const Icon = SERVICE_ICONS[service.key];
          const items = upgradesFor(service.key);
          return (
            <div key={service.key} className="container py-14">
              <hr className="rule-glow mb-10" />

              <div className="grid gap-8 lg:grid-cols-[22rem_1fr] lg:items-start">
                <div className="lg:sticky lg:top-24">
                  <span className="section-index">
                    {String(si + 1).padStart(2, "0")} — Bolts onto
                  </span>
                  <h2 className="mt-2 flex items-center gap-3 font-heading text-3xl font-bold md:text-4xl">
                    <Icon className="h-7 w-7 shrink-0 text-cyan" />
                    {service.name}
                  </h2>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    {service.role}
                  </p>
                  {/* The ceiling. Naming the limit of the service honestly is
                      what earns the right to sell the upgrade — and PHX Growth
                      sells that service, so this has to be fair to it. */}
                  <p className="mt-4 border-l-2 border-cyan/40 pl-4 text-sm leading-relaxed text-foreground/85">
                    {service.ceiling}
                  </p>
                  <p className="hud-label mt-5">
                    {items.length} upgrades · from{" "}
                    {formatCurrency(Math.min(...items.map((u) => u.price)))}
                  </p>
                </div>

                <div className="grid gap-5 xl:grid-cols-2">
                  {items.map((u, i) => (
                    <UpgradeCard key={u.key} upgrade={u} index={i} />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Terms. A section, not a footnote — on four-figure monthly work    */}
      {/* the commitment is the objection, and answering it in public is    */}
      {/* worth more than any badge.                                        */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-y border-border/60 bg-card/30 py-20">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <span className="section-index">Before you ask</span>
            <h2 className="mt-3 font-heading text-3xl font-bold md:text-4xl">
              What you&apos;re actually committing to.
            </h2>
          </div>
          <div className="mx-auto mt-12 grid max-w-4xl gap-5 sm:grid-cols-2">
            {TERMS.map((t) => (
              <div key={t.term} className="flex gap-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                <div>
                  <h3 className="font-heading text-base font-bold">{t.term}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* The one thing to do.                                              */}
      {/* ---------------------------------------------------------------- */}
      <section id="enquiry" className="container scroll-mt-8 py-24">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <span className="section-index">Start</span>
          <h2 className="mt-3 font-heading text-3xl font-bold md:text-5xl">
            Pick what you want. We&apos;ll price it in writing.
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            Tick the upgrades you&apos;re interested in and the total assembles as you go. This
            sends an enquiry to a human — no card, no automated sequence, and nothing on your
            account changes until you agree the scope.
          </p>
        </div>
        <Enquiry />
      </section>

      {/* ---------------------------------------------------------------- */}
      <footer className="border-t border-border/60 py-12">
        <div className="container space-y-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <a
              href={BRAND.parent.url}
              className="inline-flex items-center gap-2 font-heading text-lg font-bold transition-colors hover:text-cyan"
            >
              {BRAND.parent.name} <ArrowUpRight className="h-4 w-4" />
            </a>
            <p className="max-w-md text-sm text-muted-foreground">
              {BRAND.name} is the upgrade counter for {BRAND.parent.name}. The agency, the team and
              the relationship all live over there.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 border-t border-border/40 pt-6 text-sm text-muted-foreground">
            <a href="#upgrades" className="hover:text-foreground">Upgrades</a>
            <a href="#enquiry" className="hover:text-foreground">Enquire</a>
            <a href={`mailto:${BRAND.notifyEmail}`} className="hover:text-foreground">
              {BRAND.notifyEmail}
            </a>
            <Link href="/legal/terms" className="hover:text-foreground">Terms</Link>
            <Link href="/legal/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/legal/msa" className="hover:text-foreground">Services agreement</Link>
            <Link href="/login" className="hover:text-foreground">Client sign-in</Link>
          </div>

          <div className="text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} {BRAND.name}
          </div>
        </div>
      </footer>
    </div>
  );
}
