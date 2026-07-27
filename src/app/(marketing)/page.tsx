import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { BRAND } from "@/lib/brand";
import {
  PARENT_SERVICES,
  FLIGHT_PLANS,
  UPGRADES,
  upgradesFor,
  entryPrice,
  THESIS,
  FLIGHT_CHECK,
  FAIR_QUESTIONS,
  type ServiceKey,
  type Upgrade,
} from "@/lib/upgrades";
import { formatCurrency, cn } from "@/lib/utils";
import { env } from "@/lib/env";
import { Enquiry, AddUpgradeButton } from "@/components/marketing/enquiry";
import { Wordmark } from "@/components/marketing/site-chrome";

/**
 * The site. One page.
 *
 * DIRECTION
 *   PHX/GROWTH PLUS is the upgrade counter for phxgrowth.com, not a second
 *   agency. It sells nine specialised upgrades, each bolted onto one of the
 *   three services PHX/GROWTH already runs, chosen because demand for each is
 *   visibly rising into 2027.
 *
 * ALIGNMENT
 *   The layout language is lifted from the parent's pricing page rather than
 *   invented, because a client moving between the two properties should never
 *   feel a seam:
 *
 *   - Sections open with a wide-tracked coloured eyebrow on the left and a
 *     muted lower-case descriptor on the right ("à la carte — done for you").
 *   - Headlines are sentence-case with the second line in the cyan→violet→
 *     magenta gradient.
 *   - Prices read `from` · big coloured numeral · muted unit, with the colour
 *     matching the service: magenta for Premium AI Ads, violet for AI
 *     Employees, cyan for Website Creation — their own coding, mirrored.
 *   - One gradient pill per section, gold reserved for the apex item, exactly
 *     as they reserve it for Fleet Command.
 *   - The voice is aviation throughout, because theirs is.
 *
 * WHY IT IS ORGANISED THIS WAY
 *   A visitor arrives asking three questions in order: what is this, does it
 *   apply to me, and what does it cost. So the page answers them in that
 *   order — what bolts onto what, then each upgrade with the argument for it,
 *   then the guarantee and the fine print, then one place to act. Nothing is
 *   held back to force an enquiry.
 *
 * BLUEPRINTS
 *   Fully static and server-rendered apart from two small islands: the enquiry
 *   form and the "add" buttons that talk to it.
 */

/** Their own colour coding, service by service. */
const SERVICE_ACCENT: Record<ServiceKey, { text: string; dot: string; card: string }> = {
  "premium-ai-ads": { text: "text-magenta", dot: "bg-magenta", card: "" },
  "ai-employees": { text: "text-violet", dot: "bg-violet", card: "phx-card-violet" },
  "website-creation": { text: "text-cyan", dot: "bg-cyan", card: "" },
};

function SectionHead({
  label,
  note,
  tone = "text-cyan",
}: {
  label: string;
  note: string;
  tone?: string;
}) {
  return (
    <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
      <h2 className={cn("eyebrow", tone)}>{label}</h2>
      <p className="max-w-sm text-sm text-muted-foreground sm:text-right">{note}</p>
    </div>
  );
}

function Price({
  amount,
  unit,
  tone,
  prefix = "from",
}: {
  amount: number;
  unit: string;
  tone: string;
  prefix?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className="text-sm text-muted-foreground">{prefix}</span>
      <span className={cn("text-4xl font-bold tracking-tight", tone)}>
        {formatCurrency(amount)}
      </span>
      <span className="text-sm text-muted-foreground">{unit}</span>
    </div>
  );
}

