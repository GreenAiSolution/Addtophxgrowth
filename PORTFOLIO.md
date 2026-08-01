# Proof of Work — Projects for phxgrowth.com

A verified inventory of shipped projects across the GreenAiSolution GitHub
account, organized by the three service pillars: **automation**, **website
creation**, and **ad management**. Every entry below was checked against the
actual repository contents — nothing listed here is aspirational.

**How to use this on phxgrowth.com:** link the live URLs and public repos
directly; for private repos, use screenshots or screen recordings of the
running product as the evidence. Describe capability (what each system
demonstrably does) rather than inventing outcome numbers — several of these
codebases enforce that rule on themselves with tests, and the site should hold
itself to the same bar.

Live URLs verified as configured in the repos (CNAME files / deploy configs):

| Live property | Source repo |
| --- | --- |
| performancelab.fitness | `juliasperformancelab` |
| greenaidigital.com | `greenai-solutions-group` |
| greengeniusai.app | `greengeniusai` |
| greenaisolution.github.io/omniagent | `omniagent` |
| greenaisolution.github.io/omniagent-system | `omniagent-system` |
| greenaisolution.github.io/greenai-aether | `greenai-aether` |
| pixel-pilot-snowy.vercel.app | `Pixel-Pilot-` (Vercel production deployment) |

---

## Pillar 1 — Automation

