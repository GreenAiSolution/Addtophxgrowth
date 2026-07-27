import { prisma } from "@/lib/prisma";
import { blueprintFor, type SystemModule } from "@/lib/systems";
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

/** Pure: given the tier and what the client already has, decide the delta. */
export function planProvisioning(planKey: string, existingKeys: Set<string>): ProvisionPlan {
  const blueprint = blueprintFor(planKey);
  if (!blueprint) return { planKey, toCreate: [], toSkip: [] };

  const toCreate: SystemModule[] = [];
  const toSkip: SystemModule[] = [];
  for (const m of blueprint.modules) {
    (existingKeys.has(m.key) ? toSkip : toCreate).push(m);
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
}

/**
 * Provision (or top up) a client's system for a plan. Safe to call repeatedly.
 */
export async function provisionPlan(
  clientId: string,
  planKey: string,
): Promise<ProvisionResult> {
  const existing = await prisma.provisionedItem.findMany({
    where: { clientId },
    select: { moduleKey: true },
  });
  const plan = planProvisioning(planKey, new Set(existing.map((e) => e.moduleKey)));

  if (plan.toCreate.length === 0) {
    return { created: 0, skipped: plan.toSkip.length, planKey };
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
  // at their own endpoint without waiting on us.
  for (const m of plan.toCreate.filter((x) => x.kind === "INTEGRATION")) {
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
      provisioned: plan.toCreate.map((m) => m.key),
      at: new Date().toISOString(),
    },
    { label: "zapier-provisioned" },
  );

  console.info(
    `[provisioning] ${planKey} → client ${clientId}: ${plan.toCreate.length} created, ${plan.toSkip.length} already present`,
  );

  return { created: plan.toCreate.length, skipped: plan.toSkip.length, planKey };
}

/** What the client sees on their system page. */
export async function getProvisionedSystem(clientId: string) {
  return prisma.provisionedItem.findMany({
    where: { clientId },
    orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
  });
}
