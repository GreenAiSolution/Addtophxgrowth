# Build Progress

Status legend: ✅ done · 🟡 partial (scaffolded, needs live credentials/session)

This document survives across sessions — read it first, then continue the next
unchecked item. After each phase: `pnpm typecheck && pnpm lint && pnpm build`.

---

## Phase 0 — Scaffold ✅
- Next.js 14 App Router + TypeScript + Tailwind + shadcn-style UI primitives
  (`button`, `card`, `badge`, `input`, `textarea`, `label`).
- Cockpit/HUD design tokens in `globals.css` + `tailwind.config.ts`
  (near-black base, cyan/violet/magenta, Space Grotesk / JetBrains Mono).
- Role-gated app shell with sidebar (`AppSidebar`), client + admin layouts.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` all green (24 routes).

## Phase 1 — Data + Auth ✅
- Full Prisma schema: User, Account, Session, VerificationToken, ClientProfile,
  ProductLine, Plan, Subscription, AgentDefinition, AgentPromptOverride,
  AgentConversation, AgentMessage, UsageRecord, AdAccount, AdMetricDaily,
  Request, RequestComment, WebhookConfig.
- `prisma/seed.ts`: 1 admin, 2 demo clients (Scale+Operate / Launch),
  90 days of ad metrics, a sample conversation, plans + agents from the catalog.
- Auth.js (NextAuth v5): Google OAuth + email magic link (registered only when
  SMTP is configured), roles on the session, DB session strategy.
- Multi-tenancy helpers (`tenancy.ts`), onboarding wizard → Zapier hook.

## Phase 2 — Billing 🟡
- ✅ Checkout route (`/api/checkout`), Customer Portal route (`/api/portal`),
  webhook handler (`/api/webhooks/stripe`) for the four required events,
  feature-gating (`entitlements.ts`), usage metering, `scripts/setup-stripe.ts`.
- 🟡 Needs a live Stripe test account: run `pnpm stripe:setup`, paste price IDs,
  `stripe listen`, and verify the end-to-end checkout→webhook→gating loop.

## Phase 3 — Agent Workspace 🟡
- ✅ Streaming chat UI (`agent-chat.tsx`), 5 agent definitions with distinct
  personas + robot headshots, per-client prompt overrides read at run time,
  run counting + graceful limit block with upgrade CTA, conversation
  persistence, rate limiting, Zod validation.
- 🟡 Needs `ANTHROPIC_API_KEY` + a running DB to exercise real streaming/persistence.

## Phase 4 — Ad Ops 🟡
- ✅ Dashboard with Recharts (spend / leads / revenue vs spend / conversions),
  7/30/90-day range filter, KPI tiles (CPL, ROAS). Admin manual metrics entry +
  CSV import route (`/api/admin/metrics/import`). Monthly AI narrative
  (`/api/reports/generate`, server-side Anthropic with deterministic fallback).
- 🟡 CSV upload UI widget on the admin page is a follow-up (route + manual entry done).

## Phase 5 — Requests + Admin panel ✅
- Request pipeline (Open → In Progress → Delivered) with client submit + admin
  queue status advancement, admin client list (plan, MRR, usage, last activity),
  agent prompt editor, plans view (DB + Stripe link state), metrics entry.
- Comment threads: `/app/requests/[id]` (client) + `/admin/requests/[id]`
  (admin, with status pipeline control). Shared `CommentThread` component;
  tenant-scoped lookups; notification console stubs in place (wire Resend).
- Read-only impersonation: `/admin/clients/[clientId]` shows the client's
  cockpit (subs, usage meter, 30d KPIs, recent requests + conversations) with a
  "read-only" banner; linked from the clients table ("View as →").
- CSV upload widget (`CsvImport`) on `/admin/metrics` posting to the import route
  with per-row error reporting.

## Phase 6 — Marketing site + polish ✅ (premium pass done; Lighthouse pending)
- Landing page rebuilt with premium "vibe dining" positioning: velvet-rope hero,
  ticker strip, agent roster ("The Crew"), product lines, 3-step "reservation to
  feast" section, pricing as "The Menu", stat trio + testimonial placeholders
  (marked illustrative), zero-JS FAQ (details/summary), final CTA band, lead
  form → Zapier. Landing bundle got smaller (3.5 kB page JS).
- Mobile navigation: `MobileNav` top bar + slide-over for client and admin
  shells (desktop sidebar was previously the only nav). Shared nav config in
  `src/lib/nav.ts`.
- States: HUD loader (`loading.tsx` for /app and /admin), styled 404, global
  error boundary with retry.
- 🟡 Remaining: Lighthouse audit against a deployed build; wire Resend.

---

## Phase 8 — Verticals, night shift, and system memory ✅

Three moves aimed at the same problem: the product was excellent the day you
bought it and identical a year later.

### Vertical packs (`src/lib/verticals.ts`)
- Six packs — roofing, HVAC, med spa, dental, legal, remodeling — each carrying
  a headline, three pain points, the objections that trade actually hears, and
  pre-written bodies for all three ASSET modules plus tuned PLAYBOOK prompts.
- A pack overrides *content only*. `applyVertical` is pure and never changes a
  module's key, kind or delivery, so the tier still owns what gets provisioned.
- `planProvisioning` now takes the pack; `provisionPlan` resolves it from the
  client's explicit `verticalKey`, falling back to matching their free-text
  industry.
- Static landing pages at `/verticals` and `/verticals/[key]` (6 prerendered),
  plus a trade strip on the home page at `#trades`.
