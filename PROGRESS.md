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

## Verified this session
- `pnpm install` ✅ · `pnpm typecheck` ✅ · `pnpm lint` ✅ · `pnpm build` ✅ (33 routes,
  6 vertical pages prerendered) · `pnpm test` ✅ (87 tests, 4 files).
- Not yet run against a live DB / Stripe / Anthropic (no credentials in this
  environment) — those are the 🟡 items above.

## Suggested next steps
1. Provision Neon/Vercel Postgres, set `DATABASE_URL`, `pnpm prisma:push && pnpm db:seed`.
2. Run `pnpm stripe:setup`, wire the webhook, verify checkout → gating.
3. Set `ANTHROPIC_API_KEY`, exercise a real agent run + monthly report.
4. Deploy to Vercel; run Lighthouse against the live URL.
5. Wire Resend for the notification stubs; replace testimonial placeholders
   with real client results.
