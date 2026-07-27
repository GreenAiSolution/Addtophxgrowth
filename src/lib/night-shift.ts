/**
 * The night shift — the desk working while nobody is logged in.
 *
 * DIRECTION
 *   Chat windows only work when someone shows up. The leap from "software we
 *   pay for" to "system we can't operate without" is the run that happens at
 *   3am: leads scored, risks flagged, and a brief waiting before the first
 *   coffee. This is also what makes unlimited runs on Command mean something
 *   concrete — an unattended nightly pass is only affordable without a meter.
 *
 * BLUEPRINTS
 *   Everything that decides *what the brief says* is pure and tested:
 *   `cadenceForPlan`, `isDue`, `selectLeadsToScore`, `parseScore`, `planBrief`.
 *   Only `runNightShift` touches the database or the model.
 *
 *   The brief is built from the scored data, not by a model. A model outage
 *   degrades the narrative summary to nothing; it never costs the client the
 *   call list. That ordering is deliberate — the list is the product.
 */

import { prisma } from "@/lib/prisma";
import { anthropic, ANTHROPIC_MODEL } from "@/lib/anthropic";
import { checkAgentRun, recordRun, getActiveSubscription } from "@/lib/entitlements";
import { memoryDigest } from "@/lib/memory";
import { resolveVertical } from "@/lib/verticals";
import { postWebhook } from "@/lib/webhooks";
import { sendNotification } from "@/lib/notify";
import { env } from "@/lib/env";

export type BriefCadence = "DAILY" | "WEEKLY";
export type BriefPriority = "HIGH" | "MEDIUM" | "LOW";

/** Never score more than this in one unattended pass. */
export const MAX_LEADS_PER_RUN = 25;
/** A scored lead nobody has touched in this long is going cold. */
export const STALE_AFTER_HOURS = 72;

export interface BriefSection {
  title: string;
  detail: string;
  priority: BriefPriority;
  leadId?: string;
}

export interface BriefPlan {
  headline: string;
  sections: BriefSection[];
}

export interface ScoredLead {
  id: string;
  name?: string | null;
  company?: string | null;
  score?: number | null;
  tier?: string | null;
  nextAction?: string | null;
  ageHours: number;
}

/**
 * Which cadence a tier earns. Command runs nightly — that is the concrete thing
 * its price buys. Scale gets a weekly pass. Launch gets none; it is the
 * clearest reason to move up.
 */
export function cadenceForPlan(planKey: string | null | undefined): BriefCadence | null {
  switch (planKey) {
    case "command":
      return "DAILY";
    case "scale":
      return "WEEKLY";
    default:
      return null;
  }
}

/** UTC midnight bucket — one brief per client per day. */
export function runDateFor(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export interface DueInput {
  cadence: BriefCadence;
  now: Date;
  briefHourUtc: number;
  /** runDate of the client's most recent completed brief, if any. */
  lastRunDate?: Date | null;
  /** Weekly briefs land on this UTC weekday (1 = Monday). */
  weeklyDay?: number;
}

/**
 * Whether a client is due a brief right now. The cron fires hourly; this is
 * what stops it producing 24 briefs a day.
 */
export function isDue({
  cadence,
  now,
  briefHourUtc,
  lastRunDate,
  weeklyDay = 1,
}: DueInput): boolean {
  if (now.getUTCHours() < briefHourUtc) return false;

  const today = runDateFor(now);
  if (lastRunDate && runDateFor(lastRunDate).getTime() >= today.getTime()) return false;

  if (cadence === "WEEKLY") {
    if (now.getUTCDay() !== weeklyDay) return false;
    // Don't re-run a weekly brief if one already went out in the last 6 days.
    if (lastRunDate) {
      const days = (today.getTime() - runDateFor(lastRunDate).getTime()) / 86_400_000;
      if (days < 6) return false;
    }
  }

  return true;
}

/** Oldest first — a lead that has waited longest is the one most at risk. */
export function selectLeadsToScore<T extends { createdAt: Date }>(
  leads: T[],
  cap = MAX_LEADS_PER_RUN,
): T[] {
  return [...leads]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, cap);
}