### Omniagent — WhatsApp AI staff for real businesses
**Repos:** [`omniagent`](https://github.com/GreenAiSolution/omniagent) (public, marketing site) · [`choreless`](https://github.com/GreenAiSolution/choreless) (public, engine + GTM docs) · [`omniagent-system`](https://github.com/GreenAiSolution/omniagent-system) (public, flagship tier)
A production AI-agent product: agents that answer customers over WhatsApp —
text, voice notes, images, PDFs and spreadsheets — grounded in the business's
own knowledge (RAG), with conversation memory, and real actions in real tools
gated behind a typed CONFIRM for anything that moves money. Five-agent catalog
(Concierge, Support, QuickBooks Bookkeeper, Reservations, Sales Qualifier)
generated from one base n8n workflow. Includes sales one-pager and deployment
runbook. Live sandbox demo on the GitHub Pages site.
**Proof angle:** multimodal agent pipeline, human-approval gating, importable
n8n workflows anyone can inspect.

### Pixel Automation System — the AI revenue engine for local businesses
**Repo:** `Pixel-Automation-System` (private)
Five wired workflows: instant AI quote on inbound leads (webhook →
qualification → personalized quote in seconds), a 3-touch follow-up sequencer
that stops on reply, a post-win review harvester with an unhappy-customer
escape valve, a daily marketing autopilot, and a Monday plain-English owner
report. Live dashboard, Slack pings on hot leads, self-serve integrations
page, full audit ledger.
**Proof angle:** end-to-end speed-to-lead automation — the exact category of
work phxgrowth.com sells to local businesses.

### PixelPilot MoneyGun — autonomous outbound engine
**Repo:** `PixelPilotMoneyGun` (private)
A 24/7 B2B outbound system: sources and scores companies against an ideal
customer profile, disqualifies bad fits, and runs qualified leads through a
5-touch, 14-day founder-signed sequence — with deliverability guardrails and
CAN-SPAM compliance built into the send path. Zero-dependency Node; demo runs
in one command with a mission-control dashboard.
**Proof angle:** compliant, self-measuring outbound automation.

### GreenAI Agents — deployable business-agent kit
**Repo:** `greenai-agents` (private)
Client-ready deployment package for three agents: a CFO agent (daily financial
reports, overdue-invoice follow-up, cash-flow alerts via QuickBooks/Stripe), a
Sales SDR agent (lead scoring, outreach, CRM logging), and a Support agent
(ticket auto-resolution with escalation). Ships with a step-by-step client
setup guide.
**Proof angle:** productized agent deployment with a real onboarding process.

### PRIME — AI workforce platform
**Repo:** `prime-ai` (private)
A luxury immersive marketing site in front of a real autonomous agent engine:
every purchase provisions a working bot wired into 43+ apps, powered by Claude
with streaming and real tool use. Runs fully in demo mode without keys.
**Proof angle:** commerce-to-provisioning automation — a sale creates a
working agent.

### AETHER — autonomous AI employees
**Repo:** [`greenai-aether`](https://github.com/GreenAiSolution/greenai-aether) (public) · **Live:** greenaisolution.github.io/greenai-aether
Marketing site plus production agent templates (sales-SDR system prompts and
integration specs) for custom AI employees deployed in 48 hours.

### PHX Growth Plus platform — unattended operations inside a client portal
**Repo:** [`Addtophxgrowth`](https://github.com/GreenAiSolution/Addtophxgrowth) (public)
Beyond its website and ad-ops features (listed below), this platform runs a
nightly "night shift" that scores every new lead and assembles a morning call
list; a per-tenant lead-intake webhook; a system-memory layer that learns from
closed deals and recalibrates the agents; automated email/Slack notifications
across the whole request pipeline; and a human-approval gate so nothing an
automation proposes acts on its own. 260+ tests on main; a further ~650 across
the open AI-employees PR series (phone answering, estimating, booking).
**Proof angle:** automation with auditability — pure, tested decision logic
with the model kept out of the money path.

---

## Pillar 2 — Website Creation

### performancelab.fitness — Julia's Performance Lab (client site, live)
**Repo:** [`juliasperformancelab`](https://github.com/GreenAiSolution/juliasperformancelab) (public)
A live, custom-domain website for a fitness coaching business: home, about,
coach, and process pages, program imagery (12-week summer shred, 1-on-1
coaching, mommy makeover), branded logo work.
**Proof angle:** the clearest client-website credential in the account — a
real business, on its own domain, shipped.

### greenaidigital.com — GreenAI Solutions agency site (live)
**Repo:** [`greenai-solutions-group`](https://github.com/GreenAiSolution/greenai-solutions-group) (public)
Multi-page agency site on a custom domain: services, about, contact,
testimonials, content studio, dashboard and AI-automation landing pages, with
visual assets.

### greengeniusai.app — full-stack fintech product (live)
**Repo:** [`greengeniusai`](https://github.com/GreenAiSolution/greengeniusai) (public)
A complete product build, not just a brochure: Next.js website, Python/FastAPI
backend (models, routers, services), and a mobile app, plus a launch guide
covering legal, App Store and subscription rollout. The live site carries a
futuristic HUD-styled dashboard (scanlines, radar pulses, animated bot cards).

### NEXUS Studio — immersive 3D buying experience
**Repo:** [`nexus-studio`](https://github.com/GreenAiSolution/nexus-studio) (public)
Next.js 16 + React 19 + Three.js (react-three-fiber, bloom postprocessing,
Framer Motion). Customers sign in, design their AI workforce as living 3D
crystals, customize add-ons, and activate — a five-stage cinematic checkout.
**Proof angle:** high-end interactive web engineering well beyond template
sites.

### Pixel Pilot — cinematic 3D marketing platform
**Repo:** [`Pixel-Pilot-`](https://github.com/GreenAiSolution/Pixel-Pilot-) (public) · **Live:** [pixel-pilot-snowy.vercel.app](https://pixel-pilot-snowy.vercel.app) (Vercel production)
Next.js 16 / React 19 / React Three Fiber / Tailwind v4 platform with ten
service sections, live OAuth connector endpoints, a Higgsfield-powered
Creative Forge, lead capture, and n8n workflow triggers. Everything demos with
zero configuration.

### PHX Growth Plus — marketing site + client portal
**Repo:** [`Addtophxgrowth`](https://github.com/GreenAiSolution/Addtophxgrowth) (public)
Full Next.js 14 SaaS: premium landing page with interactive pricing
configurator ("build your cockpit"), six prerendered trade-vertical landing
pages, plan-system pages that double as delivery receipts, legal pages
generated from structured data, SEO (sitemap, robots, edge-rendered Open Graph
card, structured data) — plus the authenticated client portal and admin
console behind it (dashboards, billing, requests, leads, briefs, memory).

### Omniagent sites (live)
**Repos:** [`omniagent`](https://github.com/GreenAiSolution/omniagent), [`omniagent-system`](https://github.com/GreenAiSolution/omniagent-system) (public)
Two self-contained, no-build-step product sites on GitHub Pages, including a
working sandbox demo and an application flow with no form backend required.

### GreenAI Realty Tools — real-estate SaaS platform
**Repo:** `greenai-realty-tools` (private)
Next.js 14 platform with Prisma, NextAuth authentication (login/register),
Stripe billing, dashboard, and privacy/terms pages, deployed via Vercel.

---

## Pillar 3 — Ad Management

### PHX Growth — the autonomous media buyer
**Repo:** `phxgrowthfinal` (private)
The flagship: an immersive 3D platform for autonomous media buying across
Meta, Google and TikTok — Higgsfield-powered creative generation, an n8n
automation spine, client workspaces, and a produced 20-second video ad.
Every integration degrades to a believable simulation with no credentials, so
the whole product is demoable on demand.
**Proof angle:** this is the product phxgrowth.com's ad-management claim
stands on — pair screenshots with the public Pixel Pilot repo, which shares
the architecture.

### Spend Watch — ad-account monitoring engine
**Repo:** [`Addtophxgrowth`](https://github.com/GreenAiSolution/Addtophxgrowth) (public)
Seven pure-arithmetic checks over daily ad metrics: budget pacing (over and
under), cost-per-lead drift, delivery gaps, creative fatigue, cost-per-sale
breach, ROAS decline, and spend anomalies — with tested anti-noise rules,
auto-resolution of cleared findings, and tier-based sweep cadence. The landing
page's sample alerts are generated by running the real engine against a demo
account at build time, so the marketing cannot promise wording the product
doesn't produce. Plus: ad-ops dashboards (CPL/ROAS KPIs, 7/30/90-day ranges),
client-editable targets, CSV metric import, AI-written monthly reports, and a
wasted-spend calculator.
**Proof angle:** ad management as inspectable arithmetic — "an alert is a
claim about someone's money, so it has to be arithmetic we can point at."

### Pixel Pilot Workplace — the studio operating system
**Repo:** `Pixel-Pilot-Workplace` (private)
The internal cockpit the studio runs on: an Ad Studio that turns a brief into
launch-ready ad files (AI backdrops, three copy variants, composed at native
platform dimensions for IG/Story/TikTok/FB and exported as real PNGs); Boost
Bay, a Bayesian A/B decision engine (Beta-posterior Monte Carlo, credible
lift intervals, 95% ship-line) with a live Thompson-sampling budget bandit;
and a Growth War Room tracking cross-channel spend with a profit-true
autopilot decision log.
**Proof angle:** real statistics driving creative testing and budget
allocation — screenshot-ready evidence of ad-management depth.

### Daily creative operations (running now)
A scheduled "Pixel Pilot — Daily Marketing" routine produces platform-native
ad copy, visuals and staging every day at 7am Phoenix time — ongoing,
automated creative output rather than a one-off build.

---

## Suggested presentation on phxgrowth.com

1. **Lead with the live links** (performancelab.fitness, greenaidigital.com,
   greengeniusai.app, the three GitHub Pages sites) — clickable proof beats
   description.
2. **One flagship per pillar:** Omniagent for automation, NEXUS Studio or
   Pixel Pilot for website creation, PHX Growth + Spend Watch for ad
   management.
3. **Use the public repos as engineering proof** for technical buyers; use
   screenshots/recordings for the private ones.
4. **Keep claims mechanical, not statistical:** say what each system does
   (answers every call, quotes in seconds, checks spend every morning) rather
   than inventing percentages — the codebases themselves test against
   unverifiable outcome claims, and the portfolio page should match.
