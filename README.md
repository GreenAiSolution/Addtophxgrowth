# Nexus Growth Platform

A production-oriented, self-serve client platform for a growth agency selling two
subscription product lines:

1. **AI Automation Agents** — clients subscribe to a crew of AI agents
   (Lead Qualifier, Ad Copy Co-Pilot, Follow-Up Sequencer, CRM Updater,
   Objection Handler) on strategic tiers.
2. **Ad Operations Management** — managed ad-ops services (spend monitoring,
   campaign management, creative rotation, reporting) on strategic tiers.

Clients sign up, choose a subscription, chat with their AI agents in real time,
view ad-performance dashboards, submit requests, and manage billing — all
self-serve. An admin console lets the agency operator manage clients, plans,
agent prompts, ad metrics, and the request queue.

Built in the **cockpit / HUD aesthetic**: near-black base, cyan / violet /
magenta accents, Space Grotesk headings, JetBrains Mono for data. Each agent
ships with a distinct, self-contained **SVG robot headshot**.

---

## Tech stack

| Concern     | Choice |
|-------------|--------|
| Framework   | Next.js 14 (App Router, TypeScript) — single Vercel deploy |
| Database    | PostgreSQL + Prisma (Vercel Postgres or Neon) |
| Auth        | Auth.js (NextAuth v5) — email magic link + Google OAuth; roles `CLIENT` / `ADMIN` |
| Billing     | Stripe subscriptions + Customer Portal + webhooks |
| AI          | Anthropic API (`claude-sonnet-4-6`) via server-side route handlers only |
| UI          | Tailwind CSS + shadcn/ui-style primitives + Recharts |
| Integrations| Zapier Catch Hook → HubSpot via outbound webhooks |

The Anthropic key is **never** exposed client-side — all model calls flow
through `/api/agents/[agentSlug]/run` and `/api/reports/generate`.

---

## Local setup

```bash
# 1. Install
pnpm install

# 2. Configure env
cp .env.example .env
#    Fill in DATABASE_URL, AUTH_SECRET (openssl rand -base64 32), and
#    at least one auth provider (GOOGLE_* or EMAIL_SERVER_*).

# 3. Create the schema + seed demo data
pnpm prisma:generate
pnpm prisma:push          # or: pnpm prisma migrate dev
pnpm db:seed

# 4. Run
pnpm dev                  # http://localhost:3000
```

### Seeded accounts

| Role   | Email                     | Plans |
|--------|---------------------------|-------|
| Admin  | `admin@nexusgrowth.app`   | — |
| Client | `demo1@nexusgrowth.app`   | Scale (agents) + Operate (ad-ops), 90 days of metrics |
| Client | `demo2@nexusgrowth.app`   | Launch (agents) |

Sign in with the **email magic link** (configure SMTP) or **Google** using
these addresses. Roles are set by the seed; new Google sign-ins default to
`CLIENT`.

---

## Stripe (test mode)

```bash
# 1. Create Products + Prices for all six plans and print the env lines
STRIPE_SECRET_KEY=sk_test_... pnpm stripe:setup
#    → paste the printed STRIPE_PRICE_* lines into .env

# 2. Sync the price IDs into the DB catalog
pnpm db:seed

# 3. Forward webhooks locally
stripe listen --forward-to localhost:3000/api/webhooks/stripe
#    → copy the printed whsec_... into STRIPE_WEBHOOK_SECRET

# 4. Trigger a test event
stripe trigger checkout.session.completed
```

The webhook handler reconciles `checkout.session.completed`,
`customer.subscription.updated`, `customer.subscription.deleted`, and
`invoice.paid`. **The DB `Subscription` row is the source of truth** for all
feature gating.

---

## Deploy to Vercel

1. Push this repo; import the `nexus-growth-platform` directory as the Vercel
   project root.
2. Add a Postgres database (Vercel Postgres or Neon) and set `DATABASE_URL`.
3. Set every variable from `.env.example` in Vercel project settings
   (Production + Preview). Set `NEXT_PUBLIC_APP_URL` to your deployed URL.
4. Add the Stripe webhook endpoint `https://<your-app>/api/webhooks/stripe`
   in the Stripe dashboard and set `STRIPE_WEBHOOK_SECRET`.
5. Add a build step to run migrations: set the Vercel build command to
   `prisma migrate deploy && next build` (or run `prisma db push` once).
6. Configure the Google OAuth redirect URI:
   `https://<your-app>/api/auth/callback/google`.

---

## Architecture notes

- **Multi-tenancy** — every client-owned row carries `clientId`; queries resolve
  the tenant through `src/lib/tenancy.ts` (`requireClient` / `requireAdmin`),
  never trusting a client-supplied id. Admins may pass an explicit `clientId`
  for view-as; clients are always locked to their own profile.
- **Entitlements / metering** — `src/lib/entitlements.ts` checks the active
  subscription, whether the agent is unlocked, and remaining runs this billing
  period before any model call, and records one `UsageRecord` per completed run.
- **Agent prompts live in the DB** (`AgentDefinition` + per-client
  `AgentPromptOverride`) — never hardcoded at call time. Edit them in
  `/admin/agents`.
- **Ad ingestion is source-tagged** (`MANUAL` / `CSV` / `API`) so a Meta/Google
  Ads sync can be added later with no schema change.
- **Validation** — Zod on every API input. Agent routes are rate-limited
  (`src/lib/rate-limit.ts`; swap for Upstash in multi-instance prod).

See [`PROGRESS.md`](./PROGRESS.md) for the phase-by-phase build log and the
current state of each phase.
