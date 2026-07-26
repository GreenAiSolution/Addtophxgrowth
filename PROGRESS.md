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

## Verified this session
- `pnpm install` ✅ · `pnpm typecheck` ✅ · `pnpm lint` ✅ · `pnpm build` ✅ (24 routes).
- Not yet run against a live DB / Stripe / Anthropic (no credentials in this
  environment) — those are the 🟡 items above.

## Suggested next steps
1. Provision Neon/Vercel Postgres, set `DATABASE_URL`, `pnpm prisma:push && pnpm db:seed`.
2. Run `pnpm stripe:setup`, wire the webhook, verify checkout → gating.
3. Set `ANTHROPIC_API_KEY`, exercise a real agent run + monthly report.
4. Deploy to Vercel; run Lighthouse against the live URL.
5. Wire Resend for the notification stubs; replace testimonial placeholders
   with real client results.
