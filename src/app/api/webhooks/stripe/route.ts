import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { planByKey } from "@/lib/catalog";
import { provisionPlan } from "@/lib/provisioning";
import type { ProductLineKey, SubscriptionStatus } from "@prisma/client";

/**
 * Stripe webhook — the DB subscription state is the source of truth for feature
 * gating. We reconcile on: checkout.session.completed,
 * customer.subscription.updated/deleted, invoice.paid.
 */
export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, sig, env.stripeWebhookSecret);
  } catch (err) {
    console.warn("[stripe] signature verification failed:", (err as Error).message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const sub = await stripe().subscriptions.retrieve(session.subscription as string);
          await upsertSubscription(sub);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await upsertSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          const sub = await stripe().subscriptions.retrieve(invoice.subscription as string);
          await upsertSubscription(sub);
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("[stripe] handler error:", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

const STATUS_MAP: Record<string, SubscriptionStatus> = {
  active: "ACTIVE",
  trialing: "TRIALING",
  past_due: "PAST_DUE",
  canceled: "CANCELED",
  unpaid: "PAST_DUE",
  incomplete: "INCOMPLETE",
  incomplete_expired: "CANCELED",
};

async function upsertSubscription(sub: Stripe.Subscription) {
  const clientId = sub.metadata?.clientId;
  const planKey = sub.metadata?.planKey;
  const lineKey = sub.metadata?.lineKey as ProductLineKey | undefined;

  if (!clientId || !planKey || !lineKey) {
    // Fall back to resolving via the price id if metadata is absent.
    console.warn("[stripe] subscription missing metadata; skipping", sub.id);
    return;
  }
  const plan = planByKey(planKey);
  if (!plan) return;

  const status = STATUS_MAP[sub.status] ?? "INCOMPLETE";
  const priceId = sub.items.data[0]?.price.id ?? null;

  const sub2 = await prisma.subscription.upsert({
    where: { clientId_lineKey: { clientId, lineKey } },
    update: {
      planKey,
      status,
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
    create: {
      clientId,
      lineKey,
      planKey,
      status,
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
  });

  // Automatic fulfilment: the moment the subscription is live, deploy the
  // tier's system. Idempotent, so Stripe retries and tier upgrades are safe.
  // Never let a provisioning failure fail the webhook — Stripe would retry the
  // whole event, and the subscription state above is already correct.
  if (status === "ACTIVE" || status === "TRIALING") {
    try {
      const result = await provisionPlan(clientId, planKey);
      console.info(
        `[stripe] provisioned ${result.planKey} for ${clientId} (+${result.created})`,
      );
    } catch (err) {
      console.error("[stripe] provisioning failed (subscription is still active):", err);
    }
  }

  return sub2;
}