export interface ParsedScore {
  score: number | null;
  tier: string | null;
  reasoning: string | null;
  nextAction: string | null;
}

const TIERS = ["HOT", "WARM", "COLD", "DISQUALIFIED"];

/**
 * Pull structure out of the qualifier's answer. Tolerant by design: an
 * unparseable reply must degrade to "unscored, here is the raw text", never
 * throw and lose the whole night's work.
 */
export function parseScore(text: string): ParsedScore {
  const fallback: ParsedScore = {
    score: null,
    tier: null,
    reasoning: text.trim().slice(0, 2000) || null,
    nextAction: null,
  };
  if (!text.trim()) return fallback;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text.match(/\{[\s\S]*\}/)?.[0];
  if (candidate) {
    try {
      const obj = JSON.parse(candidate) as Record<string, unknown>;
      const rawScore = Number(obj.score);
      const rawTier = typeof obj.tier === "string" ? obj.tier.toUpperCase().trim() : null;
      return {
        score: Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : null,
        tier: rawTier && TIERS.includes(rawTier) ? rawTier : null,
        reasoning: typeof obj.reasoning === "string" ? obj.reasoning.slice(0, 2000) : fallback.reasoning,
        nextAction: typeof obj.nextAction === "string" ? obj.nextAction.slice(0, 500) : null,
      };
    } catch {
      /* fall through to the loose parse below */
    }
  }

  // Loose parse: "Score: 82" / "Tier: HOT" anywhere in prose.
  const scoreMatch = text.match(/score\D{0,10}(\d{1,3})/i);
  const tierMatch = text.match(/\b(HOT|WARM|COLD|DISQUALIFIED)\b/i);
  const score = scoreMatch ? Math.max(0, Math.min(100, Number(scoreMatch[1]))) : null;
  return {
    score,
    tier: tierMatch ? tierMatch[1].toUpperCase() : null,
    reasoning: fallback.reasoning,
    nextAction: null,
  };
}

function leadLabel(l: ScoredLead): string {
  return [l.name, l.company].filter(Boolean).join(" — ") || "Unnamed lead";
}

export interface BriefInput {
  businessName: string;
  cadence: BriefCadence;
  /** Leads scored during this run. */
  scored: ScoredLead[];
  /** Previously scored leads nobody has moved on. */
  open: ScoredLead[];
}

/**
 * Pure: turn scored data into the brief. No model involved — this is the part
 * that must work every single morning.
 */
export function planBrief({ businessName, cadence, scored, open }: BriefInput): BriefPlan {
  const sections: BriefSection[] = [];

  const hot = scored.filter((l) => (l.score ?? 0) >= 80).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const warm = scored.filter((l) => (l.score ?? 0) >= 60 && (l.score ?? 0) < 80);
  const stale = open
    .filter((l) => l.ageHours >= STALE_AFTER_HOURS && (l.score ?? 0) >= 60)
    .sort((a, b) => b.ageHours - a.ageHours);
  const unparsed = scored.filter((l) => l.score == null);

  for (const l of hot.slice(0, 5)) {
    sections.push({
      title: `Call ${leadLabel(l)} first — scored ${l.score}`,
      detail:
        l.nextAction ??
        "Scored in the top band overnight. Get a senior rep on the phone before your competitor does.",
      priority: "HIGH",
      leadId: l.id,
    });
  }

  if (stale.length > 0) {
    sections.push({
      title: `${stale.length} qualified lead${stale.length === 1 ? "" : "s"} going cold`,
      detail: `Scored over ${STALE_AFTER_HOURS} hours ago and still untouched: ${stale
        .slice(0, 6)
        .map((l) => `${leadLabel(l)} (${Math.round(l.ageHours / 24)}d)`)
        .join(", ")}. These were worth calling when they came in and still are.`,
      priority: "HIGH",
    });
  }

  if (warm.length > 0) {
    sections.push({
      title: `${warm.length} warm lead${warm.length === 1 ? "" : "s"} for the cadence`,
      detail: `${warm
        .slice(0, 8)
        .map(leadLabel)
        .join(", ")} — real need, softer timeline. Start the follow-up sequence rather than burning a call slot.`,
      priority: "MEDIUM",
    });
  }

  if (unparsed.length > 0) {
    sections.push({
      title: `${unparsed.length} lead${unparsed.length === 1 ? "" : "s"} need a human read`,
      detail:
        "The qualifier couldn't score these confidently — usually too little information in the form fill. Worth 30 seconds of your eyes.",
      priority: "MEDIUM",
    });
  }

  if (sections.length === 0) {
    sections.push({
      title: "Quiet night — nothing needs you",
      detail:
        "No new leads and nothing going cold. The desk checked; there is genuinely nothing to action this morning.",
      priority: "LOW",
    });
  }

  const window = cadence === "DAILY" ? "overnight" : "this week";
  const urgent = hot.length + stale.length;
  const headline =
    scored.length === 0 && stale.length === 0
      ? `Nothing new ${window} for ${businessName}.`
      : `${scored.length} lead${scored.length === 1 ? "" : "s"} scored ${window}. ${
          urgent === 0
            ? "Nothing urgent."
            : `${urgent} need${urgent === 1 ? "s" : ""} attention before 10am.`
        }`;

  return { headline, sections };
}