function structuredData() {
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: BRAND.name,
    description: THESIS.body,
    url: env.appUrl,
    email: BRAND.notifyEmail,
    areaServed: "United States",
    parentOrganization: {
      "@type": "Organization",
      name: BRAND.parent.name,
      url: BRAND.parent.url,
      description: BRAND.parent.tagline,
    },
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Upgrades & add-ons",
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

function UpgradeCard({ upgrade }: { upgrade: Upgrade }) {
  const accent = SERVICE_ACCENT[upgrade.attachesTo];
  return (
    <article
      className={cn(
        "phx-card lift flex flex-col p-7",
        accent.card,
        upgrade.apex && "phx-card-gold",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-xl font-bold tracking-tight">{upgrade.name}</h3>
        {upgrade.apex ? (
          <span className="chip shrink-0 border-gold/40 bg-gold/10 text-gold">Apex</span>
        ) : upgrade.leading ? (
          <span className="chip shrink-0 border-violet/40 bg-violet/10 text-violet">
            Most added
          </span>
        ) : null}
      </div>

      <div className="mt-4">
        <Price
          amount={upgrade.price}
          unit={upgrade.billing === "monthly" ? "/mo" : "one-time"}
          tone={upgrade.apex ? "text-gold" : accent.text}
          prefix=""
        />
      </div>

      <p className="mt-4 text-[0.95rem] leading-relaxed text-foreground/90">{upgrade.promise}</p>

      <ul className="mt-5 space-y-2.5">
        {upgrade.delivers.map((line) => (
          <li key={line} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
            <span className={cn("mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full", accent.dot)} />
            {line}
          </li>
        ))}
      </ul>

      {/* Argument and action pinned to the bottom as one block, so the "Add"
          buttons land on the same line across a row of cards. Left to flow,
          they staggered by however long each argument happened to be — which
          reads as a layout bug rather than as varying content. */}
      <div className="mt-auto pt-6">
        <div className="rounded-xl border border-white/[0.06] bg-black/25 p-4">
          <div className="eyebrow mb-2 text-[0.6rem] text-muted-foreground">Why now</div>
          <p className="text-[0.8rem] leading-relaxed text-muted-foreground">
            {upgrade.demandCase}
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-5">
          <span className="text-xs text-muted-foreground">Fixes: {upgrade.fixes}</span>
          <AddUpgradeButton upgradeKey={upgrade.key} name={upgrade.name} />
        </div>
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

      {/* ── Header ─────────────────────────────────────────────────────── */}
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
            {/* Short label below sm — "Add upgrades" wrapped to two lines at
                390px and shunted the wordmark off its baseline. */}
            <a href="#enquiry" className="pill-primary px-4 py-2.5 text-sm sm:px-5">
              <span className="sm:hidden">Upgrades</span>
              <span className="hidden sm:inline">Add upgrades</span>
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative grain overflow-hidden py-24 md:py-32">
        <div className="aurora" />
        <div className="container relative text-center">
          <p className="eyebrow text-gold">—— {THESIS.eyebrow}</p>

          <h1 className="mx-auto mt-7 max-w-4xl text-[2.6rem] font-bold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
            Every upgrade.
            <br />
            <span className="text-gradient">One flight plan.</span>
          </h1>

          <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            {BRAND.parent.name} flies your account. This is the specialised work that bolts onto it
            — the parts of 2027 nobody has staffed yet. Nothing here replaces your crew, restarts
            your onboarding, or duplicates a single thing you already pay for.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <a href="#upgrades" className="pill-primary">
              See the {UPGRADES.length} upgrades <ArrowRight className="h-4 w-4" />
            </a>
            <a href="#enquiry" className="pill-ghost">
              Talk to your pilot
            </a>
          </div>

          <p className="mt-9 text-sm text-muted-foreground">
            From {formatCurrency(from)}/mo · Month to month · Covered by the 30-Day Flight Check
          </p>
        </div>
      </section>

      {/* ── Where they bolt on ─────────────────────────────────────────── */}
      <section className="container py-20">
        <SectionHead
          label="Where they bolt on"
          note="your existing PHX/GROWTH services — nothing here replaces them"
        />

        <div className="grid gap-5 lg:grid-cols-3">
          {PARENT_SERVICES.map((service) => {
            const accent = SERVICE_ACCENT[service.key];
            return (
              <div key={service.key} className={cn("phx-card flex flex-col p-7", accent.card)}>
                <h3 className="text-xl font-bold tracking-tight">{service.name}</h3>
                <p className={cn("mt-2 text-sm font-semibold", accent.text)}>
                  {service.priceLabel}
                  {service.feeLabel && (
                    <span className="ml-2 font-normal text-magenta">{service.feeLabel}</span>
                  )}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{service.role}</p>

                <ul className="mt-4 space-y-1.5">
                  {service.includes.map((line) => (
                    <li key={line} className="flex items-start gap-2 text-[0.8rem] text-muted-foreground">
                      <Check className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", accent.text)} />
                      {line}
                    </li>
                  ))}
                </ul>

                {/* The ceiling. Naming the limit of a service PHX/GROWTH sells
                    is what earns the right to sell the upgrade — so it has to
                    be fair to the service, not a swipe at it. */}
                <p className="mt-5 flex-1 border-t border-white/[0.07] pt-4 text-[0.82rem] leading-relaxed text-foreground/75">
                  <span className="eyebrow mb-1.5 block text-[0.58rem] text-muted-foreground">
                    Where it stops
                  </span>
                  {service.ceiling}
                </p>

                <p className="mt-4 text-xs text-muted-foreground">
                  {upgradesFor(service.key).length} upgrades bolt on here
                </p>
              </div>
            );
          })}
        </div>

        {/* Their managed tiers, so a visitor already flying one can see that
            upgrades sit alongside rather than replacing. */}
        <div className="phx-card mt-5 p-7">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <span className="eyebrow text-gold">Managed flight plans</span>
            <span className="text-sm text-muted-foreground">
              already flying with us? upgrades bolt onto these too
            </span>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {FLIGHT_PLANS.map((plan) => (
              <div key={plan.key} className="border-l border-white/10 pl-4">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{plan.name}</span>
                  {plan.badge && (
                    <span
                      className={cn(
                        "chip",
                        plan.badge === "Apex"
                          ? "border-gold/40 bg-gold/10 text-gold"
                          : "border-violet/40 bg-violet/10 text-violet",
                      )}
                    >
                      {plan.badge}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">{plan.promise}</div>
                <div className="mt-2 text-sm">
                  <span className="font-semibold">{plan.price}</span>{" "}
                  <span className="text-magenta">{plan.fee}</span>
                </div>
                <div className="text-xs text-muted-foreground">{plan.ceilingNote}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── The upgrades ───────────────────────────────────────────────── */}
      <section id="upgrades" className="scroll-mt-20">
        {PARENT_SERVICES.map((service) => {
          const accent = SERVICE_ACCENT[service.key];
          const items = upgradesFor(service.key);
          return (
            <div key={service.key} className="container py-12">
              <SectionHead
                label={`On ${service.name}`}
                note={`${items.length} upgrades · from ${formatCurrency(
                  Math.min(...items.map((u) => u.price)),
                )}`}
                tone={accent.text}
              />
              <div className="grid gap-5 lg:grid-cols-3">
                {items.map((u) => (
                  <UpgradeCard key={u.key} upgrade={u} />
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {/* ── The guarantee ──────────────────────────────────────────────── */}
      <section className="container py-16">
        <div className="phx-card mx-auto max-w-3xl border-signal/25 p-9 text-center">
          <p className="eyebrow text-signal">{FLIGHT_CHECK.label}</p>
          <p className="mx-auto mt-4 max-w-2xl text-[1.05rem] leading-relaxed text-foreground/90">
            {FLIGHT_CHECK.body}
          </p>
        </div>
      </section>

      {/* ── Fair questions ─────────────────────────────────────────────── */}
      <section className="container py-16">
        <SectionHead label="Fair questions" note="— the fine print, in plain English" />
        <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-2">
          {FAIR_QUESTIONS.map((f) => (
            <div key={f.q} className="phx-card p-6">
              <h3 className="text-base font-bold tracking-tight">{f.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Enquiry ────────────────────────────────────────────────────── */}
      <section id="enquiry" className="container scroll-mt-20 py-20">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="eyebrow text-cyan">Pre-flight</p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight md:text-5xl">
            Pick what you want.
            <br />
            <span className="text-gradient">We&apos;ll price it in writing.</span>
          </h2>
          <p className="mt-6 text-[0.95rem] leading-relaxed text-muted-foreground">
            Tick the upgrades you&apos;re interested in and the total assembles as you go. This
            sends an enquiry to a human — no card, no automated sequence, and nothing on your
            account changes until you agree the scope.
          </p>
        </div>
        <Enquiry />
      </section>

      {/* ── Close ──────────────────────────────────────────────────────── */}
      <section className="container py-24 text-center">
        <h2 className="mx-auto max-w-3xl text-[2.2rem] font-bold leading-[1.08] tracking-tight md:text-6xl">
          Stop guessing what&apos;s next.
          <br />
          <span className="text-gradient">Start flying it.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Your competitors are still writing ads. Bolt on the work that decides who wins locally
          before they notice it exists.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <a href="#enquiry" className="pill-primary">
            Add upgrades <ArrowRight className="h-4 w-4" />
          </a>
          <a href={BRAND.parent.url} className="pill-ghost">
            See {BRAND.parent.name} pricing
          </a>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] py-14">
        <div className="container grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <a href={BRAND.parent.url} className="text-xl font-bold tracking-[0.12em] text-cyan">
              {BRAND.parent.name}
            </a>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {BRAND.parent.tagline}
            </p>
            <a
              href={`mailto:${BRAND.parent.email}`}
              className="mt-3 inline-block text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {BRAND.parent.email}
            </a>
          </div>

          <div>
            <p className="eyebrow text-muted-foreground">Upgrade</p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              {PARENT_SERVICES.map((s) => (
                <li key={s.key}>
                  <a href="#upgrades" className="transition-colors hover:text-foreground">
                    On {s.name}
                  </a>
                </li>
              ))}
              <li>
                <a href="#enquiry" className="transition-colors hover:text-foreground">
                  Enquire
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="eyebrow text-muted-foreground">Fly</p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>
                <a href={BRAND.parent.url} className="transition-colors hover:text-foreground">
                  {BRAND.parent.name} pricing
                </a>
              </li>
              <li>
                <Link href="/login" className="transition-colors hover:text-foreground">
                  Client sign-in
                </Link>
              </li>
              <li>
                <Link href="/legal/terms" className="transition-colors hover:text-foreground">
                  Terms
                </Link>
              </li>
              <li>
                <Link href="/legal/privacy" className="transition-colors hover:text-foreground">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/legal/msa" className="transition-colors hover:text-foreground">
                  Services agreement
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="container mt-10 border-t border-white/[0.06] pt-6 text-sm text-muted-foreground">
          © {new Date().getFullYear()} {BRAND.name} · an upgrade counter for{" "}
          <a href={BRAND.parent.url} className="text-cyan hover:underline">
            {BRAND.parent.name}
          </a>
        </div>
      </footer>
    </div>
  );
}
