import Link from "next/link";
import {
  ArrowRight,
  Radio,
  Gauge,
  ShieldCheck,
  Sparkles,
  CalendarCheck,
  SlidersHorizontal,
  Rocket,
} from "lucide-react";
import { AGENTS } from "@/lib/agents";
import { BRAND } from "@/lib/brand";
import { PRODUCT_LINES, PLANS } from "@/lib/catalog";
import { env } from "@/lib/env";
import { RobotAvatar } from "@/components/robot-avatar";
import { Pricing } from "@/components/marketing/pricing";
import { LeadForm } from "@/components/marketing/lead-form";
import { AgentDemo } from "@/components/marketing/agent-demo";
import { RoiCalculator } from "@/components/marketing/roi-calculator";
import { Addons } from "@/components/marketing/addons";
import { VerticalStrip } from "@/components/marketing/verticals";
import { WasteCalculator } from "@/components/marketing/waste-calculator";
import { SpendWatchShowcase } from "@/components/marketing/spend-watch-showcase";
import { CreativeEngine } from "@/components/marketing/creative-engine";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * Marketing landing — "vibe dining" for growth. The energy of the hottest
 * table in town, run with cockpit discipline. Fully static, no client bloat
 * beyond the pricing + lead-form islands.
 */
/**
 * Structured data. Tells Google this is a real business with a service catalogue
 * and a price range, which is what earns the richer result for searches like
 * "roofing marketing agency phoenix". Derived from the catalog so it can't
 * quote a price we no longer charge.
 */
function structuredData() {
  const agentPlans = PLANS.filter((p) => p.line === "AI_AGENTS");
  const cheapest = Math.min(...PLANS.map((p) => p.priceMonthly));
  const dearest = Math.max(...PLANS.map((p) => p.priceMonthly));

  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: BRAND.name,
    description: BRAND.tagline,
    url: env.appUrl,
    email: BRAND.notifyEmail,
    areaServed: "United States",
    priceRange: `$${Math.round(cheapest / 100)}–$${Math.round(dearest / 100)} per month`,
    serviceType: [PRODUCT_LINES.AI_AGENTS.name, PRODUCT_LINES.AD_OPS.name],
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Growth systems",
      itemListElement: agentPlans.map((p) => ({
        "@type": "Offer",
        name: p.name,
        description: p.tagline,
        price: (p.priceMonthly / 100).toFixed(2),
        priceCurrency: "USD",
        url: `${env.appUrl}/plans/${p.key}`,
      })),
    },
  };
}