// ---------------------------------------------------------------------------
// The impure runner
// ---------------------------------------------------------------------------

const QUALIFIER_SLUG = "lead-qualifier";

const JSON_INSTRUCTION = [
  "\n\nYou are running unattended as part of an overnight batch. Nobody will read a conversational reply.",
  "Respond with ONLY a fenced ```json block containing:",
  '{ "score": <0-100 integer>, "tier": "HOT"|"WARM"|"COLD"|"DISQUALIFIED", "reasoning": "<2 sentences>", "nextAction": "<who does what, by when>" }',
  "No prose before or after the block.",
].join(" ");

function leadToPrompt(lead: {
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  message: string | null;
  source: string;
  createdAt: Date;
}): string {
  return [
    `Source: ${lead.source}`,
    `Received: ${lead.createdAt.toISOString()}`,
    `Name: ${lead.name ?? "(not given)"}`,
    `Company: ${lead.company ?? "(not given)"}`,
    `Email: ${lead.email ?? "(not given)"}`,
    `Phone: ${lead.phone ?? "(not given)"}`,
    `Message: ${lead.message ?? "(none)"}`,
  ].join("\n");
}

/** The qualifier's system prompt for one tenant. Shared by both scoring paths. */
export function qualifierSystemPrompt(
  basePrompt: string,
  client: { businessName: string; industry?: string | null; voiceTone?: string | null; verticalKey?: string | null },
  memory: string,
): string {
  const pack = resolveVertical(client);
  return [
    basePrompt,
    client.businessName ? `Client business: ${client.businessName} (${client.industry ?? "n/a"}).` : "",
    client.voiceTone ? `Brand voice to honor: ${client.voiceTone}` : "",
    pack ? `\n\nQualification bar for this business:\n${pack.assetBodies["asset-qualification-rubric"]}` : "",
    memory,
    JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Run the qualifier against one lead and persist the result. Meters the run. */
async function scoreAndPersist(
  clientId: string,
  lead: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
    message: string | null;
    source: string;
    createdAt: Date;
  },
  systemPrompt: string,
): Promise<ParsedScore> {
  const res = await anthropic().messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 700,
    system: systemPrompt,
    messages: [{ role: "user", content: leadToPrompt(lead) }],
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const parsed = parseScore(text);
  await recordRun(clientId, QUALIFIER_SLUG, res.usage.input_tokens, res.usage.output_tokens);

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      status: "SCORED",
      score: parsed.score,
      tier: parsed.tier,
      reasoning: parsed.reasoning,
      nextAction: parsed.nextAction,
      scoredAt: new Date(),
    },
  });

  return parsed;
}

export type ScoreLeadOutcome =
  | { ok: true; parsed: ParsedScore }
  | { ok: false; reason: "NOT_FOUND" | "ALREADY_SCORED" | "NOT_ALLOWED" | "ERROR"; detail?: string };

/**
 * Score a single lead on demand — the same code path the night shift uses, so a
 * Launch client scoring by hand and a Command client scoring at 3am get
 * identical output. Tiers without a night shift would otherwise have leads pile
 * up unscored forever, which is exactly the hole this closes.
 */
