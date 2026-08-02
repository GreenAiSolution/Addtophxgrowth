import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PRODUCT_LINES, PLANS } from "../src/lib/catalog";
import { AGENTS } from "../src/lib/agents";

const prisma = new PrismaClient();

function startOfMonthUTC(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

async function seedCatalog() {
  for (const [key, line] of Object.entries(PRODUCT_LINES)) {
    await prisma.productLine.upsert({
      where: { key: key as never },
      update: { name: line.name, blurb: line.blurb },
      create: { key: key as never, name: line.name, blurb: line.blurb },
    });
  }

  for (const p of PLANS) {
    const priceId = process.env[p.stripePriceEnv] ?? null;
    await prisma.plan.upsert({
      where: { key: p.key },
      update: {
        name: p.name,
        lineKey: p.line,
        priceMonthly: p.priceMonthly,
        stripePriceId: priceId,
        tagline: p.tagline,
        features: p.features,
        maxAgents: p.limits.agents,
        maxAgentRunsMonthly: p.limits.agentRunsPerMonth,
        maxAdAccounts: p.limits.adAccounts,
        unlockedAgents: p.unlockedAgents,
      },
      create: {
        key: p.key,
        name: p.name,
        lineKey: p.line,
        priceMonthly: p.priceMonthly,
        stripePriceId: priceId,
        tagline: p.tagline,
        features: p.features,
        maxAgents: p.limits.agents,
        maxAgentRunsMonthly: p.limits.agentRunsPerMonth,
        maxAdAccounts: p.limits.adAccounts,
        unlockedAgents: p.unlockedAgents,
      },
    });
  }
}

async function seedAgents() {
  for (const a of AGENTS) {
    await prisma.agentDefinition.upsert({
      where: { slug: a.slug },
      update: {
        name: a.name,
        persona: a.persona,
        tagline: a.tagline,
        accent: a.accent,
        avatar: a.avatar,
        baseSystemPrompt: a.baseSystemPrompt,
        emitsCrmPayload: a.emitsCrmPayload ?? false,
      },
      create: {
        slug: a.slug,
        name: a.name,
        persona: a.persona,
        tagline: a.tagline,
        accent: a.accent,
        avatar: a.avatar,
        baseSystemPrompt: a.baseSystemPrompt,
        emitsCrmPayload: a.emitsCrmPayload ?? false,
      },
    });
  }
}

async function upsertClient(opts: {
  email: string;
  name: string;
  businessName: string;
  industry: string;
  website: string;
  adPlatforms: string[];
  goals: string;
  voiceTone: string;
  verticalKey?: string;
  agentsPlan?: string;
  adOpsPlan?: string;
  adAccounts: {
    platform: string;
    name: string;
    /** Targets the Spend Watch measures against. Omitted = that check is skipped. */
    monthlyBudgetCents?: number;
    targetCpaCents?: number;
    targetRoas?: number;
  }[];
}) {
  const user = await prisma.user.upsert({
    where: { email: opts.email },
    update: { name: opts.name, role: "CLIENT" },
    create: { email: opts.email, name: opts.name, role: "CLIENT", emailVerified: new Date() },
  });

  const client = await prisma.clientProfile.upsert({
    where: { userId: user.id },
    update: {
      businessName: opts.businessName,
      industry: opts.industry,
      website: opts.website,
      adPlatforms: opts.adPlatforms,
      goals: opts.goals,
      voiceTone: opts.voiceTone,
      verticalKey: opts.verticalKey ?? null,
      onboardedAt: new Date(),
      intakeCompletedAt: new Date(),
    },
    create: {
      userId: user.id,
      businessName: opts.businessName,
      industry: opts.industry,
      website: opts.website,
      adPlatforms: opts.adPlatforms,
      goals: opts.goals,
      voiceTone: opts.voiceTone,
      verticalKey: opts.verticalKey ?? null,
      intakeToken: randomBytes(24).toString("base64url"),
      onboardedAt: new Date(),
      intakeCompletedAt: new Date(),
    },
  });

  const periodStart = startOfMonthUTC();
  const periodEnd = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1));

  async function activate(lineKey: "AI_AGENTS" | "AD_OPS", planKey: string) {
    await prisma.subscription.upsert({
      where: { clientId_lineKey: { clientId: client.id, lineKey } },
      update: { planKey, status: "ACTIVE", currentPeriodStart: periodStart, currentPeriodEnd: periodEnd },
      create: {
        clientId: client.id,
        lineKey,
        planKey,
        status: "ACTIVE",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      },
    });
  }

  if (opts.agentsPlan) await activate("AI_AGENTS", opts.agentsPlan);
  if (opts.adOpsPlan) await activate("AD_OPS", opts.adOpsPlan);

  // Ad accounts + 90 days of metrics
  for (const acc of opts.adAccounts) {
    const targets = {
      monthlyBudgetCents: acc.monthlyBudgetCents ?? null,
      targetCpaCents: acc.targetCpaCents ?? null,
      targetRoas: acc.targetRoas ?? null,
    };
    const account = await prisma.adAccount.upsert({
      where: { id: `${client.id}-${acc.platform}` },
      update: { name: acc.name, ...targets },
      create: {
        id: `${client.id}-${acc.platform}`,
        clientId: client.id,
        platform: acc.platform,
        name: acc.name,
        ...targets,
      },
    });

    for (let i = 0; i < 90; i++) {
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - i);

      // Deterministic-ish synthetic curve (no RNG for reproducible seeds).
      const wave = Math.sin(i / 6) * 0.35 + 1;
      const spend = Math.round((8000 + i * 40) * wave); // cents
      const impressions = Math.round(12000 * wave + i * 60);
      const clicks = Math.round(impressions * 0.031);
      const leads = Math.max(1, Math.round(clicks * 0.14));
      const conversions = Math.max(0, Math.round(leads * 0.22));
      const revenue = conversions * 42000; // cents

      await prisma.adMetricDaily.upsert({
        where: { adAccountId_date: { adAccountId: account.id, date } },
        update: { spend, impressions, clicks, leads, conversions, revenue },
        create: {
          adAccountId: account.id,
          date,
          spend,
          impressions,
          clicks,
          leads,
          conversions,
          revenue,
          source: "MANUAL",
        },
      });
    }
  }

  return client;
}