export default function MarketingHome() {
  return (
    <div className="relative">
      {/* eslint-disable-next-line react/no-danger */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()) }}
      />
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 whitespace-nowrap font-heading text-base font-bold sm:text-lg"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/15 text-cyan shadow-hud">
              ◈
            </span>
            {BRAND.wordmarkLead}<span className="text-gradient">{BRAND.wordmarkAccent}</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#creative" className="hover:text-foreground">Creative</a>
            <a href="#agents" className="hover:text-foreground">The Crew</a>
            <a href="#trades" className="hover:text-foreground">Your Trade</a>
            <a href="#adops" className="hover:text-foreground">Ad Ops</a>
            <a href="#pricing" className="hover:text-foreground">The Menu</a>
            <a href="#pairings" className="hover:text-foreground">Pairings</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/cockpit" className="whitespace-nowrap">
                <span className="sm:hidden">Reserve</span>
                <span className="hidden sm:inline">Reserve your cockpit</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container relative py-24 text-center md:py-32">
        <div className="mx-auto max-w-3xl">
          <Badge className="mx-auto animate-pulse-glow">
            The deluxe tier of {BRAND.parent.name}
          </Badge>
          <h1 className="mt-6 font-heading text-5xl font-bold leading-[1.02] md:text-7xl">
            Where the <span className="text-gradient">creative</span> never runs out.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            A creative studio that writes, tests and refreshes on a loop. Five specialist AI agents
            working your inbound around the clock. A human desk on your ad spend. This is the
            upgrade {BRAND.parent.name} clients step up into — and it is open to everyone.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/cockpit">
                Reserve your cockpit <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#pricing">See the menu</a>
            </Button>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            <span className="flex items-center gap-2"><Radio className="h-3.5 w-3.5 text-cyan" /> Real-time agent runs</span>
            <span className="flex items-center gap-2"><Gauge className="h-3.5 w-3.5 text-violet" /> Live ROAS dashboards</span>
            <span className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-magenta" /> Managed ad-ops</span>
          </div>
        </div>
      </section>

      {/* Ticker strip */}
      <div className="border-y border-border/60 bg-card/40 py-3">
        <div className="container flex flex-wrap items-center justify-center gap-x-10 gap-y-2 font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground">
          <span>Three angles on every offer</span>
          <span className="text-cyan">◆</span>
          <span>Fatigue caught before CPL moves</span>
          <span className="text-violet">◆</span>
          <span>Leads qualified in seconds</span>
          <span className="text-magenta">◆</span>
          <span>Spend watched daily</span>
        </div>
      </div>

      {/* What this is, relative to the house. Said once, early, plainly — a
          visitor should never wonder whether they've found a second agency. */}
      <section className="container py-14">
        <div className="hud-panel hud-corners mx-auto flex max-w-3xl flex-col items-center gap-5 p-7 text-center sm:flex-row sm:text-left">
          <Sparkles className="h-8 w-8 shrink-0 text-magenta" />
          <div className="flex-1">
            <h2 className="font-heading text-lg font-bold">
              {BRAND.name} is {BRAND.parent.relationship}.
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {BRAND.parent.name} runs the campaigns. This is the tier where the creative becomes a
              system, the agents work your inbound around the clock, and the desk watches every
              dollar unattended. You do not need to be a {BRAND.parent.name} client to start here —
              but if you are, everything below plugs straight into what you already have.
            </p>
            <a
              href={BRAND.parent.url}
              className="mt-3 inline-flex items-center gap-1.5 font-mono text-[0.68rem] uppercase tracking-widest text-cyan hover:underline"
            >
              Visit {BRAND.parent.name} <ArrowRight className="h-3 w-3" />
            </a>
          </div>
        </div>
      </section>

      {/* Interactive test-drive */}
      <section id="demo" className="container py-20">
        <div className="mb-10 text-center">
          <Badge>No signup required</Badge>
          <h2 className="mt-3 font-heading text-3xl font-bold md:text-4xl">
            Take an agent for a spin. Right now.
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Pick a specialist and watch it work a real scenario. In your cockpit they run live —
            on your leads, your offers, your brand voice.
          </p>
        </div>
        <AgentDemo />
      </section>

      {/* The creative engine — the pillar this tier is built on. */}
      <section id="creative" className="container py-20">
        <div className="mb-10 text-center">
          <Badge variant="magenta">The Creative Engine</Badge>
          <h2 className="mt-3 font-heading text-3xl font-bold md:text-4xl">
            Anyone can buy the media. The ad is the whole game.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
            Five stages that hand off to each other and then start over, so there is always a
            fresh ad ready before the current one dies.
          </p>
        </div>
        <CreativeEngine />
      </section>

      {/* Agent roster */}
      <section id="agents" className="container py-20">
        <div className="mb-12 text-center">
          <Badge variant="magenta">The Crew</Badge>
          <h2 className="mt-3 font-heading text-3xl font-bold md:text-4xl">
            Five specialists. Zero excuses.
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Each agent is a distinct character with its own persona, tools, and system prompt —
            tuned to your saved brand voice.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {AGENTS.map((agent) => (
            <div key={agent.slug} className="hud-panel hud-corners group flex flex-col items-center p-6 text-center transition-transform hover:-translate-y-1">
              <div className="relative h-28 w-28">
                <RobotAvatar variant={agent.avatar} accent={agent.accent} />
              </div>
              <span className="mt-3 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
                {agent.persona}
              </span>
              <h3 className="mt-1 font-heading text-base font-semibold">{agent.name}</h3>
              <p className="mt-2 text-xs text-muted-foreground">{agent.tagline}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Product lines */}
      <section id="lines" className="container py-20">
        <div className="mb-12 text-center">
          <Badge>Two ways to sit down</Badge>
          <h2 className="mt-3 font-heading text-3xl font-bold md:text-4xl">Pick a line. Or take both.</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="hud-panel hud-corners p-8">
            <Sparkles className="h-8 w-8 text-cyan" />
            <h3 className="mt-4 font-heading text-2xl font-bold">{PRODUCT_LINES.AI_AGENTS.name}</h3>
            <p className="mt-2 text-muted-foreground">{PRODUCT_LINES.AI_AGENTS.blurb}</p>
            <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
              <li>› Chat with each agent in real time — streamed, persisted</li>
              <li>› Custom instructions + saved brand voice</li>
              <li>› Usage metering with graceful limits</li>
            </ul>
          </div>
          <div className="hud-panel hud-corners p-8">
            <Gauge className="h-8 w-8 text-violet" />
            <h3 className="mt-4 font-heading text-2xl font-bold">{PRODUCT_LINES.AD_OPS.name}</h3>
            <p className="mt-2 text-muted-foreground">{PRODUCT_LINES.AD_OPS.blurb}</p>
            <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
              <li>› Spend, CPL, and ROAS dashboards — live, filterable</li>
              <li>› Creative rotation + campaign management by humans</li>
              <li>› Monthly AI-written executive reports</li>
            </ul>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="container py-20">
        <div className="mb-12 text-center">
          <Badge variant="violet">The experience</Badge>
          <h2 className="mt-3 font-heading text-3xl font-bold md:text-4xl">From reservation to feast</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: CalendarCheck,
              step: "01 — Reserve",
              title: "Choose your seats",
              body: "Pick a tier on either line — or both. Checkout takes two minutes; your cockpit is live immediately.",
            },
            {
              icon: SlidersHorizontal,
              step: "02 — Calibrate",
              title: "We learn your voice",
              body: "A five-minute onboarding captures your business, platforms, goals, and brand voice. Every agent writes like you from day one.",
            },
            {
              icon: Rocket,
              step: "03 — Feast",
              title: "Growth, served",
              body: "Agents qualify, write, follow up, and file to CRM while the ad-ops crew runs your spend. You watch the dashboards climb.",
            },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.step} className="hud-panel p-7">
                <Icon className="h-7 w-7 text-cyan" />
                <div className="hud-label mt-4">{s.step}</div>
                <h3 className="mt-1 font-heading text-xl font-bold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Industry packs */}
      <section id="trades" className="container py-20">
        <div className="mb-10 text-center">
          <Badge>Built for your trade</Badge>
          <h2 className="mt-3 font-heading text-3xl font-bold md:text-4xl">
            It arrives already speaking your language
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Same desk, same price — but the qualification bar, the escalation rules and the
            one-click jobs land pre-written for your industry. Then you edit them until
            they&apos;re exactly yours.
          </p>
        </div>
        <VerticalStrip />
      </section>

      {/* Ad operations — the Spend Watch */}
      <section id="adops" className="container py-20">
        <div className="mb-10 text-center">
          <Badge variant="violet">Product Line 02</Badge>
          <h2 className="mt-3 font-heading text-3xl font-bold md:text-4xl">
            Most agencies show you the work once a month
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
            That&apos;s the whole problem with managed ad-ops. On the weeks nothing goes wrong you
            can&apos;t see what you&apos;re paying for, and on the weeks something does, you find
            out far too late to fix it cheaply. The Spend Watch runs every check on your accounts
            unattended and posts what it found — including &ldquo;nothing, you&apos;re fine.&rdquo;
          </p>
        </div>
        <SpendWatchShowcase />
      </section>

      {/* What the status quo costs */}
      <section id="waste" className="container py-20">
        <div className="mb-10 text-center">
          <Badge variant="magenta">The uncomfortable math</Badge>
          <h2 className="mt-3 font-heading text-3xl font-bold md:text-4xl">
            What an unwatched account costs you
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Drag your real numbers in. Every line is something we check for you.
          </p>
        </div>
        <WasteCalculator />
      </section>

      {/* ROI calculator */}
      <section id="roi" className="container py-20">
        <div className="mb-10 text-center">
          <Badge variant="magenta">Do the math</Badge>
          <h2 className="mt-3 font-heading text-3xl font-bold md:text-4xl">
            See what a tuned funnel is worth
          </h2>
        </div>
        <RoiCalculator />
      </section>

      {/* Pricing */}
      <section id="pricing" className="container py-20">
        <div className="mb-12 text-center">
          <Badge variant="violet">The Menu</Badge>
          <h2 className="mt-3 font-heading text-3xl font-bold md:text-4xl">Memberships, not retainers.</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            One subscription per line. Upgrade, downgrade, or cancel anytime from the console —
            no lock-in, no awkward phone call.
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
            Agent plans include a <span className="text-secondary">one-time build</span>: we wire
            the agents into your CRM and ad accounts, train them on your brand voice, tune every
            prompt against your real leads, and run a supervised pilot before you go live. Billed
            once, on your first invoice — never again when you change tiers.
          </p>
        </div>
        <Pricing />

        <div className="mx-auto mt-12 max-w-3xl">
          <div className="hud-panel hud-corners flex flex-col items-center gap-4 p-7 text-center sm:flex-row sm:text-left">
            <SlidersHorizontal className="h-8 w-8 shrink-0 text-cyan" />
            <div className="flex-1">
              <h3 className="font-heading text-lg font-bold">
                None of these is quite your shape?
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Build your own cockpit instead — pick a crew, an ad desk, your trade and any
                pairings, and watch the price add up as you go. Take either line on its own if
                that&apos;s all you need.
              </p>
            </div>
            <Button asChild size="lg" className="shrink-0">
              <Link href="/cockpit">
                Build your cockpit <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* À la carte add-ons */}
      <section id="pairings" className="container py-20">
        <div className="mb-12 text-center">
          <Badge variant="violet">À la carte</Badge>
          <h2 className="mt-3 font-heading text-3xl font-bold md:text-4xl">Pairings</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            What our fastest-growing clients add alongside a membership. Take one, take none —
            the plan works either way.
          </p>
        </div>
        <Addons />
      </section>

      {/* Social proof */}
      <section className="container py-16">
        <div className="hud-panel grid gap-6 p-8 text-center sm:grid-cols-3">
          {[
            { k: "3.8×", v: "Avg. ROAS lift" },
            { k: "−34%", v: "Cost per lead" },
            { k: "12k+", v: "Agent runs / week" },
          ].map((s) => (
            <div key={s.v}>
              <div className="hud-value text-4xl font-bold text-gradient">{s.k}</div>
              <div className="hud-label mt-2">{s.v}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {[
            {
              quote:
                "It feels like having a full growth team on staff — except the lead scoring happens before I finish my coffee.",
              who: "Founder, DTC skincare brand",
            },
            {
              quote:
                "The ad-ops crew rotates creative before fatigue hits. Our CPL chart just… stopped spiking.",
              who: "CMO, home-services franchise",
            },
            {
              quote:
                "I paste call notes, hit send, and my CRM is clean. That alone pays for the membership.",
              who: "Head of Sales, B2B SaaS",
            },
          ].map((t) => (
            <figure key={t.who} className="hud-panel flex flex-col p-6">
              <blockquote className="flex-1 text-sm leading-relaxed text-foreground/90">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-4 border-t border-border/60 pt-3 font-mono text-xs text-muted-foreground">
                {t.who}
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-3 text-center font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground/60">
          Illustrative testimonials — replace with client results
        </p>
      </section>

      {/* FAQ */}
      <section id="faq" className="container py-20">
        <div className="mb-10 text-center">
          <Badge>FAQ</Badge>
          <h2 className="mt-3 font-heading text-3xl font-bold">Before you&apos;re seated</h2>
        </div>
        <div className="mx-auto max-w-2xl space-y-3">
          {[
            {
              q: "Can I hold subscriptions on both product lines?",
              a: "Yes — one subscription per line, simultaneously. Many clients run Scale (agents) alongside Operate (ad-ops). Each line is billed and managed independently from your console.",
            },
            {
              q: "What is the one-time build fee, and why is there one?",
              a: "An agent that hasn't been trained on your business is a demo, not an asset. The build is where we earn the monthly: we connect your CRM and ad accounts, load your brand voice, write and tune each agent's prompts against your actual leads and offers, then run a supervised pilot until the output is something you'd send without editing. It's $2,500 on Launch, $3,000 on Scale, and $3,500 on Command — billed once on your first invoice, alongside month one. Change tiers later and you are never charged it again.",
            },
            {
              q: "What counts as an agent run?",
              a: "One completed agent response. Your tier includes a monthly allowance (500 / 2,500 / 10,000); the usage meter in your workspace shows exactly where you stand, and we block gracefully at the limit with an upgrade path — never a surprise invoice.",
            },
            {
              q: "Do the agents write in my brand voice?",
              a: "Yes. Onboarding captures your voice and tone, and every agent honors it on every run. Scale and Command tiers add custom per-agent instructions.",
            },
            {
              q: "Who actually manages the ad spend?",
              a: "Humans. The AI agents handle the words and the data hygiene; a dedicated ad-ops crew handles campaign management, creative rotation, and strategy on the Operate and Dominate tiers.",
            },
            {
              q: "Can I cancel or switch tiers?",
              a: "Anytime, self-serve, from Billing — powered by the Stripe customer portal. Changes prorate automatically.",
            },
          ].map((f) => (
            <details key={f.q} className="hud-panel group p-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-heading font-semibold">
                {f.q}
                <span className="text-cyan transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA band */}
      <section className="container pb-20">
        <div className="hud-panel hud-corners relative overflow-hidden p-10 text-center md:p-16">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-cyan/10 via-violet/10 to-magenta/10" />
          <h2 className="relative font-heading text-3xl font-bold md:text-5xl">
            Your table is <span className="text-gradient">waiting</span>.
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-muted-foreground">
            The roster is limited on purpose — every client gets the full attention of the crew.
          </p>
          <div className="relative mt-7">
            <Button asChild size="lg">
              <Link href="/cockpit">
                Claim your seat <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Lead capture */}
      <section id="contact" className="container pb-20">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <Badge>Talk to us</Badge>
            <h2 className="mt-3 font-heading text-3xl font-bold">
              Prefer to be walked in?
            </h2>
            <p className="mt-3 text-muted-foreground">
              Tell us about your funnel and we&apos;ll map the exact agents and ad-ops tier to hit
              your targets. Submissions flow straight into our CRM.
            </p>
          </div>
          <LeadForm />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 py-10">
        <div className="container space-y-5">
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link href="/cockpit" className="hover:text-foreground">Build a cockpit</Link>
            <Link href="/verticals" className="hover:text-foreground">Your trade</Link>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <Link href="/legal/terms" className="hover:text-foreground">Terms</Link>
            <Link href="/legal/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/legal/msa" className="hover:text-foreground">Services agreement</Link>
            <a href={BRAND.parent.url} className="hover:text-foreground">{BRAND.parent.name}</a>
          </div>
          <div className="flex flex-col items-center justify-between gap-4 border-t border-border/40 pt-5 text-sm text-muted-foreground sm:flex-row">
            <span>© {new Date().getFullYear()} {BRAND.name}</span>
            <span className="font-mono text-xs uppercase tracking-widest">Cockpit online · systems nominal</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