- 19 tests. The load-bearing one asserts every override names a module that
  actually exists — rename a module in `systems.ts` and it fails loudly instead
  of silently dropping a pack's copy.

### The night shift (`src/lib/night-shift.ts`)
- Hourly Vercel cron → `/api/cron/night-shift`, bearer-authenticated with
  `CRON_SECRET` compared in constant time. No secret configured = every request
  refused, so the endpoint can't be found and used to spend the model budget.
- Cadence is the tier lever: Command nightly, Scale weekly, Launch none. That is
  now the concrete thing Command's unlimited runs buys.
- `isDue` turns 24 hourly ticks into one brief per client per day, at the hour
  that client chose (`briefHourUtc`, default 13:00 UTC = 6am Phoenix).
  Idempotent on `@@unique([clientId, runDate])`.
- Unattended runs go through `checkAgentRun` / `recordRun` like interactive
  ones — an overnight batch must never quietly blow through a plan limit.
  Batch capped at `MAX_LEADS_PER_RUN`.
- **The brief is assembled by a pure function, not a model.** `planBrief` turns
  scored data into the call list; the model only writes the narrative summary.
  An Anthropic outage costs the prose and never the list.
- `parseScore` degrades rather than throws: fenced JSON → bare JSON → prose
  regex → "unscored, here's the raw text". One weird reply can't lose the night.
- `/app/brief` shows the latest brief, the history, and the tenant's own intake
  URL. Non-qualifying tiers get an upgrade panel instead.
- 30 tests.

### Lead intake (`/api/intake/[clientId]`)
- The Lead Intake Webhook module promised "a live endpoint your forms post to"
  and there wasn't one. Now there is: public, per-tenant token, constant-time
  compare, CORS for browser posts, permissive schema that keeps whatever the
  form sent and normalises the common field aliases.
- Deliberately does **not** score on the request path. Rows land `NEW`; the
  night shift picks them up. A slow model call can't time out a client's form.
- Tokens are minted during provisioning, once, and shown on `/app/brief`.

### System memory (`src/lib/memory.ts`)
- Closed deals a client logs become `MemoryEntry` rows via a pure
  `computeCalibration`, injected ahead of **every** agent run.
- What it learns: close rate per score band, a warning when the ladder is
  inverted (warm closing better than hot means the rubric is wrong — the most
  useful thing it can tell an agent), the objections actually killing deals,
  lead sources that diverge from baseline, and average won-deal value.
- Nothing is stated below `MIN_EVIDENCE` (5) closed deals. Confidence rises with
  evidence and is shown to the client, not hidden. Anything they disagree with
  can be muted, and a refresh never un-mutes — a system nobody can correct is
  one nobody trusts.
- `/app/memory` shows every learned fact with its evidence count, the mute
  control, and the outcome-logging form.
- 22 tests.

### Schema
- New: `Lead`, `BriefRun`, `DealOutcome`, `MemoryEntry` + four enums.
- `ClientProfile` gains `verticalKey`, `intakeToken`, `nightShiftEnabled`,
  `briefHourUtc`.