async function seedSampleConversation(clientId: string) {
  const agent = await prisma.agentDefinition.findUnique({ where: { slug: "lead-qualifier" } });
  if (!agent) return;

  const existing = await prisma.agentConversation.findFirst({
    where: { clientId, agentId: agent.id },
  });
  if (existing) return;

  const convo = await prisma.agentConversation.create({
    data: { clientId, agentId: agent.id, title: "Inbound from Acme Corp" },
  });

  await prisma.agentMessage.createMany({
    data: [
      {
        conversationId: convo.id,
        role: "USER",
        content:
          "Lead: Dana Ruiz, VP Marketing @ Acme Corp (SaaS, ~200 employees). Filled out demo form, budget 'flexible', wants to launch next quarter.",
      },
      {
        conversationId: convo.id,
        role: "ASSISTANT",
        content:
          "**Score: 82 / 100 — HOT**\n\n- Authority: VP Marketing (decision-influencer) ✅\n- Need: actively requested a demo ✅\n- Timeline: next quarter — concrete ✅\n- Budget: 'flexible' — needs confirmation ⚠️\n\n**Next action:** Book a discovery call within 24h; lead with quarter-launch timeline and confirm budget range.",
      },
    ],
  });

  await prisma.usageRecord.create({
    data: {
      clientId,
      lineKey: "AI_AGENTS",
      agentSlug: "lead-qualifier",
      periodStart: startOfMonthUTC(),
      tokensIn: 180,
      tokensOut: 140,
    },
  });
}

