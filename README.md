# PHX/GROWTH PLUS

The upgrade counter for [PHX/GROWTH](https://phxgrowth.com).

**The public site is one page.** PHX/GROWTH — "the autonomous media buyer that
flies your ad spend to profit" — sells three à la carte services (Premium AI
Ads, AI Employees, Website Creation) and three managed flight plans on top of
them (Pilot, Squadron, Fleet Command), flown by a roster of ten named
operators. This property is the branch site: it sells five specialised
upgrades that bolt onto those services, chosen because demand for each is
visibly rising into 2027, **and three deluxe stacks that the main site does not
carry** — including the largest ticket either property sells.

`src/lib/upgrades.ts` is the entire public catalogue, and it carries a copy of
everything PHX/GROWTH publicly promises: the three services' bullet lists, the
ten named operators, the twelve-item Manifest, the AOV/LTV revenue levers, the
four automation loops and the flagship engagement. `upgrades.test.ts` checks
every upgrade against all of it, on distinctive-word overlap:

1. **Attached** — every upgrade names a real PHX/GROWTH service.
2. **Additive vs the service** — nothing a service already lists.
3. **Additive vs the roster** — nothing one of the ten operators already does.
4. **Additive vs the Manifest, levers, loops and flagship** — nothing the ad
   desk or the automation spine already manages, and no upgrade may borrow a
   word from the flagship's own engagement list.

Those rules have removed seven upgrades so far, and every one looked obviously
additive until the parent's own words were sitting in the same file. Herald
already ships pages and watches the map pack; Echo already runs reviews; Closer
already works email, SMS and DM; the Manifest already covers server-side
tracking, offer and price testing, and the landing page. The floor for
"upgrades per service" has been lowered twice rather than padded — Premium AI
Ads now holds exactly one, because the desk states plainly that it doesn't make
your ads, and that is the only gap left on that service.

The check is verified non-vacuous by re-adding a cut upgrade and confirming it
fails. That found a real hole: a Manifest-only check let an offer lab through,
because item 07 is terse while the detail that kills it lives in the AOV lever.
A partial copy of the parent's scope is worse than none, because it reads as a
check that passed.

**No outcome claims, anywhere.** PHX/GROWTH's results page labels every figure
"representative" and states plainly that the case studies aren't up yet. An
upgrade counter quoting hard numbers next to that page would be the less honest
of the two properties, so this one says so in a section of its own and offers a
founding rate instead. A test scans every piece of page copy and rejects any
percentage that isn't one of the parent's real 8/6/4% fee rates, plus any
multiple or guaranteed-results phrasing.

Design, typography and voice are taken from phxgrowth.com rather than invented:
the `PHX/GROWTH` wordmark with a gold PLUS chip, Inter, the cyan → violet →
magenta gradient with gold reserved for apex and green for the guarantee, the
wide-tracked section eyebrow, the homepage's bordered hero pill with its live
dot, the dot-separated credential strip, gradient pill buttons, per-service
price colours, and the aviation vocabulary throughout. The 30-Day Flight Check
is quoted from their page rather than replaced with a different promise.

Behind the page the client platform is unchanged and still runs: sign-in, the
agent workspace, ad dashboards, the Spend Watch, the morning brief, requests,
reports and Stripe billing, plus an admin console. Those surfaces are for
existing clients and are not part of the pitch.

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
| Admin  | `admin@phxgrowth.com`   | — |
| Client | `demo1@phxgrowth.com`   | Scale (agents) + Operate (ad-ops), 90 days of metrics |
| Client | `demo2@phxgrowth.com`   | Launch (agents) |
| Client | `demo3@phxgrowth.com`   | Command (agents) + roofing pack, seeded leads, closed deals, and a finished morning brief |

Demo client #1 also carries per-account budgets and targets plus a degraded
week of Meta data, so a fresh seed produces real Spend Watch alerts on
`/app/ads` — generated by `runSpendWatch`, not written by hand.

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

1. Push this repo; import this repository as the Vercel
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

`NEXT_PUBLIC_APP_URL` is no longer load-bearing for identity: `env.siteUrl`
falls back to Vercel's own `VERCEL_PROJECT_PRODUCTION_URL`, so a deploy
self-identifies correctly with no dashboard step. Set it anyway if the site
sits behind a domain Vercel doesn't know about. `/api/health` reports which
source answered.

---

## Two price lists, one wall between them

Worth knowing before you touch anything commercial: this repository contains
two catalogues, and only one of them is the business.