- Seed adds demo client #3 (`demo3@phxgrowth.com`) — Command tier on the roofing
  pack with leads, 23 closed deals, derived memory, and a finished brief. The
  memory and brief are generated by the real production code paths rather than
  hand-written, so the demo can't drift from what the system would actually
  produce.

---

## Phase 9 — The ad-ops line, built to parity ✅

The agents line was a system you could see. Ad-ops was still a retainer: a
dashboard, a monthly report, and trust. This closes that gap.

### Ad-ops system blueprints
- Three blueprints added to `systems.ts` — **The Spend Watch** (monitor),
  **The Campaign Desk** (operate), **The Full-Funnel Command** (dominate) —
  so every tier on both lines is now a system with a `/plans/[key]` page that
  sells before purchase and becomes the delivery receipt after.
- Two new module kinds: `MONITOR` (a check that runs unattended) and `REPORT`
  (a recurring deliverable). Counts: Monitor 10 modules (6 instant / 4 build),
  Operate 18 (11 / 7), Dominate 26 (15 / 11).
- Ad-ops tiers now provision automatically on payment through the same
  `provisionPlan` path as the agents line — previously `blueprintFor` returned
  undefined for them and nothing was delivered.
- Assets ship pre-written: Metric Definitions Sheet, Creative Testing Framework,
  Campaign Naming Convention, Full-Funnel Map.
- Build fees added: **$1,500 / $2,500 / $4,000**, covering the account audit,
  conversion-tracking repair and baseline — the work that has to happen before
  optimisation means anything. Ladders below the agents line with a steeper
  climb, for the reason documented in `catalog.ts`.

### The Spend Watch (`src/lib/spend-watch.ts`)
- Seven checks, every one a pure function of (daily metrics, targets):
  budget pacing over and under, cost-per-lead drift, delivery gap, creative
  fatigue, cost-per-sale breach, ROAS decline, spend anomaly.
- **No model anywhere in it.** An alert is a claim about someone's money, so it
  has to be arithmetic we can point at.
- Which checks run is derived from the MONITOR modules in the tier's blueprint,
  not hardcoded — a test asserts the mapping covers every MONITOR module in
  both directions, so the sales page and the engine can't drift.
- Anti-noise rules, all tested: a missing target skips the check rather than
  guessing; `MIN_HISTORY_DAYS` before any trend; minimum lead and impression
  volume before movement counts; pacing ignored in the first days of a month;
  a delivery gap suppresses the redundant underspend alert; findings that clear
  are auto-resolved; ROAS within 10% of target is a normal fortnight, not a
  finding.
- Every trend window ends at the last **complete** day. Including today would
  compare a part-day against full ones and manufacture a decline every morning.
- Cadence is the tier lever again: Monitor sweeps weekly, Operate and Dominate
  every morning. `isSweepDue` gates on a `spendWatchLastRunAt` timestamp rather
  than inferring from alert rows — a clean sweep writes no rows and would
  otherwise look like it never ran, then run again every hour.
- The hourly cron now drives both lines; each rosters off its own product line.
- 40 tests.

### Marketing
- **Spend Watch showcase** on the landing page — the sample alerts are produced
  by running the real `analyzeAccount` against a labelled demo account at build
  time. Nobody writes that copy by hand, so the page cannot promise wording the
  product doesn't produce, and a threshold change updates it automatically.
  Running it for real immediately surfaced two defects (stray cents in alert
  copy, a ROAS alert firing on a 2% miss) that a mockup would have hidden.
- **Wasted-spend calculator** — the ad-ops counterpart to the ROI calculator.
  Sells the cost of the status quo rather than the upside, which is the stronger
  motivator for someone already spending. Every lever maps to a specific check,
  the model is conservative, and the arithmetic is disclosed on the face of it.
- Ad-ops gets its own nav entry and full-width section instead of one line in a
  product-lines grid.

### Portal
- `/app/ads` leads with the Spend Watch: open alerts with severity, the account
  they came from, and a "mark seen" action. Empty state says *"{n} checks ran
  across {n} accounts and found nothing that needs you"* — the point being that
  the quiet weeks now show work too.
- Non-qualifying tiers get an upgrade panel naming what each tier watches.

### Schema
- New `AdAlert` model + three enums; `AdAccount` gains `monthlyBudgetCents`,
  `targetCplCents`, `targetCpaCents`, `targetRoas`; `ClientProfile` gains
  `spendWatchLastRunAt`.