/**
 * Leads, closed deals and a finished brief for one demo tenant, so the night
 * shift and system-memory pages have something real to render before a single
 * webhook has fired. Guarded on lead count — re-running the seed must not
 * duplicate the history the memory is computed from.
 */
/**
 * The revenue engine's demo data.
 *
 * Three things, chosen so `/admin/revenue` shows each of its states rather
 * than one populated row and two empty panels: a payment that is currently
 * failing and part-way up the dunning ladder, one that failed and came back,
 * and a small pipeline of prospects at different rungs of the follow-up
 * sequence.
 *
 * Deliberately does NOT seed five closed opportunities to manufacture a win
 * rate. Below `MIN_PIPELINE_EVIDENCE` the board says so plainly, and a demo
 * that shows the honest "not enough evidence yet" state is worth more than one
 * that shows an invented percentage — that rule is the point of the feature.
 */
async function seedRevenueDemo(failingClientId: string, recoveredClientId: string) {
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  // Deterministic invoice ids, so re-running the seed updates rather than
  // stacking up a new failing invoice every time.
  await prisma.paymentIssue.upsert({
    where: { stripeInvoiceId: "in_seed_failing" },
    update: {},
    create: {
      clientId: failingClientId,
      lineKey: "AI_AGENTS",
      stripeInvoiceId: "in_seed_failing",
      amountCents: 299_700,
      state: "OPEN",
      attemptCount: 2,
      firstFailedAt: daysAgo(4),
      lastFailedAt: daysAgo(1),
      nextAttemptAt: new Date(now.getTime() + 3 * 86_400_000),
      // Four days in with one notice sent puts it exactly where the ladder
      // would have it, rather than in a state the engine cannot produce.
      noticesSent: 2,
      lastNoticeAt: daysAgo(1),
      lastNoticeStep: "REMINDER",
    },
  });

  await prisma.paymentIssue.upsert({
    where: { stripeInvoiceId: "in_seed_recovered" },
    update: {},
    create: {
      clientId: recoveredClientId,
      lineKey: "AI_AGENTS",
      stripeInvoiceId: "in_seed_recovered",
      amountCents: 499_700,
      state: "RECOVERED",
      attemptCount: 2,
      firstFailedAt: daysAgo(12),
      lastFailedAt: daysAgo(11),
      noticesSent: 1,
      lastNoticeAt: daysAgo(11),
      lastNoticeStep: "FIRST",
      recoveredAt: daysAgo(10),
    },
  });

  const prospects = [
    {
      email: "dana@summitexteriors.example",
      name: "Dana Whitfield",
      company: "Summit Exteriors",
      note: "Booked out through spring but want this running before storm season.",
      items: ["job-runner"],
      quotedMonthlyCents: 490_000,
      ageDays: 1,
      followUpsSent: 0,
    },
    {
      email: "marcus@vertexhvac.example",
      name: "Marcus Adeyemi",
      company: "Vertex HVAC",
      note: null,
      items: ["comeback", "motion-unit"],
      quotedMonthlyCents: 660_000,
      ageDays: 5,
      followUpsSent: 2,
    },
    {
      email: "priya@lumenmedspa.example",
      name: "Priya Raghavan",
      company: "Lumen Med Spa",
      note: "Asked to be left alone for now.",
      items: ["job-runner"],
      quotedMonthlyCents: 490_000,
      ageDays: 8,
      followUpsSent: 2,
      stopped: true,
    },
  ];

  for (const p of prospects) {
    const existing = await prisma.opportunity.findFirst({ where: { email: p.email } });
    if (existing) continue;
    await prisma.opportunity.create({
      data: {
        source: "RESERVATION",
        stage: "NEW",
        name: p.name,
        email: p.email,
        company: p.company,
        note: p.note,
        items: p.items,
        quotedMonthlyCents: p.quotedMonthlyCents,
        followUpsSent: p.followUpsSent,
        lastFollowUpAt: p.followUpsSent > 0 ? daysAgo(1) : null,
        stoppedAt: p.stopped ? daysAgo(2) : null,
        createdAt: daysAgo(p.ageDays),
        stopToken: randomBytes(24).toString("base64url"),
      },
    });
  }
}

