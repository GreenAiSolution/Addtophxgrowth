import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { planByKey } from "@/lib/catalog";
import { provisionPlan } from "@/lib/provisioning";
import {
  openPaymentIssue,
  closePaymentIssue,
  closeIssuesForSubscription,
} from "@/lib/dunning";
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
      case "customer.subscription.updated": {
        await upsertSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await upsertSubscription(sub);
        // The subscription is gone, so anything still open against it is not
        // going to be recovered. Marking it LOST is what stops the ladder
        // chasing a customer who no longer has an account.
        await closeIssuesForSubscription(sub.id, "LOST");
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        // Close first. The money is in, and a recovered invoice must stop the
        // dunning ladder even if the subscription re-sync below throws.
        await closePaymentIssue(invoice.id, "RECOVERED");
        if (invoice.subscription) {
          const sub = await stripe().subscriptions.retrieve(invoice.subscription as string);
          await upsertSubscription(sub);
        }
        break;
      }
      case "invoice.payment_failed": {
        // The event this handler ignored, and the single largest cause of
        // churn in any subscription business. See lib/dunning.ts.
        await recordFailedInvoice(event.data.object as Stripe.Invoice);
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

/**
 * Turn a failed invoice into a tracked payment issue.
 *
 * Resolves the tenant through the subscription's metadata, exactly like
 * `upsertSubscription` does, because the invoice itself does not carry it. An
 * invoice with no subscription is a one-off charge and has no dunning ladder;
 * it is logged rather than silently dropped, since a build fee failing is
 * still something somebody wants to know about.
 */
async function recordFailedInvoice(invoice: Stripe.Invoice) {
  if (!invoice.subscription) {
    console.warn("[stripe] invoice failed with no subscription; not tracked:", invoice.id);
    return;
  }

  const sub = await stripe().subscriptions.retrieve(invoice.subscription as string);
  const clientId = sub.metadata?.clientId;
  const lineKey = sub.metadata?.lineKey as ProductLineKey | undefined;
  if (!clientId || !lineKey) {
    console.warn("[stripe] failed invoice on a subscription with no metadata:", sub.id);
    return;
  }

  await openPaymentIssue({
    clientId,
    lineKey,
    stripeInvoiceId: invoice.id,
    stripeSubscriptionId: sub.id,
    amountCents: invoice.amount_due,
    currency: invoice.currency,
    attemptCount: invoice.attempt_count ?? 1,
    nextAttemptAt: invoice.next_payment_attempt
      ? new Date(invoice.next_payment_attempt * 1000)
      : null,
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
  });

  // Keep the subscription row in step — Stripe will have moved it to past_due.
  await upsertSubscription(sub);
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
