import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireClient, AuthError } from "@/lib/tenancy";
import { planByKey } from "@/lib/catalog";
import { postWebhook } from "@/lib/webhooks";
import { notifyAgency } from "@/lib/notify";
import { env } from "@/lib/env";
import {
  priceCockpit,
  buildSheet,
  primaryPlanKey,
  matchesSignature,
  VALID_AGENT_PLANS,
  VALID_ADOPS_PLANS,
  VALID_ADDONS,
} from "@/lib/cockpit";
import { VERTICAL_PACKS } from "@/lib/verticals";

/**
 * Take a configured cockpit and turn it into something the agency can act on.
 *
 * Deliberately does NOT try to subscribe a client to both product lines in one
 * Stripe session. Each line is its own subscription in our data model, and the
 * webhook maps one Stripe subscription to one line — quietly creating two
 * subscriptions from one click would be both a schema lie and a nasty surprise
 * on a five-figure invoice. Instead: the primary line goes to checkout, and the
 * full build sheet is filed as a Request so the second line, the pairings and
 * the industry pack are picked up at onboarding, by a human, with the client.
 */

const VERTICAL_KEYS = VERTICAL_PACKS.map((v) => v.key);

const Body = z.object({
  agentsPlan: z.enum(VALID_AGENT_PLANS as [string, ...string[]]).nullable().optional(),
  adOpsPlan: z.enum(VALID_ADOPS_PLANS as [string, ...string[]]).nullable().optional(),
  addons: z.array(z.enum(VALID_ADDONS as [string, ...string[]])).max(20).optional(),
  verticalKey: z.enum(VERTICAL_KEYS as [string, ...string[]]).nullable().optional(),
});

export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid selection" }, { status: 400 });

  const selection = parsed.data;
  const quote = priceCockpit(selection);
  if (quote.isEmpty) {
    return NextResponse.json({ error: "Nothing selected" }, { status: 400 });
  }

  const signature = matchesSignature(selection);
  const sheet = buildSheet(selection, quote);

  // Remember the trade so provisioning uses the right industry pack.
  if (selection.verticalKey && selection.verticalKey !== client.verticalKey) {
    await prisma.clientProfile.update({
      where: { id: client.id },
      data: { verticalKey: selection.verticalKey },
    });
  }

  // File the build sheet. Upserted by title so re-configuring updates the same
  // request rather than burying the agency in near-duplicates.
  const title = `Cockpit build — ${signature ? signature.name : "custom"}`;
  const existing = await prisma.request.findFirst({
    where: { clientId: client.id, title, status: { not: "DELIVERED" } },
    select: { id: true },
  });
  if (existing) {
    await prisma.request.update({ where: { id: existing.id }, data: { body: sheet } });
  } else {
    await prisma.request.create({
      data: { clientId: client.id, kind: "OTHER", title, body: sheet },
    });
  }

  // Somebody just assembled a five-figure cockpit. That is the single most
  // sales-relevant event on the whole site and it used to be silent.
  await notifyAgency("COCKPIT_CONFIGURED", {
    businessName: client.businessName,
    title: signature ? signature.name : "Custom build",
    detail: sheet,
    path: `/admin/clients/${client.id}`,
  });

  await postWebhook(
    env.zapierOnboardHook,
    {
      source: "cockpit_configured",
      clientId: client.id,
      businessName: client.businessName,
      signature: signature?.key ?? null,
      selection,
      monthlyTotal: quote.monthlyTotal,
      oneTimeTotal: quote.oneTimeTotal,
      at: new Date().toISOString(),
    },
    { label: "zapier-cockpit" },
  );

  // Hand off to the existing checkout path for the primary subscription. If the
  // cockpit is pairings-only there is nothing to subscribe to — send them to
  // billing, where the filed request is already waiting.
  const primary = primaryPlanKey(selection);
  if (!primary) {
    return NextResponse.json({ url: "/app/billing?cockpit=filed" });
  }

  const plan = planByKey(primary);
  if (!plan) return NextResponse.json({ error: "Unknown plan" }, { status: 404 });

  const checkout = await fetch(`${env.appUrl}/api/checkout`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // Forward the caller's session so /api/checkout resolves the same tenant.
      cookie: req.headers.get("cookie") ?? "",
    },
    body: JSON.stringify({ planKey: plan.key }),
  });

  const data = (await checkout.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!checkout.ok || !data.url) {
    // Billing isn't wired up yet, but the build sheet is filed and real — say so
    // rather than dead-ending on a Stripe error the client can't act on.
    return NextResponse.json({ url: "/app/billing?cockpit=filed" });
  }

  return NextResponse.json({ url: data.url });
}
