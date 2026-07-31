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
  /** Switch on The Comeback re-approach loop for this tenant. */
  comebackEnabled?: boolean;
  /** Switch on the Estimator, with its pricing settings. */
  estimatorEnabled?: boolean;
  taxRatePct?: number;
  depositPct?: number;
  travelFeeCents?: number;
  minJobCents?: number;
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
      comebackEnabled: opts.comebackEnabled ?? false,
      estimatorEnabled: opts.estimatorEnabled ?? false,
      taxRatePct: opts.taxRatePct ?? 0,
      depositPct: opts.depositPct ?? 0,
      travelFeeCents: opts.travelFeeCents ?? 0,
      minJobCents: opts.minJobCents ?? null,
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
      comebackEnabled: opts.comebackEnabled ?? false,
      estimatorEnabled: opts.estimatorEnabled ?? false,
      taxRatePct: opts.taxRatePct ?? 0,
      depositPct: opts.depositPct ?? 0,
      travelFeeCents: opts.travelFeeCents ?? 0,
      minJobCents: opts.minJobCents ?? null,
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
 * Give demo client #3 a handful of real past customers — won jobs with a
 * contactable lead behind each — then run the actual Comeback pass against them,
 * so /app/gate opens with genuine re-approaches waiting rather than an empty
 * queue. As with the memory and Spend Watch demos, the proposals are produced by
 * production code (lib/comeback.ts → the gate), so the demo can't drift from what
 * the system would really queue. Guarded on the won-customer count so re-seeding
 * doesn't stack duplicate history.
 */
async function seedComebackDemo(clientId: string) {
  const already = await prisma.dealOutcome.count({
    where: { clientId, outcome: "WON", leadId: { not: null } },
  });
  if (already > 0) return;

  const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

  // roofing's interval is 365 days. One customer sits inside the reminder
  // window (annual inspection due), two are long dormant (win-back), and one is
  // too recent to contact — so the pass has something to include and something
  // to correctly leave alone.
  const pastJobs: { name: string; company: string; daysSince: number; value: number; phone: string }[] = [
    { name: "Glen Marsh", company: "Marsh Residence", daysSince: 358, value: 1_540_000, phone: "+1 602 555 0143" },
    { name: "Yara Nakamura", company: "Nakamura Property", daysSince: 690, value: 1_210_000, phone: "+1 602 555 0188" },
    { name: "Ed Boone", company: "Boone Ranch", daysSince: 830, value: 2_060_000, phone: "+1 602 555 0207" },
    { name: "Tessa Fields", company: "Fields Residence", daysSince: 45, value: 980_000, phone: "+1 602 555 0251" },
  ];

  for (const j of pastJobs) {
    const lead = await prisma.lead.create({
      data: {
        clientId,
        source: "google-ads",
        name: j.name,
        company: j.company,
        email: `${j.name.split(" ")[0].toLowerCase()}@example.com`,
        phone: j.phone,
        message: "Full roof replacement, insurance claim.",
        status: "WON",
        score: 88,
        tier: "HOT",
        scoredAt: daysAgo(j.daysSince + 3),
        createdAt: daysAgo(j.daysSince + 5),
      },
    });
    await prisma.dealOutcome.create({
      data: {
        clientId,
        leadId: lead.id,
        outcome: "WON",
        valueCents: j.value,
        scoreAtQualification: 88,
        tierAtQualification: "HOT",
        source: "google-ads",
        createdAt: daysAgo(j.daysSince),
      },
    });
  }

  // Run the real loop. It proposes through the gate exactly as the hourly cron
  // would, so the queue fills with production output, not hand-written rows.
  const { runComeback } = await import("../src/lib/comeback");
  const result = await runComeback(clientId);
  console.log(
    `   · Comeback considered ${result.considered ?? 0} past customers, queued ${result.queued ?? 0}`,
  );
}

/**
 * Give demo client #3 a real rate card and produce one live estimate through the
 * actual Estimator code path, so /app/gate opens with a real quote.send waiting
 * behind the gate — produced by production pricing, not hand-typed. Guarded on
 * the rate-card count so re-seeding doesn't duplicate.
 */
async function seedEstimatorDemo(clientId: string) {
  const already = await prisma.rateCardItem.count({ where: { clientId } });
  if (already > 0) return;

  const items: { key: string; name: string; unit: string; unitPriceCents: number; minPriceCents?: number }[] = [
    { key: "roof-replacement-tile", name: "Tile roof replacement", unit: "square", unitPriceCents: 65_000 },
    { key: "roof-replacement-shingle", name: "Shingle roof replacement", unit: "square", unitPriceCents: 42_000 },
    { key: "roof-inspection", name: "Roof inspection & report", unit: "job", unitPriceCents: 0, minPriceCents: 15_000 },
    { key: "leak-repair", name: "Leak repair", unit: "job", unitPriceCents: 65_000 },
    { key: "roof-coating", name: "Elastomeric roof coating", unit: "sqft", unitPriceCents: 120 },
    { key: "gutter-replacement", name: "Gutter replacement", unit: "linear_ft", unitPriceCents: 1_800 },
  ];

  for (const it of items) {
    await prisma.rateCardItem.create({
      data: {
        clientId,
        key: it.key,
        name: it.name,
        unit: it.unit,
        unitPriceCents: it.unitPriceCents,
        minPriceCents: it.minPriceCents ?? 0,
      },
    });
  }

  // One real quote through the production path: a 22-square tile re-roof with an
  // inspection, for a walk-in. It prices, then lands at the gate as quote.send.
  const { createEstimate } = await import("../src/lib/estimate");
  const result = await createEstimate({
    clientId,
    customerName: "Priya Shah",
    customerEmail: "priya.shah@example.com",
    customerPhone: "+1 602 555 0311",
    requests: [
      { key: "roof-replacement-tile", qty: 22 },
      { key: "roof-inspection", qty: 1 },
    ],
    notes: "Two-story tile home, north Scottsdale. Insurance claim in progress.",
    dedupeKey: "estimate:seed-priya-shah",
  });
  if (result.ok) {
    console.log(`   · Estimator priced a quote of $${(result.priced.totalCents / 100).toFixed(2)} → gate quote.send`);
  } else {
    console.log(`   · Estimator demo skipped: ${result.reason}`);
  }
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
    comebackEnabled: true,
    estimatorEnabled: true,
    taxRatePct: 8.6,
    depositPct: 25,
    travelFeeCents: 7_500,
    minJobCents: 50_000,
    adAccounts: [{ platform: "GOOGLE", name: "Ironclad — Google Ads" }],
  });
  await seedNightShiftDemo(c3.id);
  await seedComebackDemo(c3.id);
  await seedEstimatorDemo(c3.id);

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