async function seedNightShiftDemo(clientId: string) {
  const already = await prisma.lead.count({ where: { clientId } });
  if (already > 0) return;

  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

  const scored: {
    name: string;
    company: string;
    score: number;
    tier: string;
    source: string;
    age: number;
  }[] = [
    { name: "Marcy Bell", company: "Bell Residence", score: 91, tier: "HOT", source: "google-ads", age: 6 },
    { name: "Tomas Vega", company: "Vega Property Group", score: 87, tier: "HOT", source: "google-ads", age: 9 },
    { name: "Priya Raman", company: "Raman Residence", score: 74, tier: "WARM", source: "facebook", age: 14 },
    { name: "Cole Whitaker", company: "Whitaker Ranch", score: 68, tier: "WARM", source: "referral", age: 96 },
    { name: "Dee Osei", company: "Osei Residence", score: 63, tier: "WARM", source: "facebook", age: 120 },
    { name: "Hal Brennan", company: "Brennan Storage", score: 38, tier: "COLD", source: "facebook", age: 40 },
  ];

  for (const l of scored) {
    await prisma.lead.create({
      data: {
        clientId,
        source: l.source,
        name: l.name,
        company: l.company,
        email: `${l.name.split(" ")[0].toLowerCase()}@example.com`,
        message: "Storm damage on the north slope, insurance adjuster coming Thursday.",
        status: "SCORED",
        score: l.score,
        tier: l.tier,
        reasoning: "Homeowner, inside the service radius, visible damage described.",
        nextAction:
          l.score >= 80
            ? "Senior estimator to call within 15 minutes and book an inspection."
            : "Start the follow-up cadence; re-check once the adjuster has been out.",
        scoredAt: hoursAgo(l.age),
        createdAt: hoursAgo(l.age + 2),
      },
    });
  }

  // Two fresh, unscored leads so the next night-shift run has work to do.
  for (const name of ["Ines Duarte", "Rafe Sandoval"]) {
    await prisma.lead.create({
      data: {
        clientId,
        source: "WEBHOOK",
        name,
        company: `${name.split(" ")[1]} Residence`,
        email: `${name.split(" ")[0].toLowerCase()}@example.com`,
        message: "Roof is leaking into the upstairs bedroom after last night's storm.",
        status: "NEW",
        createdAt: hoursAgo(3),
      },
    });
  }

  // Enough closed deals for calibration to clear the evidence floor. Weighted so
  // the demo shows a genuinely useful pattern: google-ads outperforms facebook,
  // and "getting three estimates" is the objection that keeps costing them.
  const outcomes: { won: boolean; score: number; value: number; source: string; objection?: string }[] = [
    ...Array.from({ length: 7 }, () => ({ won: true, score: 88, value: 1_620_000, source: "google-ads" })),
    ...Array.from({ length: 3 }, () => ({
      won: false,
      score: 84,
      value: 0,
      source: "google-ads",
      objection: "Getting three other estimates",
    })),
    ...Array.from({ length: 2 }, () => ({ won: true, score: 71, value: 1_180_000, source: "facebook" })),
    ...Array.from({ length: 6 }, () => ({
      won: false,
      score: 66,
      value: 0,
      source: "facebook",
      objection: "Getting three other estimates",
    })),
    ...Array.from({ length: 5 }, () => ({
      won: false,
      score: 45,
      value: 0,
      source: "facebook",
      objection: "Waiting until after storm season",
    })),
  ];

  for (const o of outcomes) {
    await prisma.dealOutcome.create({
      data: {
        clientId,
        outcome: o.won ? "WON" : "LOST",
        valueCents: o.value,
        scoreAtQualification: o.score,
        tierAtQualification: o.score >= 80 ? "HOT" : o.score >= 60 ? "WARM" : "COLD",
        objection: o.objection ?? null,
        source: o.source,
      },
    });
  }

  // Compute the memory exactly the way production does, rather than hand-writing
  // facts the real code would never produce.
  const { refreshMemory } = await import("../src/lib/memory");
  const learned = await refreshMemory(clientId);
  console.log(`   · derived ${learned} learned facts from ${outcomes.length} closed deals`);

  const { planBrief } = await import("../src/lib/night-shift");
  const now = new Date();
  const openLeads = await prisma.lead.findMany({ where: { clientId, status: "SCORED" } });
  const plan = planBrief({
    businessName: "Ironclad Roofing",
    cadence: "DAILY",
    scored: openLeads
      .filter((l) => (l.scoredAt ?? l.createdAt) > hoursAgo(24))
      .map((l) => ({
        id: l.id,
        name: l.name,
        company: l.company,
        score: l.score,
        tier: l.tier,
        nextAction: l.nextAction,
        ageHours: (now.getTime() - l.createdAt.getTime()) / 3_600_000,
      })),
    open: openLeads.map((l) => ({
      id: l.id,
      name: l.name,
      company: l.company,
      score: l.score,
      tier: l.tier,
      nextAction: l.nextAction,
      ageHours: (now.getTime() - (l.scoredAt ?? l.createdAt).getTime()) / 3_600_000,
    })),
  });

  const runDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  await prisma.briefRun.upsert({
    where: { clientId_runDate: { clientId, runDate } },
    update: {},
    create: {
      clientId,
      runDate,
      cadence: "DAILY",
      status: "COMPLETE",
      leadsScored: 3,
      headline: plan.headline,
      summary:
        "Three leads came in overnight and two of them are worth a call before ten. Marcy Bell and Tomas Vega both described visible storm damage and both are inside your radius — Vega has an adjuster booked already, which is usually the difference between a quote and a job.\n\nThe more urgent thing is the four qualified leads that have been sitting since last week. They scored well enough to call when they arrived and nobody has. Clear those first, then work the new ones.",
      sections: plan.sections as unknown as object,
      completedAt: now,
    },
  });
}