export async function scoreLeadNow(clientId: string, leadId: string): Promise<ScoreLeadOutcome> {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, clientId } });
  if (!lead) return { ok: false, reason: "NOT_FOUND" };
  if (lead.scoredAt) return { ok: false, reason: "ALREADY_SCORED" };

  // The manual path is metered exactly like the unattended one.
  const availability = await checkAgentRun(clientId, QUALIFIER_SLUG);
  if (!availability.allowed) {
    return { ok: false, reason: "NOT_ALLOWED", detail: availability.reason };
  }

  const [client, agent, digest] = await Promise.all([
    prisma.clientProfile.findUnique({
      where: { id: clientId },
      select: { businessName: true, industry: true, verticalKey: true, voiceTone: true },
    }),
    prisma.agentDefinition.findUnique({ where: { slug: QUALIFIER_SLUG } }),
    memoryDigest(clientId),
  ]);
  if (!client || !agent) return { ok: false, reason: "ERROR", detail: "Agent not seeded" };

  try {
    const parsed = await scoreAndPersist(
      clientId,
      lead,
      qualifierSystemPrompt(agent.baseSystemPrompt, client, digest),
    );
    return { ok: true, parsed };
  } catch (err) {
    console.error(`[score-lead] failed for ${leadId}:`, err);
    return { ok: false, reason: "ERROR", detail: (err as Error).message };
  }
}

export interface NightShiftResult {
  clientId: string;
  status: "COMPLETE" | "SKIPPED" | "FAILED";
  reason?: string;
  leadsScored?: number;
  briefId?: string;
}

/**
 * Run one client's night shift. Idempotent per (clientId, runDate) — the cron
 * fires hourly and Vercel retries, so this must be safe to call repeatedly.
 */
