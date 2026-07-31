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


/**
 * The Voice Employee, with a fortnight of calls behind it.
 *
 * A fresh install where every voice screen is empty makes it impossible to tell
 * a working system from an unwired one, and it hides the whole argument: the
 * refusals. So the demo data is chosen to show what the operator *would not*
 * do — a call that handed over, one that opted out, one it declined to price —
 * alongside the ones that went well.
 */
async function seedVoiceDemo(clientId: string, businessName: string) {
  const { defaultPlaybook, playbookSchema } = await import("../src/lib/voice");
  const { priceBookSchema } = await import("../src/lib/estimates");
  const { calendarSchema } = await import("../src/lib/booking");

  const playbook = playbookSchema.parse({
    ...defaultPlaybook({
      businessName,
      services: ["Strategy calls", "Group coaching", "Corporate workshops"],
      serviceArea: ["Phoenix", "Scottsdale", "Tempe", "Mesa"],
      hours: "Monday to Friday, 8am to 4pm",
      tone: "Confident, direct, motivational — no fluff.",
    }),
    transferNumber: "602 555 0100",
    answers: [
      {
        q: "Do you do payment plans?",
        a: "Yes — three or six months, interest free. The team will lay the options out on the call.",
      },
    ],
  });

  await prisma.voicePlaybook.upsert({
    where: { clientId_version: { clientId, version: 1 } },
    update: {},
    create: {
      clientId,
      version: 1,
      active: true,
      payload: playbook as never,
      note: "Seeded starting playbook — demo data",
      createdBy: "seed",
    },
  });

  const priceBook = priceBookSchema.parse({
    callOutFeeCents: 0,
    minimumJobCents: 25_000,
    items: [
      { key: "strategy_call", label: "Strategy call", unit: "each", rateCents: 35_000, minQty: 0, aliases: ["session", "consult"] },
      { key: "group_program", label: "Group programme", unit: "each", rateCents: 240_000, minQty: 0, aliases: ["group"] },
      { key: "workshop_day", label: "Corporate workshop", unit: "day", rateCents: 480_000, minQty: 1, aliases: ["workshop", "training day"] },
    ],
    rangeSpreadPct: 15,
    maxSpokenTotalCents: 600_000,
    disclaimer: "That's an estimate from what you've described — we confirm the final price in writing.",
  });

  await prisma.voicePriceBook.upsert({
    where: { clientId_version: { clientId, version: 1 } },
    update: {},
    create: {
      clientId,
      version: 1,
      active: true,
      payload: priceBook as never,
      note: "Seeded price book — demo data",
      createdBy: "seed",
    },
  });

  await prisma.bookingCalendar.upsert({
    where: { clientId },
    create: {
      clientId,
      payload: calendarSchema.parse({
        utcOffsetMinutes: -420,
        days: [1, 2, 3, 4, 5],
        startHour: 8,
        endHour: 16,
        slotMinutes: 60,
        leadTimeHours: 4,
        maxPerDay: 5,
        note: "We'll text you when we're half an hour out.",
      }) as never,
      updatedBy: "seed",
    },
    update: {},
  });

  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
  const demoCalls = [
    {
      key: "seed-booked",
      from: "+16025550111",
      outcome: "BOOKED" as const,
      captured: { caller_name: "Dana Reyes", callback_number: "6025550111", job_address: "12 Palm Ave, Tempe", job_description: "Wants a strategy call before Q4" },
      turns: [
        { role: "caller", text: "Hi, I saw your ad — I'm after a strategy session." },
        { role: "operator", text: "Happy to help. Can I take your name?" },
        { role: "caller", text: "Dana Reyes." },
        { role: "operator", text: "Thanks Dana. I can do Thursday the 6th at 9am, or Friday the 7th at 1pm." },
        { role: "caller", text: "Thursday works." },
        { role: "operator", text: "Booked you in for Thursday the 6th at 9am." },
      ],
      startedAt: hoursAgo(30),
      grade: { score: 100, clean: true, headline: "Clean call, booked." },
    },
    {
      key: "seed-handoff",
      from: "+16025550122",
      outcome: "HANDED_OFF" as const,
      captured: { caller_name: "Mo Idris" },
      turns: [
        { role: "caller", text: "Are you a robot? I want to talk to an actual person." },
        { role: "operator", text: "Of course — let me put you through to somebody now, one moment." },
      ],
      startedAt: hoursAgo(26),
      grade: { score: 100, clean: true, headline: "Clean call, handed to a person as it should have been." },
    },
    {
      key: "seed-refused-price",
      from: "+16025550133",
      outcome: "MESSAGE_TAKEN" as const,
      captured: { caller_name: "Priya Shah", callback_number: "6025550133", job_description: "Wants a bespoke twelve-month programme" },
      turns: [
        { role: "caller", text: "What would a full year of coaching for my whole leadership team run to?" },
        { role: "operator", text: "A job that size deserves a proper look rather than a phone number — let me get somebody to price it for you." },
      ],
      startedAt: hoursAgo(20),
      unpriced: ["Priced above the $6,000 cap for quoting on a call."],
      grade: { score: 100, clean: true, headline: "Clean call, message taken." },
    },
    {
      key: "seed-optout",
      to: "+16025550144",
      direction: "OUTBOUND" as const,
      outcome: "OPTED_OUT" as const,
      captured: {},
      turns: [
        { role: "caller", text: "Take me off your list, please." },
        { role: "operator", text: "Understood — I'll take you off the list and you won't hear from us again. Sorry to have bothered you." },
      ],
      startedAt: hoursAgo(14),
      grade: { score: 100, clean: true, headline: "Opt-out honoured and recorded." },
    },
    {
      key: "seed-abandoned",
      from: "+16025550155",
      outcome: "ABANDONED" as const,
      captured: {},
      turns: [{ role: "caller", text: "Hello?" }],
      startedAt: hoursAgo(6),
      textBack: true,
      grade: { score: 95, clean: true, headline: "They hung up before it went anywhere." },
    },
  ];

  for (const c of demoCalls) {
    const providerCallId = `${clientId}:${c.key}`;
    const existing = await prisma.voiceCall.findUnique({ where: { providerCallId } });
    if (existing) continue;

    await prisma.voiceCall.create({
      data: {
        clientId,
        providerCallId,
        provider: "twilio",
        direction: c.direction ?? "INBOUND",
        purpose: c.direction === "OUTBOUND" ? "reactivate" : "answer",
        fromNumber: c.from ?? null,
        toNumber: c.to ?? null,
        startedAt: c.startedAt,
        endedAt: new Date(c.startedAt.getTime() + 3 * 60_000),
        durationSec: 180,
        outcome: c.outcome,
        captured: c.captured as never,
        turns: c.turns as never,
        playbookVersion: 1,
        priceBookVersion: 1,
        unpricedItems: c.unpriced ?? [],
        textBackSentAt: c.textBack ? new Date(c.startedAt.getTime() + 20_000) : null,
        textBackStatus: c.textBack ? "sent" : null,
        gradeScore: c.grade.score,
        gradeClean: c.grade.clean,
        gradeHeadline: c.grade.headline,
        gradeFindings: [] as never,
        gradedAt: new Date(c.startedAt.getTime() + 4 * 3_600_000),
      },
    });
  }

  // One estimate priced on a call, still waiting for somebody to send it.
  const estimateExists = await prisma.voiceEstimate.findFirst({ where: { clientId } });
  if (!estimateExists) {
    await prisma.voiceEstimate.create({
      data: {
        clientId,
        customerName: "Dana Reyes",
        customerPhone: "6025550111",
        jobDescription: "Strategy call plus a half-day team workshop",
        payload: {
          customer: { name: "Dana Reyes", phone: "6025550111", address: null },
          job: "Strategy call plus a half-day team workshop",
          lines: [
            { label: "Strategy call", qty: 1, unit: "each", rate: "$350", total: "$350", note: null },
            { label: "Corporate workshop", qty: 1, unit: "per day", rate: "$4,800", total: "$4,800", note: null },
          ],
          total: "$5,150",
          range: "$4,375 – $5,925",
          confidence: "MEDIUM",
          confidenceWhy: "1 of 2 quantities were measured",
          quotedOnCall: "$4,375 to $5,925. That's an estimate from what you've described — we confirm the final price in writing.",
        } as never,
        totalCents: 515_000,
        lowCents: 437_500,
        highCents: 592_500,
        confidence: "MEDIUM",
        spoken:
          "$4,375 to $5,925. That's an estimate from what you've described — we confirm the final price in writing.",
        status: "DRAFT",
      },
    });
  }

  await prisma.doNotCallEntry.upsert({
    where: { clientId_phone: { clientId, phone: "6025550144" } },
    create: {
      clientId,
      phone: "6025550144",
      source: "call",
      reason: "Asked not to be contacted, on the call",
    },
    update: {},
  });

  console.log("   \u00b7 voice: playbook v1, price book v1, a diary, 5 calls, 1 estimate, 1 suppressed number");
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
  await seedVoiceDemo(c1.id, "Peak Performance Coaching");

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