- Seed gives demo client #1 real targets and a degraded week of Meta data, then
  runs the actual `runSpendWatch` — so a fresh install has genuine alerts.

---

## Phase 10 — The cockpit configurator ✅

"Reserve your cockpit" used to drop a visitor straight onto a login form, which
asks someone to commit before they've decided anything. It now opens `/cockpit`.

### The page (`/cockpit`)
- Three **signature builds** first — The First Seat, The House Favourite, The
  Chef's Table — because editing something opinionated is a far easier decision
  than assembling from a blank slate. Clicking one loads it into the
  configurator, where it can be argued with.
- Four modules below: automation crew, ad operations desk, trade, pairings.
  **"None" is a first-class option on both product lines** — someone who only
  wants ad-ops shouldn't have to feel like they're buying the wrong package.
- A sticky summary rail carries the itemised build, the monthly total, the
  one-time build total and the first-invoice figure, each tweening as choices
  change. On mobile a pinned bottom bar carries the running total instead,
  since the rail would otherwise sit far below the fold.
- The selection survives a login round-trip via sessionStorage, and `/login`
  now honours a `next` param (internal paths only — `//` and schemes fall back
  to `/app`, so it can't be used as an open redirect).

### Pricing (`src/lib/cockpit.ts`)
- `priceCockpit` is pure and the single source of every number on the page. The
  total a client watches assemble is the same arithmetic the build sheet and
  invoice use; two implementations would eventually disagree and the trust cost
  of that is permanent.
- Selecting all three foundations individually **silently applies the bundle
  price** rather than charging the higher a la carte sum. A configurator that
  lets you pay more than the advertised bundle for an identical basket is a dark
  pattern, and there's a test pinning it.
- Unknown or cross-line keys are ignored rather than throwing — a hand-edited
  URL putting an ad-ops tier in the agents slot can't produce a double charge.
- 28 tests.

### `/api/cockpit`
- Zod-validated against the real catalog, records the client's trade, files the
  build sheet as a Request (upserted by title, so re-configuring updates rather
  than duplicating), fires a Zapier event, then hands the primary line to the
  existing `/api/checkout`.
- Deliberately does **not** subscribe both product lines in one Stripe session.
  Each line is its own subscription in the schema and the webhook maps one
  Stripe subscription to one line; quietly creating two from one click would be
  both a schema lie and a nasty surprise on a five-figure invoice. The second
  line and the pairings ride on the build sheet, picked up at onboarding.

### Caught in review
Screenshotting the real page found a defect worth recording: `overflow-hidden`
on the page wrapper made that element the scroll container and silently broke
`position: sticky` on the summary rail — so the running total, the entire point
of a configurator, scrolled out of view. The ambient background layer clips
itself now instead.

---

## Phase 11 — Closing the dead ends (1-3 of 7) ✅

An audit of the whole platform found seven places where something we sell or
promise stops short. Every link resolves and there are no 404s; these are all
the second kind of dead end. Three fixed here, the rest queued.

### 1. Capacity add-ons now do something
The three Capacity add-ons — Additional Agent ($500/mo), Agent Run Pack
($400/mo), Additional Ad Account ($600/mo) — were **sold and had no effect**.
`checkAgentRun` read limits straight off the Plan row and nothing in the
codebase referenced those add-on keys, so a client could pay $500/mo and hit
the identical locked agent.

- New `ClientEntitlement` model: one row per granted add-on, with quantity, the
  agent an extra-agent grant unlocks, an optional expiry and a `grantedBy`
  audit trail.
- `applyCapacity` (pure, 20 tests) folds active grants onto plan limits.
  `null` means unlimited and **stays** unlimited — adding a run pack to Command
  must never quietly turn it into a 5,000-run cap. Expired and zero-quantity
  grants are ignored; unknown add-on keys are skipped rather than thrown.
- **Every** limit read in the app now goes through the resolver — the agent
  roster, the agent workspace gate, the dashboard, billing and the admin client
  view. Previously six places read `plan.maxAgentRunsMonthly` directly, which is
  exactly how one gate ends up honouring an add-on and another ignoring it.
- Admin can grant and revoke on `/admin/clients/[clientId]`, matching the
  conversation-first flow the rest of the add-ons already use. Clients see what
  they're paying for listed under their usage meter on `/app/billing`.
- A test asserts the resolver knows every add-on in the capacity group, so a
  fourth one can't be added and silently sold as another no-op.

### 2. Ad account targets can be set
Three of the seven Spend Watch checks — pacing, cost-per-sale breach, ROAS
decline — measure against a number only the client knows, and the engine
correctly skips a check with no target rather than guessing. But **nothing in
the app could write those values**: only the seed script set them. In
production every account would have had nulls, permanently disabling three
checks, while `/app/ads` told clients targets were "set during onboarding".

- A per-account editor on `/app/ads` for monthly budget, target cost per sale
  and target ROAS. Dollars in, cents stored; clearing a field is a legitimate
  choice that switches that check back off.
- Each account shows how many of its checks are armed versus asleep, and names
  the specific check each missing target would wake up.

### 3. Leads have a home
The intake endpoint had been writing `Lead` rows since it shipped and the only
reader was the night shift — which **Launch doesn't get**. A Launch client
could point their form at the endpoint we handed them and watch leads vanish
into a table with no screen.

- `/app/leads`: filters by state with live counts, score and tier, source, age,
  a "going cold" flag past `STALE_AFTER_HOURS`, and the qualifier's reasoning
  and next action inline.
- **Manual scoring** via `scoreLeadNow`, which shares the exact code path the
  night shift uses — the per-lead prompt builder and the score-and-persist step
  were extracted rather than duplicated, so a Launch client scoring by hand and
  a Command client scoring at 3am get identical output. Metered like any other
  run.
- Marking a lead won or lost routes through `recordOutcome`, so closing a lead
  feeds system memory instead of being a dead status change.
- Nav entry, plus dashboard tiles for the brief, leads and memory — those were
  reachable only from the sidebar, so the daily-habit features were invisible
  from the page clients actually land on.

### Still open
4. Nothing notifies anyone (two Resend stubs, no email on requests, briefs or
   critical alerts). 5. Admin is blind to leads, briefs, alerts and memory.
6. `/login?plan=` is accepted and dropped. 7. — folded into 3 above.

---

## Phase 12 — Closing dead ends 4 and 5 ✅

### 4. Everything notifies now
Two `wire Resend later` stubs meant a client could file a request and the
agency was never told; the agency could reply and the client was never told;
a brief could land at 6am and nothing tapped anyone on the shoulder. A system
that only works if you remember to check it is one people stop checking.

- `src/lib/notify.ts`: `renderNotification` is pure — kind and payload in,
  subject and body out — so every template is tested without a mail server
  (11 tests). `sendNotification` handles delivery and **never throws**; every
  caller sits inside a user flow or a webhook that must not fail because SMTP
  hiccuped.
- Six notifications wired: request filed → agency; agency reply → client;
  client reply → agency; morning brief → client; critical Spend Watch finding →
  client *and* agency; cockpit configured → agency.
- Plain text on purpose. These are read on a phone at 6am, and plain text
  can't render broken.
- Every notification also mirrors to the Zapier hook, so an agency living in
  Slack gets the same signal with no SMTP configured at all. With neither
  configured it logs and reports "skipped" — the app has always had to run
  without secrets.
- Judgement calls worth recording: the brief email uses **the brief's own
  headline as the subject** (it's already written to be read at a glance;
  wrapping it in "Your brief is ready" buries the useful part), and it is
  **skipped entirely when the brief has nothing above LOW priority** — a daily
  "nothing happened" email is how people learn to filter you. Only CRITICAL
  Spend Watch findings email; warnings stay in the dashboard.
- `AGENCY_NOTIFY_EMAIL` added to `.env.example`, falling back to
  `SEED_ADMIN_EMAIL`.

### 5. Admin can see the whole platform
The three unattended systems built in phases 8-9 were invisible to admins. A
client could ring about an alert and nobody in the console could look it up,
and the failure modes were worse: a failed brief, a stalled sweep, an account
whose checks are all asleep — none of it surfaced anywhere.

- **`/admin/signals`** — the agency's morning triage. Only what is wrong,
  ordered so **silently broken outranks loudly wrong**: a stalled Spend Watch
  or a failed brief means a client is getting nothing and doesn't know it,
  whereas a critical alert has already emailed them. `rankSignals` is pure
  (20 tests) and `collectSignals` runs one query per concern rather than one
  per client.
- Signals covered: stalled sweeps, failed briefs, open critical alerts,
  unscored leads (urgent on an auto-scoring tier, an upgrade conversation on a
  manual one), qualified leads going cold, requests aging past a day, and ad
  accounts with checks asleep for want of a target.
- Healthy clients are deliberately not listed. A board showing every tenant
  with a green tick is a board nobody scans.
- **Per-client**: `/admin/clients/[clientId]` now shows the latest brief with
  its high-priority items, open alerts with the account and whether the client
  has seen them, recent leads with scores, what their system memory has
  learned with confidence and evidence counts, and how many modules are live
  versus scheduled. Read-only — this is for answering a phone call, not for
  editing someone else's data behind their back.

### Remaining
6. `/login?plan=` is accepted and dropped — the smallest one, still open.

---

## Phase 13 — No dead end at the moment of intent ✅

A visitor built a cockpit on the live site, pressed Reserve, and landed on
*"No auth providers configured yet. Set GOOGLE_CLIENT_ID or SMTP
(EMAIL_SERVER_HOST) in your .env"* — a developer's TODO shown to a prospect,
at the exact moment of purchase intent. Fixed properly rather than patched.

### The reservation path now always completes
- **`/api/reserve`** — takes contact details plus the build and gets them to a
  human. Deliberately touches **no database, no auth and no Stripe**, because
  those are exactly the three things most likely to be unconfigured on a fresh
  deploy and this is the path that has to survive that. Zod-validated,
  rate-limited by IP.
- **The configurator** no longer bounces a logged-out visitor to `/login`.
  Pressing Reserve opens an inline capture form in the summary rail, submits,
  and confirms in place: *"Reserved. Your build is with us and we'll be in
  touch today. Nothing has been charged."* It also falls back to this form if
  the authenticated checkout path fails, so a missing Stripe key degrades to a
  captured lead rather than an error.
- **`/login`** always offers a way through. With no provider configured it
  shows a "Request your cockpit" form instead of the developer message.

### Everything reaches one inbox
- `agencyAddress()` can no longer return undefined: `AGENCY_NOTIFY_EMAIL` →
  `SEED_ADMIN_EMAIL` → `BRAND.notifyEmail`. "Nobody was told" is the failure
  mode that costs a real sale, so the destination is baked in.
- Two new notification kinds, `RESERVATION` and `MARKETING_LEAD`. The
  reservation subject deliberately shouts — `NEW RESERVATION — {business}` —
  and carries the full build sheet, the monthly, the one-time and the first
  invoice.
- The marketing contact form now emails the agency as well as firing Zapier,
  so an enquiry can't be lost merely because no Zap has been built yet.
- **Resend HTTPS delivery added.** One secret (`RESEND_API_KEY`) and their
  onboarding sender works before any domain is verified — the difference
  between "email works after you paste a key" and "email works after you get
  five SMTP variables right". SMTP still works and is tried second.

### Verified by walking it
Built and served with **zero** environment variables, then submitted a real
reservation through the browser at mobile width. The flow completes, the
confirmation renders, and the log reads:

```
[notify] RESERVATION → jadengreen808@gmail.com skipped — set RESEND_API_KEY
         or EMAIL_SERVER_HOST to deliver
```

Which is the honest state: the destination is right with no config, and one
secret turns the log line into an email.

---

## Verified this session
- `pnpm install` ✅ · `pnpm typecheck` ✅ · `pnpm lint` ✅ · `pnpm build` ✅ (40 static
  pages: 6 plan systems + 6 vertical packs) · `pnpm test` ✅ (233 tests, 9 files).
- Landing page, both new plan pages and `/cockpit` rendered against a production
  server and read back — and `/cockpit` screenshotted at desktop and mobile
  widths, which is how the sticky-rail defect above was found.
- Not yet run against a live DB / Stripe / Anthropic (no credentials in this
  environment) — those are the 🟡 items above.

## Suggested next steps
1. Provision Neon/Vercel Postgres, set `DATABASE_URL`, `pnpm prisma:push && pnpm db:seed`.
2. Run `pnpm stripe:setup`, wire the webhook, verify checkout → gating.
3. Set `ANTHROPIC_API_KEY`, exercise a real agent run + monthly report.
4. Deploy to Vercel; run Lighthouse against the live URL.
5. Wire Resend for the notification stubs; replace testimonial placeholders
   with real client results.
