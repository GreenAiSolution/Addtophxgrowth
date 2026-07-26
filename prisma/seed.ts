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
  agentsPlan?: string;
  adOpsPlan?: string;
  adAccounts: { platform: string; name: string }[];
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
      onboardedAt: new Date(),
    },
    create: {
      userId: user.id,
      businessName: opts.businessName,
      industry: opts.industry,
      website: opts.website,
      adPlatforms: opts.adPlatforms,
      goals: opts.goals,
      voiceTone: opts.voiceTone,
      onboardedAt: new Date(),
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
    const account = await prisma.adAccount.upsert({
      where: { id: `${client.id}-${acc.platform}` },
      update: { name: acc.name },
      create: { id: `${client.id}-${acc.platform}`, clientId: client.id, platform: acc.platform, name: acc.name },
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
      { platform: "META", name: "Peak — Meta Ads" },
      { platform: "GOOGLE", name: "Peak — Google Ads" },
    ],
  });
  await seedSampleConversation(c1.id);

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