| | What it is | Prices | Who sees it |
|---|---|---|---|
| `src/lib/upgrades.ts` | **The business.** Five upgrades and three bundles bolting onto the parent's services. | $1,600–$9,900/mo | Everyone. The page, the emails, the contract, `/api/catalogue`. |
| `src/lib/catalog.ts` | **Legacy console.** Six plans on two product lines that no longer exist. | $1,297–$7,997/mo | Signed-in users only. |

The console's plan keys are woven through the entitlement, capacity,
spend-watch and night-shift engines, so retiring it is a migration rather than
a rename — it is deliberately left alone rather than half-changed.

What is not optional is the wall. `src/lib/legal.ts` imported `catalog.ts`, and
that one import is how the Terms and MSA — linked from the footer of a page
selling upgrades — came to describe "two lines of service: AI Automation Agents
and Ad Operations Management" and quote six monthly fees this business does not
charge. A prospect who clicked "Terms" was reading a contract for a different
company, and the Terms contradicted the page's own FAQ about who invoices them.

`consistency.test.ts` now fails the build if any public surface imports
`catalog.ts`, and asserts that every price quoted in the legal set is a price
the page actually offers.

---

## Architecture notes

- **The public catalogue** (`src/lib/upgrades.ts`) — the three PHX/GROWTH
  services, their three managed flight plans, and the upgrades that bolt onto
  each, with the demand argument for every one. `upgrades.test.ts` enforces
  attached and additive (above) plus the rules that keep the page honest: each
  service keeps at least one upgrade, each group is listed
  most-expensive-first, every upgrade costs less than the service it upgrades,
  gold is spent exactly once, the stated performance fees match the parent's
  real 8/6/4%, and **no copy anywhere quotes a percentage or an "N× better"
  claim** — the pitch of the page is that it tells the truth about what it
  sells, and a fabricated statistic is the easiest thing in the world to add
  later without thinking.
- **The conversion path tells the truth** — `/api/reserve` returns
  `delivered: true|false`, not a bare `ok`. It used to always report success,
  which meant that when the production Vercel project stored the Resend key as
  `resend` (the code read `RESEND_API_KEY`) every visitor saw "cleared for
  pre-flight" while the lead went into a log line. `env.ts` now accepts the
  mis-named aliases so the live deploy works untouched, `/api/health` returns
  503 and names which env var supplied each channel, and when nothing delivers
  the form hands the visitor a `mailto:` with their whole selection already
  written into it. A false success on the only conversion path is worse than an
  error, because nobody ever finds out.
- **First-party analytics** (`/api/pulse` + `components/marketing/pulse.tsx`) —
  page view, scroll-depth milestones, gap-finder outcomes and upgrade adds, via
  `sendBeacon` to our own origin. No vendor, no cookie, no consent banner, and
  a malformed beacon returns 204 rather than an error, because measurement must
  never be able to affect the person browsing.
- **CI** (`.github/workflows/ci.yml`) — typecheck, lint, the full test suite and
  a secret-free build on every push. The additive rules are the only thing
  standing between the catalogue and selling a client something they already
  pay for; a guardrail that runs when someone remembers to run it is not one.
- **Security headers** (`next.config.mjs`, `src/lib/headers.test.ts`) — the site
  shipped with none. CSP, `X-Frame-Options`, `nosniff`, a referrer policy,
  `Permissions-Policy` and HSTS now go out on every response, and
  `poweredByHeader` is off. The CSP keeps `'unsafe-inline'` on `script-src`
  deliberately — Next's App Router injects inline bootstrap scripts, and
  removing it means per-request nonces, which means every page goes dynamic.
  The comment in the config argues the trade rather than pretending the policy
  is stricter than it is. Tests assert each header, because a missing security
  header breaks nothing until the day it matters.
- **The site knows its own address** (`env.siteUrl`, `src/lib/crawlable.test.ts`)
  — `robots.txt` and `sitemap.xml` were both serving `http://localhost:3000` to
  Googlebot, and `metadataBase` was pointing every share preview's OG image at
  localhost too. Neither errored; the site was just invisible. `siteUrl` reads
  `NEXT_PUBLIC_APP_URL`, then Vercel's own domain variables, so a deploy
  self-identifies with no dashboard step, and both routes are `force-dynamic`
  so the value is resolved per request rather than frozen at build time — the
  original bug was a build-time value being debugged as a runtime one.
  `siteUrl` is deliberately distinct from `publicUrl`: a link only has to be
  clickable, so `publicUrl` may borrow phxgrowth.com; a sitemap has to be true,
  so `siteUrl` must never borrow anything. Swapping one for the other is
  test-enforced, because the first attempt at this fix did exactly that and
  produced a sitemap claiming the parent's URLs as ours.
