import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import { requireClient, AuthError } from "@/lib/tenancy";
import { planByKey } from "@/lib/catalog";

const Body = z.object({ planKey: z.string() });

/**
 * Start a Stripe Checkout session for a plan. Requires an authenticated client;
 * marketing visitors get a 401 and are redirected to /login by the caller.
 */
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
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const plan = planByKey(parsed.data.planKey);
  if (!plan) return NextResponse.json({ error: "Unknown plan" }, { status: 404 });

  const priceId = process.env[plan.stripePriceEnv];
  if (!priceId || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Billing not configured. Set STRIPE_SECRET_KEY and price env vars." },
      { status: 503 },
    );
  }

  // Ensure the client has a Stripe customer.
  let customerId = client.stripeCustomerId;
  if (!customerId) {
    const user = await prisma.user.findUnique({ where: { id: client.userId } });
    const customer = await stripe().customers.create({
      email: user?.email ?? undefined,
      name: client.businessName,
      metadata: { clientId: client.id },
    });
    customerId = customer.id;
    await prisma.clientProfile.update({
      where: { id: client.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${env.appUrl}/app/billing?checkout=success`,
    cancel_url: `${env.appUrl}/app/billing?checkout=cancelled`,
    metadata: { clientId: client.id, planKey: plan.key, lineKey: plan.line },
    subscription_data: { metadata: { clientId: client.id, planKey: plan.key, lineKey: plan.line } },
  });

  return NextResponse.json({ url: session.url });
}