/**
 * Degrade one of demo client #1's accounts over the last week and then run the
 * real Spend Watch against it, so /app/ads has genuine alerts on a fresh
 * install. As with the memory demo, the alerts are produced by production code
 * rather than hand-written — a threshold change updates the demo automatically.
 */
async function seedSpendWatchDemo(clientId: string) {
  const meta = await prisma.adAccount.findFirst({
    where: { clientId, platform: "META" },
    select: { id: true },
  });
  if (!meta) return;

  // Last 7 complete days: spend held, clicks and leads fall away. That is what
  // creative fatigue plus cost-per-lead drift actually looks like in the data.
  for (let i = 1; i <= 7; i++) {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - i);
    await prisma.adMetricDaily.updateMany({
      where: { adAccountId: meta.id, date },
      data: { spend: 24_000, clicks: 120, leads: 3, conversions: 1, revenue: 42_000 },
    });
  }

  const { runSpendWatch } = await import("../src/lib/spend-watch");
  // Force the sweep past its hour gate — the seed runs whenever it runs.
  const now = new Date();
  now.setUTCHours(23, 0, 0, 0);
  const result = await runSpendWatch(clientId, now);
  console.log(`   \u00b7 spend watch: ${result.raised ?? 0} alerts raised`);
}

/**
 * Capacity add-ons granted to demo client #1 (Scale). Scale unlocks 4 agents and
 * 10,000 runs; these grants take that to 5 agents and 15,000 runs — the point
 * being that the meter on /app/billing and the gate in checkAgentRun both move,
 * which is exactly what buying a capacity add-on used to fail to do.
 */