- **The catalogue is machine-readable** (`/api/catalogue`) — the whole offer as
  JSON, read-only, and explicitly allowed in `robots.txt` against the general
  `/api/` block. This site sells Answer Engine Visibility; publishing our own
  offer as structured facts is the least we can do while charging for it. It is
  also the single source the MCP server reads, so there is never a second copy
  of a price.
- **Bundles are priced server-side** (`BUNDLES` in `upgrades.ts`) — the browser
  posts a bundle *key*, never a total, and the endpoint prices it from its
  members. Tests enforce what a bundle has to be: at least two real members,
  cheaper than the à la carte sum, and dearer than its own dearest member (a
  "bundle" that undercuts one of its parts is a pricing bug that lets somebody
  buy the stack to get one item at a discount). Exactly one apex bundle, and it
  must be the largest ticket on the site.
- **The Leak Calculator** (`src/lib/leak.ts`) — the parent's Growth Calculator
  projects forward from ad spend; this runs backwards from calls already
  arriving, so it needs no model and makes no claim about our performance.
  Every output is the visitor's own five numbers multiplied. The recovery
  assumption is a slider rather than a hidden constant, defaults below 1, and
  `coverage` is allowed to come out under 1 — in which case the tool says
  "don't buy it". Tested for the underwater branch, for clamping, and for never
  returning Infinity into a price panel.
- **One conversion path** — `/api/reserve` takes the enquiry. It recomputes the
  quote from `UPGRADES` rather than trusting any total the browser sent, and
  deliberately touches no database, no auth and no Stripe, because those are the
  three things most likely to be unconfigured on a fresh deploy and this is
  precisely the path that has to survive that.
- **Multi-tenancy** — every client-owned row carries `clientId`; queries resolve
  the tenant through `src/lib/tenancy.ts` (`requireClient` / `requireAdmin`),
  never trusting a client-supplied id. Admins may pass an explicit `clientId`
  for view-as; clients are always locked to their own profile.
- **Entitlements / metering** — `src/lib/entitlements.ts` checks the active
  subscription, whether the agent is unlocked, and remaining runs this billing
  period before any model call, and records one `UsageRecord` per completed run.
  Plan limits are never read directly: everything goes through `resolveLimits`,
  which folds `ClientEntitlement` rows (granted capacity add-ons) on top via the
  pure `applyCapacity` in `src/lib/capacity.ts`. `null` means unlimited and stays
  unlimited. Admins grant capacity on `/admin/clients/[clientId]`.
- **Agent prompts live in the DB** (`AgentDefinition` + per-client
  `AgentPromptOverride`) — never hardcoded at call time. Edit them in
  `/admin/agents`.
- **Ad ingestion is source-tagged** (`MANUAL` / `CSV` / `API`) so a Meta/Google
  Ads sync can be added later with no schema change.
- **Validation** — Zod on every API input. Agent routes are rate-limited
  (`src/lib/rate-limit.ts`; swap for Upstash in multi-instance prod).
- **Notifications** (`src/lib/notify.ts`) — pure, tested templates plus a
  delivery function that never throws. Requests, replies, morning briefs,
  critical Spend Watch findings and cockpit builds all notify. Mirrors to the
  Zapier hook as well as SMTP, and degrades to a log line when neither is
  configured. Set `AGENCY_NOTIFY_EMAIL` for agency-bound mail.
- **Agency signals** (`src/lib/signals.ts` -> `/admin/signals`) — cross-client
  triage listing only what is wrong, with silently-broken states (stalled
  sweeps, failed briefs) ranked above loud ones (critical alerts, which have
  already emailed the client). `rankSignals` is pure and tested.
- **Cockpit configurator** (`src/lib/cockpit.ts` -> `/cockpit`) — signature
  builds plus a custom configurator over both product lines, add-ons and the
  industry pack. `priceCockpit` is pure and is the only place any total is
  computed, so the running total, the build sheet and the invoice cannot
  disagree. Picking all three foundations applies the bundle price rather than
  the higher a la carte sum. `/api/cockpit` files the build sheet as a Request
  and hands the primary line to `/api/checkout`; it never creates two
  subscriptions from one click.
- **Vertical packs** (`src/lib/verticals.ts`) — per-trade content that overrides
  the three ASSET bodies and selected PLAYBOOK prompts at provisioning time. A
  pack can never change *which* modules a tier provisions, only what they say;
  `verticals.test.ts` enforces that every override names a real module.