export async function runNightShift(clientId: string, now = new Date()): Promise<NightShiftResult> {
  const client = await prisma.clientProfile.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      businessName: true,
      industry: true,
      verticalKey: true,
      voiceTone: true,
      nightShiftEnabled: true,
      briefHourUtc: true,
    },
  });
  if (!client) return { clientId, status: "SKIPPED", reason: "No such client" };
  if (!client.nightShiftEnabled) return { clientId, status: "SKIPPED", reason: "Disabled" };

  const sub = await getActiveSubscription(clientId, "AI_AGENTS");
  const cadence = cadenceForPlan(sub?.planKey);
  if (!cadence) return { clientId, status: "SKIPPED", reason: "Tier has no night shift" };

  const runDate = runDateFor(now);
  const lastCompleted = await prisma.briefRun.findFirst({
    where: { clientId, status: "COMPLETE" },
    orderBy: { runDate: "desc" },
    select: { runDate: true },
  });
  if (
    !isDue({ cadence, now, briefHourUtc: client.briefHourUtc, lastRunDate: lastCompleted?.runDate })
  ) {
    return { clientId, status: "SKIPPED", reason: "Not due" };
  }

  // Claim the slot. The unique constraint makes a concurrent second cron a
  // no-op rather than a duplicate brief.
  const existing = await prisma.briefRun.findUnique({
    where: { clientId_runDate: { clientId, runDate } },
    select: { id: true, status: true },
  });
  if (existing?.status === "COMPLETE") {
    return { clientId, status: "SKIPPED", reason: "Already ran today", briefId: existing.id };
  }
  const brief =
    existing ??
    (await prisma.briefRun.create({
      data: { clientId, runDate, cadence, status: "PENDING" },
      select: { id: true, status: true },
    }));

  try {
    const [agent, digest, newLeads] = await Promise.all([
      prisma.agentDefinition.findUnique({ where: { slug: QUALIFIER_SLUG } }),
      memoryDigest(clientId),
      prisma.lead.findMany({
        where: { clientId, status: "NEW" },
        orderBy: { createdAt: "asc" },
        take: MAX_LEADS_PER_RUN * 2,
      }),
    ]);
    if (!agent) throw new Error("lead-qualifier agent definition is not seeded");

    const systemPrompt = qualifierSystemPrompt(agent.baseSystemPrompt, client, digest);

    const queue = selectLeadsToScore(newLeads);
    const scored: ScoredLead[] = [];

    for (const lead of queue) {
      // Respect the meter even unattended — an overnight batch must never
      // silently blow through a client's plan limit.
      const availability = await checkAgentRun(clientId, QUALIFIER_SLUG);
      if (!availability.allowed) break;

      let parsed: ParsedScore;
      try {
        parsed = await scoreAndPersist(clientId, lead, systemPrompt);
      } catch (err) {
        console.error(`[night-shift] scoring failed for lead ${lead.id}:`, err);
        continue; // one bad lead must not end the night
      }

      scored.push({
        id: lead.id,
        name: lead.name,
        company: lead.company,
        score: parsed.score,
        tier: parsed.tier,
        nextAction: parsed.nextAction,
        ageHours: (now.getTime() - lead.createdAt.getTime()) / 3_600_000,
      });
    }

    // Previously scored leads nobody has closed out.
    const openLeads = await prisma.lead.findMany({
      where: {
        clientId,
        status: { in: ["SCORED", "WORKING"] },
        id: { notIn: scored.map((s) => s.id) },
      },
      orderBy: { scoredAt: "asc" },
      take: 100,
    });

    const plan = planBrief({
      businessName: client.businessName,
      cadence,
      scored,
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

    // Narrative summary is a bonus, never a dependency.
    let summary: string | null = null;
    try {
      const res = await anthropic().messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 400,
        system:
          "You write a two-paragraph morning brief for a busy business owner. Plain English, no preamble, no bullet lists, no flattery. Say what happened and what to do first. Never invent numbers beyond what you are given.",
        messages: [
          {
            role: "user",
            content: `Business: ${client.businessName}\nHeadline: ${plan.headline}\n\nItems:\n${plan.sections
              .map((s) => `- [${s.priority}] ${s.title}: ${s.detail}`)
              .join("\n")}`,
          },
        ],
      });
      summary = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    } catch (err) {
      console.warn("[night-shift] summary unavailable, shipping the brief anyway:", err);
    }

    await prisma.briefRun.update({
      where: { id: brief.id },
      data: {
        status: "COMPLETE",
        leadsScored: scored.length,
        headline: plan.headline,
        summary,
        sections: plan.sections as unknown as object,
        completedAt: new Date(),
      },
    });

    await postWebhook(
      env.zapierOnboardHook,
      {
        source: "night_shift_complete",
        clientId,
        cadence,
        leadsScored: scored.length,
        headline: plan.headline,
        at: new Date().toISOString(),
      },
      { label: "zapier-night-shift" },
    );

    // The whole promise is "waiting before your first coffee" — which only
    // works if something tells them it's there. Skipped when the brief has
    // nothing to say, because a daily "nothing happened" email is how people
    // learn to filter you.
    if (plan.sections.some((sec) => sec.priority !== "LOW")) {
      const recipient = await prisma.clientProfile.findUnique({
        where: { id: clientId },
        select: { user: { select: { email: true } } },
      });
      await sendNotification({
        kind: "BRIEF_READY",
        to: recipient?.user.email,
        payload: {
          businessName: client.businessName,
          title: plan.headline,
          detail: summary ?? undefined,
          lines: plan.sections.filter((sec) => sec.priority === "HIGH").map((sec) => sec.title),
          path: "/app/brief",
        },
      });
    }

    return { clientId, status: "COMPLETE", leadsScored: scored.length, briefId: brief.id };
  } catch (err) {
    console.error("[night-shift] run failed:", err);
    await prisma.briefRun.update({
      where: { id: brief.id },
      data: { status: "FAILED", error: (err as Error).message.slice(0, 1000) },
    });
    return { clientId, status: "FAILED", reason: (err as Error).message, briefId: brief.id };
  }
}

/** Clients whose tier includes a night shift, for the cron to walk. */
export async function nightShiftRoster(): Promise<string[]> {
  const subs = await prisma.subscription.findMany({
    where: {
      lineKey: "AI_AGENTS",
      status: { in: ["ACTIVE", "TRIALING"] },
      planKey: { in: ["scale", "command"] },
    },
    select: { clientId: true },
  });
  return subs.map((s) => s.clientId);
}
