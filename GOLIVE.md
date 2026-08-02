# Going live

Every step needed to take this from a repository to a system that runs your
business unattended, in the order that works. Nothing here is optional unless
it says so.

Roughly 90 minutes if nothing fights you, most of it waiting on DNS and Stripe.

**Read [Step 0](#step-0--what-this-system-does-and-does-not-do) first.** It is
short and it will change what you expect from the rest.

---

## Step 0 — What this system does and does not do

Three things about how money actually flows here, because they decide whether
the rest of this guide gives you what you want.

**1. The public site does not take payment.** `/` and `/upgrades` sell the five
upgrades and three bundles, and the button on them is an enquiry form, not a
checkout. It emails you, emails the prospect a receipt, writes them into the
pipeline, and then chases them three times if you don't reply. **A human — you —
closes the sale.** There is no self-serve checkout on the public site, by
design.

**2. Stripe checkout exists only inside the client console.** Once somebody is
a signed-in client, `/app/billing` can start a Stripe subscription for one of
the six console plans. That is the path that creates a real Stripe
subscription.

**3. The dunning ladder only protects Stripe *subscriptions*.** This matters
more than anything else in this document:

> If you bill a client by sending them a manual Stripe invoice, or by bank
> transfer, or through the parent company, **the dunning engine will not chase
> it.** It reads `invoice.payment_failed` and tracks the failure only when the
> invoice belongs to a subscription. A one-off invoice failing is logged and
> otherwise ignored.

So: **to get the automatic payment recovery you asked for, your clients need to
be on Stripe subscriptions.** If they are on manual invoices today, migrating
them is the single highest-value thing you can do, and it is a business task
rather than a code one.

Everything else below assumes you want both halves working: the enquiry-and-
follow-up half (works regardless), and the subscription-and-dunning half
(needs the above).

---

## Step 1 — A database

The console, the pipeline, the payment tracking and every unattended loop need
Postgres. The public marketing site does not, which is why the site stays up
even when this is broken.

1. Create a Postgres database. **[Neon](https://neon.tech) free tier is enough
   to start** and is what the schema was written against.
2. It must support the **pgvector** extension — the schema declares it for the
   recall/search feature. Neon and Vercel Postgres both do. The build installs
   the extension itself; you do not need to run anything.
3. Copy the connection string. It must end with `?sslmode=require`.

Keep it somewhere for Step 3. It looks like:

```
postgresql://user:password@ep-something.us-east-2.aws.neon.tech/dbname?sslmode=require
```

---

## Step 2 — A way to send email

**This is the difference between a system that works and one that only looks
like it works.** Every loop in this platform ends in an email: the payment
notices, the follow-ups, the Monday digest, the enquiry alerts. With no mail
transport configured, all of it runs correctly and delivers nothing, and the
only sign is a log line.

1. Sign up at [resend.com](https://resend.com).
2. Create an API key.
3. Save it for Step 3 as `RESEND_API_KEY`.

That is genuinely all — **Resend's onboarding sender works before you have
verified any domain**, so email starts working the moment you paste the key.

Later, when you want mail to come from `@phxgrowth.com` rather than Resend's
onboarding domain, verify the domain in Resend and set `EMAIL_FROM` to an
address on it. Not needed today.

---

## Step 3 — A way to sign in

Without this you cannot reach `/admin/revenue` or any console page. Pick one.
Google is faster.

### Option A — Google (recommended)

1. [Google Cloud Console](https://console.cloud.google.com) → create a project.
2. **APIs & Services → OAuth consent screen** → External → fill in the app name
   and your email → save.
3. **Credentials → Create credentials → OAuth client ID → Web application.**
4. Under **Authorised redirect URIs**, add both:
   ```
   http://localhost:3000/api/auth/callback/google
   https://YOUR-DOMAIN/api/auth/callback/google
   ```
   You will not know the production domain until Step 5. **Come back and add
   the second one then** — this is the most commonly missed step in the whole
   guide, and the symptom is a `redirect_uri_mismatch` error at sign-in.
5. Save the client ID and secret.

### Option B — Email magic link

Set `EMAIL_SERVER_HOST`, `EMAIL_SERVER_PORT`, `EMAIL_SERVER_USER` and
`EMAIL_SERVER_PASSWORD` to any SMTP provider's details (Resend can do SMTP
too). No Google project needed.

### Either way — make yourself the admin

Set `SEED_ADMIN_EMAIL` to **the exact email address you will sign in with.**

The seed grants the `ADMIN` role to that address and nothing else does. New
sign-ins default to `CLIENT`. Get this wrong and you will sign in successfully,
land on a client dashboard, and have no way into `/admin`.

---

## Step 4 — Generate two secrets

Run these locally and keep the output:

```bash
openssl rand -base64 32   # → AUTH_SECRET
openssl rand -base64 32   # → CRON_SECRET
```

`CRON_SECRET` is what makes the unattended loops run. **With no value set,
every `/api/cron/*` route refuses every request** — deliberately, so that
nobody who finds the URL can spend your model budget or fire your clients'
payment notices. No secret means no dunning, no follow-ups, no digest, no
morning brief, no Spend Watch.

---

## Step 5 — Deploy to Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → import
   `GreenAiSolution/Addtophxgrowth`.
2. Framework preset: **Next.js**. Leave the build command alone — `package.json`
   already runs `prisma generate && node scripts/db-sync.mjs && next build`,
   and **that middle step pushes the schema to your database on every deploy.**
   You never run a migration by hand.
3. Before the first deploy, add every variable in the table below
   (**Settings → Environment Variables**, tick Production *and* Preview).

| Variable | Value | Why |
|---|---|---|
| `DATABASE_URL` | From Step 1 | Console, pipeline, payments |
| `RESEND_API_KEY` | From Step 2 | **Actually delivers the email** |
| `AUTH_SECRET` | From Step 4 | Session signing |
| `CRON_SECRET` | From Step 4 | **Runs every unattended loop** |
| `AUTH_TRUST_HOST` | `true` | Auth behind Vercel's proxy |
| `SEED_ADMIN_EMAIL` | Your sign-in email | Makes you admin |
| `AGENCY_NOTIFY_EMAIL` | Where alerts go | Defaults to the above |
| `NEXT_PUBLIC_APP_URL` | `https://your-domain` | Links in email, sitemap, OG cards |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | From Step 3 | Sign-in (if Option A) |
| `ANTHROPIC_API_KEY` | From console.anthropic.com | Agent runs, briefs, reports |

4. Deploy. Note the URL it gives you.
5. **Go back to Step 3.4 and add that URL's callback to Google.** Then set
   `NEXT_PUBLIC_APP_URL` to it properly and redeploy.

### Check it

```bash
curl https://YOUR-DOMAIN/api/health
```

You want `"status":"ok"` and `"enquiriesReachAHuman":true`. If it says
`degraded`, the response names the exact env var that is missing — that
endpoint exists precisely because "no mail configured" and "configured
correctly" look identical from the outside.

Also confirm `"gate":{"ready":true,...}` — that is a live probe against the
database, and it is how you know the schema actually landed rather than the
build merely not complaining.

---

## Step 6 — Seed the catalogue

The database has tables but no plans, no agent definitions and no admin user.
Billing cannot work without `Plan` rows: the Stripe webhook looks the plan up
by key and writes a subscription against it.

Run this **from your machine**, pointed at production:

```bash
git clone https://github.com/GreenAiSolution/Addtophxgrowth.git
cd Addtophxgrowth
pnpm install

# Point at production. Use the same values you put in Vercel.
export DATABASE_URL='postgresql://...your production string...'
export SEED_ADMIN_EMAIL='you@yourdomain.com'

pnpm db:seed
```

### One wrinkle worth knowing

**The seed also creates three demo clients** (`demo1@`, `demo2@`, `demo3@
phxgrowth.com`) with fake ad metrics, leads, a failing payment and a small
pipeline. That is deliberate — it means a fresh install has something real to
look at on every screen, generated by the actual production code paths.

In production you probably want the plans and not the demos. Two options:

- **Leave them.** They are inert, clearly named, and only visible to you inside
  the console. This is what I would do for the first month — they are the only
  way to see what a healthy client looks like.
- **Remove them afterwards.** Delete the three `demo*@phxgrowth.com` users in
  your database; every row they own cascades away with them.

Do **not** edit the seed to skip them until you have signed in once and seen
the console populated — an empty console makes it very hard to tell "working"
from "broken".

---

## Step 7 — Stripe

Do this in **test mode** first. The toggle is in the Stripe dashboard header.

### 7a. Keys

Stripe → **Developers → API keys** → copy the secret key (`sk_test_...`).
Add it to Vercel as `STRIPE_SECRET_KEY`.

### 7b. Create the products and prices

```bash
export STRIPE_SECRET_KEY='sk_test_...'
pnpm stripe:setup
```

This creates a Stripe product and price for all six console plans plus their
one-time build fees, and prints the env lines. It is idempotent — running it
twice reuses what exists rather than creating duplicates.

Paste every printed `STRIPE_PRICE_*` line into Vercel's environment variables.
Then re-run the seed so the price IDs land in the database too:

```bash
pnpm db:seed
```

### 7c. The webhook — and the one event that matters

Stripe → **Developers → Webhooks → Add endpoint.**

- **Endpoint URL:** `https://YOUR-DOMAIN/api/webhooks/stripe`
- **Events to send** — select exactly these five:

| Event | What it does here |
|---|---|
| `checkout.session.completed` | Creates the subscription, provisions the system |
| `customer.subscription.updated` | Keeps plan and status in step |
| `customer.subscription.deleted` | Ends it, marks any open payment issue lost |
| `invoice.paid` | **Closes a payment issue as recovered** |
| `invoice.payment_failed` | **Opens a payment issue and starts the dunning ladder** |

> **`invoice.payment_failed` is the one this whole feature turns on.** The code
> handles it now, but Stripe will not send it unless you tick it here. Miss
> this box and card failures stay exactly as silent as they were before.

Copy the signing secret (`whsec_...`) into Vercel as `STRIPE_WEBHOOK_SECRET`.
Redeploy so the new variables take effect.

### 7d. Prove the dunning ladder works

The honest test, in Stripe test mode:

1. Sign in to your own app, go to `/app/billing`, subscribe to any plan using
   Stripe's success card `4242 4242 4242 4242`.
2. In Stripe, find that customer and swap their card for the failure card
   **`4000 0000 0000 0341`** (attaches fine, fails on charge).
3. Trigger the next invoice: Stripe → the subscription → **Actions → Advance
   the clock**, or just wait for the period to roll.
4. Within seconds: a `PaymentIssue` row appears, `/admin/revenue` shows it
   under **Failing payments**, and the first notice email arrives.

If nothing happens, check **Stripe → Webhooks → your endpoint → recent
deliveries** for a red entry. A 400 there means `STRIPE_WEBHOOK_SECRET` is
wrong; a 500 means read the Vercel function log.

### 7e. Going to live mode

When you are ready for real money: flip Stripe to live mode, redo 7a–7c with
the live keys (`sk_live_...`, a new endpoint, a new `whsec_...`), and re-run
`pnpm stripe:setup` and `pnpm db:seed` against live. **Test and live mode share
nothing** — not products, not prices, not webhooks.

---

## Step 8 — Turn on the crons

This is the step that makes it *automatic* rather than *available*.

`vercel.json` already declares all three:

| Path | Schedule | What it does |
|---|---|---|
| `/api/cron/gate` | every 5 min | Closes review windows on held actions |
| `/api/cron/night-shift` | hourly | Morning briefs + Spend Watch sweeps |
| `/api/cron/revenue` | daily 15:00 UTC | **Dunning, follow-ups, Monday digest** |

Vercel sends `CRON_SECRET` automatically as a bearer token. You do not wire
anything — but check two things:

1. **Your Vercel plan allows them.** The Hobby tier is limited to a small
   number of cron jobs that run **once a day**. Three crons with 5-minute and
   hourly schedules need **Pro**. Confirm the current limits on Vercel's
   pricing page; if you are on Hobby, the sub-daily crons will simply not fire
   and nothing will tell you.
2. **They are registered.** Vercel → your project → **Settings → Cron Jobs.**
   All three should be listed after the deploy.

### Prove it by hand

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
     https://YOUR-DOMAIN/api/cron/revenue
```

You should get JSON like:

```json
{"ok":true,
 "dunning":{"checked":1,"notified":0,"escalated":0,"waiting":1},
 "followUps":{"checked":3,"sent":1,"dormant":0,"waiting":1,"stopped":1},
 "digest":{"sent":false,"why":"Not Monday."}}
```

`{"error":"Unauthorized"}` means `CRON_SECRET` is missing or mismatched.

---

## Step 9 — Walk the money path yourself

Do not trust any of the above until you have been through it as a stranger.

**The enquiry path** (works without Stripe entirely):

1. Open your live site in a private window. Configure an upgrade, submit the
   enquiry form with a real email address you can check.
2. Confirm three things happen: you get the `💰` reservation email, the address
   you used gets a receipt, and `/admin/revenue` shows them under **Open
   opportunities**.
3. Wait a day, or fire `/api/cron/revenue` by hand. The first follow-up should
   arrive at that address.
4. **Click the opt-out link in it.** You should get "Done — you won't hear from
   us again", and the row on `/admin/revenue` should say *opted out*. Verify
   this personally — it is the one thing in the system that emails strangers.

**The subscription path:** Step 7d above.

---

## Step 10 — What to expect afterwards

Once it is live, this is the whole of your involvement:

- **Every Monday**, an email with MRR, what is at risk, what moved, and what is
  in the pipeline. It is the only scheduled email you get.
- **When a payment fails**, the client is told immediately, again at 3 days,
  again at 7. You are not involved until day 10, when you get one email saying
  it needs a phone call.
- **When somebody enquires**, you get told instantly, and they get chased at 1,
  4 and 10 days if you don't reply. Replying, or moving them off `NEW` in the
  console, stops the sequence immediately.
- **Every morning**, `/admin/signals` is the one page to check. It lists only
  what is wrong. An empty page means nothing needs you.

### Honest limits

- **This system defends revenue. It does not create demand.** Nothing here
  brings people to the site. It makes sure that everybody who does arrive is
  captured and chased, and that money you have already won does not leak. The
  traffic is still your job.
- **The dunning ladder needs clients on Stripe subscriptions.** See Step 0.
- **The gate has no executors wired.** `/app/gate` will hold proposed actions
  correctly and then fail them with *"No executor is wired"* when they release,
  because nothing calls `registerExecutor` yet. The Job Runner and Comeback
  builds are sold on the site but not yet connected to anything that acts.
  Don't sell those two until that is done.
- **Everything degrades quietly rather than crashing.** That is deliberate, and
  it means `/api/health` is how you find out something is off — not an error
  page. Check it after every deploy.

---

## If something is wrong

| Symptom | Cause | Fix |
|---|---|---|
| `/api/health` says `degraded` | No mail transport | Set `RESEND_API_KEY` |
| `"gate":{"ready":false}` | Schema never pushed | Check the build log for `[db-sync]`; confirm `DATABASE_URL` |
| Sign-in gives `redirect_uri_mismatch` | Production callback not in Google | Step 3.4 |
| Signed in but no `/admin` | `SEED_ADMIN_EMAIL` ≠ your address | Fix it, re-run `pnpm db:seed` |
| Cron returns `Unauthorized` | `CRON_SECRET` missing or mismatched | Step 4, redeploy |
| Crons never fire | Vercel Hobby tier | Step 8.1 |
| Card fails, nothing happens | `invoice.payment_failed` not selected | Step 7c |
| Checkout says "Billing not configured" | Price env vars missing | Step 7b |
| Emails send but links say `localhost` | `NEXT_PUBLIC_APP_URL` unset | Step 5 |

Logs: Vercel → your project → **Logs**, filtered to the function. Every loop in
this codebase logs a one-line summary of what it did — `[cron/revenue]`,
`[dunning]`, `[pipeline]`, `[notify]`.