- **Spend Watch** (`src/lib/spend-watch.ts`) — the ad-ops line's unattended pass.
  Seven checks (pacing over/under, cost-per-lead drift, delivery gap, creative
  fatigue, cost-per-sale breach, ROAS decline, spend anomaly), each a pure
  function of daily metrics plus the account's targets. Which checks run is
  derived from the MONITOR modules in that tier's blueprint, so the page selling
  the feature and the code running it cannot disagree. A missing target means
  the check is skipped, never guessed. Findings whose condition clears are
  auto-resolved, and the `@@unique([adAccountId, kind, dateBucket])` constraint
  stops a daily sweep re-raising yesterday's problem as new.
- **Night shift** (`src/lib/night-shift.ts`) — an hourly Vercel cron
  (`vercel.json` → `/api/cron/night-shift`) walks every Scale/Command tenant and
  runs the ones that are due. Command runs nightly, Scale weekly, Launch not at
  all. The brief itself is assembled by a pure function from scored data, so a
  model outage costs the narrative summary and never the call list. Unattended
  runs still go through the same entitlement meter as interactive ones.
- **Lead intake** (`/api/intake/[clientId]`) — public, per-tenant token in
  `x-intake-token` or `?token=`, compared in constant time. Leads land unscored;
  scoring happens on the night shift so a slow model call can never make a
  client's website form time out.
- **System memory** (`src/lib/memory.ts`) — closed deals a client logs are
  distilled into `MemoryEntry` rows by a pure `computeCalibration`, then injected
  ahead of every agent run. Nothing is stated below `MIN_EVIDENCE` closed deals,
  confidence is shown rather than hidden, and the client can mute any fact they
  disagree with — a refresh never un-mutes.

## The desk — AI employees

The agent workspace is five chat windows: you open one, paste something in, read
the answer, do the work. The desk is the other arrangement — a role with a
shift, tools, a written ceiling on what it may commit the business to, and a row
for everything it did. Nobody opens it.

Two employees, staffing the two automation builds the catalogue already sells:
**The Foreman** (The Job Runner — quote, schedule, tell the customer, invoice,
chase) and **The Diary** (The Comeback — remind whoever is due, re-approach who
went quiet). They are not a new product; they are the crew for builds that
previously had seven gated action kinds and nothing proposing them.

| File | What it decides |
| --- | --- |
| `lib/connectors.ts` | What an employee can see and touch. **Every write names a gate action kind, and the module throws at import if one does not** — there is no code path by which an employee changes something directly. |
| `lib/employees.ts` | The roster: duties, shifts, and the declared authority every tool is cross-checked against. |
| `lib/context.ts` | What the employee is allowed to know, under a token budget, with the brief and the authority never evictable and everything dropped written onto the run. |
| `lib/resilience.ts` | What happens when the model is wrong: repair the output, back off, or hand it to a person with the question at the top. |
| `lib/desk.ts` | The only impure file — fetches, calls, dispatches, writes rows. Every judgement in it was made by one of the four above. |
| `lib/delivery.ts` | Where a released action actually goes: the client's own n8n / Make / Zapier endpoint, signed, with the timestamp inside the signed material. |

A client sees all of it at `/app/employees` — the escalations waiting on them,
each employee's authority printed in full, every shift worked, and the whole
connector stack with what is wired and what is not. New hires start
**supervised**: in `TRIAL` every proposal is forced to a manual hold, including
the ones that would normally send on a timer.

```bash
curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/desk
```

## Unattended runs

Three crons. Hourly drives both original lines — the night shift (agents →
morning brief) and the Spend Watch (ad-ops → alerts) — and the desk shift, which
walks every hired employee and runs the duties that are due. Every five minutes,
the gate sweep closes review windows and delivers what has been released.

Kept apart on purpose: the sweep is honouring a countdown a client is watching,
so it must never wait behind an employee thinking, and a slow model call must
never delay somebody's held invoice.

```bash
# Local: the cron route is a plain authenticated GET
CRON_SECRET=$(openssl rand -base64 32)   # also set this in .env and in Vercel
curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/night-shift
```

On Vercel, `CRON_SECRET` is sent automatically to scheduled invocations. With no
`CRON_SECRET` set the route refuses every request rather than leaving an open
endpoint that spends the Anthropic budget.

Feeding it leads:

```bash
curl -X POST "$NEXT_PUBLIC_APP_URL/api/intake/$CLIENT_ID?token=$INTAKE_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"Marcy Bell","email":"marcy@example.com","message":"Storm damage"}'
```

The client's own URL is shown to them on `/app/brief`.

See [`PROGRESS.md`](./PROGRESS.md) for the phase-by-phase build log and the
current state of each phase.