async function seedCapacityGrants(clientId: string) {
  const existing = await prisma.clientEntitlement.count({ where: { clientId } });
  if (existing > 0) return;

  await prisma.clientEntitlement.createMany({
    data: [
      {
        clientId,
        addonKey: "extra-agent",
        quantity: 1,
        agentSlug: "objection-handler",
        note: "Agreed on the Q3 review call \u2014 demo data",
      },
      {
        clientId,
        addonKey: "run-pack",
        quantity: 1,
        note: "Peak season top-up \u2014 demo data",
      },
    ],
  });
  console.log("   \u00b7 granted 2 capacity add-ons (extra agent + run pack)");
}

async function main() {
  console.log("→ Seeding catalog (product lines + plans)…");
  await seedCatalog();

  console.log("→ Seeding agent definitions…");
  await seedAgents();

  console.log("→ Seeding admin user…");
  await prisma.user.upsert({
    where: { email: process.env.SEED_ADMIN_EMAIL ?? "admin@phxgrowth.com" },
    update: { role: "ADMIN" },
    create: {
      email: process.env.SEED_ADMIN_EMAIL ?? "admin@phxgrowth.com",
      name: "Agency Operator",
      role: "ADMIN",
      emailVerified: new Date(),
    },
  });

  console.log("→ Seeding demo client #1 (Scale + Operate)…");
  const c1 = await upsertClient({
    email: "demo1@phxgrowth.com",
    name: "Jordan Vega",
    businessName: "Peak Performance Coaching",
    industry: "Coaching & Consulting",
    website: "https://peakperform.example",
    adPlatforms: ["META", "GOOGLE"],
    goals: "Fill the calendar with qualified strategy calls and cut cost-per-lead by 30%.",
    voiceTone: "Confident, direct, motivational — no fluff.",
    agentsPlan: "scale",
    adOpsPlan: "operate",
    adAccounts: [
      {
        platform: "META",
        name: "Peak — Meta Ads",
        monthlyBudgetCents: 250_000,
        targetCpaCents: 55_000,
        targetRoas: 3,
      },
      {
        platform: "GOOGLE",
        name: "Peak — Google Ads",
        monthlyBudgetCents: 400_000,
        targetCpaCents: 60_000,
        targetRoas: 3,
      },
    ],
  });
  await seedSampleConversation(c1.id);
  await seedSpendWatchDemo(c1.id);
  await seedCapacityGrants(c1.id);

  console.log("→ Seeding demo client #2 (Launch)…");
  await upsertClient({
    email: "demo2@phxgrowth.com",
    name: "Sam Okafor",
    businessName: "Bright Home Solar",
    industry: "Home Services",
    website: "https://brighthomesolar.example",
    adPlatforms: ["META"],
    goals: "Qualify inbound solar leads faster and stop wasting sales time on tire-kickers.",
    voiceTone: "Warm, trustworthy, local.",
    agentsPlan: "launch",
    adAccounts: [{ platform: "META", name: "Bright Home — Meta Ads" }],
  });

  // A Command-tier tenant on the roofing pack, with enough history for the
  // night shift and system memory to have something real to show.
  console.log("→ Seeding demo client #3 (Command + roofing pack)…");
  const c3 = await upsertClient({
    email: "demo3@phxgrowth.com",
    name: "Rae Delgado",
    businessName: "Ironclad Roofing",
    industry: "Commercial Roofing",
    website: "https://ironcladroofing.example",
    adPlatforms: ["GOOGLE", "META"],
    goals: "Answer every storm lead before the competition and stop losing qualified jobs to silence.",
    voiceTone: "Straight-talking, no pressure, like a neighbour who happens to know roofs.",
    verticalKey: "roofing",
    agentsPlan: "command",
    adAccounts: [{ platform: "GOOGLE", name: "Ironclad — Google Ads" }],
  });
  await seedNightShiftDemo(c3.id);

  console.log("→ Seeding the revenue engine (a failure, a recovery, a pipeline)…");
  await seedRevenueDemo(c1.id, c3.id);

  console.log("✓ Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
