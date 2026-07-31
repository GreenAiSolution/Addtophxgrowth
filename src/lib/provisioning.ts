import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { blueprintFor, type SystemModule } from "@/lib/systems";
import { applyVertical, resolveVertical, type VerticalPack } from "@/lib/verticals";
import { env } from "@/lib/env";
import { postWebhook } from "@/lib/webhooks";

/**
 * Automatic fulfilment. When a subscription goes active, the client's tier is
 * provisioned with no human step — this runs from the Stripe webhook.
 *
 * The decision of *what* to provision (`planProvisioning`) is a pure function
 * so it can be tested without a database; `provisionPlan` performs the writes.
 * Both are idempotent: Stripe retries webhooks, and upgrades re-run this
 * against a client who already owns part of the system.
 */

export interface ProvisionPlan {
  planKey: string;
  toCreate: SystemModule[];
  toSkip: SystemModule[];
}

/**
 * Pure: given the tier, what the client already has, and their industry pack,
 * decide the delta. The pack only rewrites module *content* (see
 * lib/verticals.ts) — it can never change which modules a tier provisions.
 */
export function planProvisioning(
  planKey: string,
  existingKeys: Set<string>,
  pack?: VerticalPack,
): ProvisionPlan {
  const blueprint = blueprintFor(planKey);
  if (!blueprint) return { planKey, toCreate: [], toSkip: [] };

  const toCreate: SystemModule[] = [];
  const toSkip: SystemModule[] = [];
  for (const m of blueprint.modules) {
    (existingKeys.has(m.key) ? toSkip : toCreate).push(applyVertical(m, pack));
  }
  return { planKey, toCreate, toSkip };
}

/** BUILD modules are scheduled work; INSTANT modules are live immediately. */
function statusFor(m: SystemModule) {
  return m.delivery === "INSTANT" ? "READY" : "SCHEDULED";
}

export interface ProvisionResult {
  created: number;
  skipped: number;
  planKey: string;
  /** Which industry pack shaped the delivered copy, if any. */
  verticalKey?: string | null;
}

/**
 * Provision (or top up) a client's system for a plan. Safe to call repeatedly.
 */
export async function provisionPlan(
  clientId: string,
  planKey: string,
): Promise<ProvisionResult> {
  const [client, existing] = await Promise.all([
    prisma.clientProfile.findUnique({
      where: { id: clientId },
      select: { verticalKey: true, industry: true, intakeToken: true },
    }),
    prisma.provisionedItem.findMany({ where: { clientId }, select: { moduleKey: true } }),
  ]);

  const pack = client ? resolveVertical(client) : undefined;
  const plan = planProvisioning(planKey, new Set(existing.map((e) => e.moduleKey)), pack);

  // The Lead Intake Webhook module promises a live endpoint; mint the token that
  // makes it real before anything references it. Only ever issued once.
  if (client && !client.intakeToken) {
    await prisma.clientProfile.update({
      where: { id: clientId },
      data: { intakeToken: randomBytes(24).toString("base64url") },
    });
  }

  if (plan.toCreate.length === 0) {
    return { created: 0, skipped: plan.toSkip.length, planKey, verticalKey: pack?.key ?? null };
  }

  await prisma.$transaction(
    plan.toCreate.map((m) =>
      prisma.provisionedItem.upsert({
        where: { clientId_moduleKey: { clientId, moduleKey: m.key } },
        update: {}, // never clobber an item the client has already customised
        create: {
          clientId,
          planKey,
          moduleKey: m.key,
          kind: m.kind,
          name: m.name,
          description: m.description,
          status: statusFor(m),
          agentSlug: m.agentSlug ?? null,
          payload: m.prompt
            ? { prompt: m.prompt }
            : m.body
              ? { body: m.body }
              : undefined,
        },
      }),
    ),
  );

  // Integrations get a real, editable config row so the client can point them
  // at their own endpoint without waiting on us. The two phone-desk modules
  // are the exception — a phone line isn't a webhook URL a client types in,
  // it's a real Twilio number an admin has to assign, so they get a PhoneLine
  // row instead (see below).
  for (const m of plan.toCreate.filter((x) => x.kind === "INTEGRATION" && !x.key.startsWith("integration-phone"))) {
    const already = await prisma.webhookConfig.findFirst({
      where: { clientId, label: m.name },
      select: { id: true },
    });
    if (!already) {
      await prisma.webhookConfig.create({
        data: { clientId, label: m.name, url: "", enabled: false },
      });
    }
  }

  // The Inbound Phone Line module provisions a disabled PhoneLine row — no
  // Twilio number yet (an admin assigns one once a real number is
  // purchased), off by default so nothing rings until the client turns it on
  // from /app/phone. Outbound gets folded onto the same row rather than a
  // second one; a tenant has exactly one phone desk.
  const wantsInbound = plan.toCreate.some((m) => m.key === "integration-phone-line");
  const wantsOutbound = plan.toCreate.some((m) => m.key === "integration-phone-outbound");
  if (wantsInbound || wantsOutbound) {
    await prisma.phoneLine.upsert({
      where: { clientId },
      update: wantsOutbound ? { outboundEnabled: true } : {},
      create: { clientId, outboundEnabled: wantsOutbound },
    });
  }

  // One kickoff request so the build phase lands in the agency queue.
  const buildModules = plan.toCreate.filter((m) => m.delivery === "BUILD");
  if (buildModules.length > 0) {
    const title = `Build kickoff — ${planKey}`;
    const existingRequest = await prisma.request.findFirst({
      where: { clientId, title },
      select: { id: true },
    });
    if (!existingRequest) {
      await prisma.request.create({
        data: {
          clientId,
          kind: "OTHER",
          title,
          body: [
            `Automatic provisioning finished for the ${planKey} tier.`,
            "",
            "Instant modules are live in the client's console. Scheduled build work:",
            ...buildModules.map((m) => `• ${m.name} — ${m.description}`),
          ].join("\n"),
        },
      });
    }
  }

  // Notify the agency's automation stack (Zapier → HubSpot, Slack, etc.).
  await postWebhook(
    env.zapierOnboardHook,
    {
      source: "system_provisioned",
      clientId,
      planKey,
      verticalKey: pack?.key ?? null,
      provisioned: plan.toCreate.map((m) => m.key),
      at: new Date().toISOString(),
    },
    { label: "zapier-provisioned" },
  );

  console.info(
    `[provisioning] ${planKey}${pack ? ` (${pack.key})` : ""} → client ${clientId}: ${plan.toCreate.length} created, ${plan.toSkip.length} already present`,
  );

  return {
    created: plan.toCreate.length,
    skipped: plan.toSkip.length,
    planKey,
    verticalKey: pack?.key ?? null,
  };
}

/** What the client sees on their system page. */
export async function getProvisionedSystem(clientId: string) {
  return prisma.provisionedItem.findMany({
    where: { clientId },
    orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
  });
}
