import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import { requireClient, AuthError } from "@/lib/tenancy";

/** Open the Stripe Customer Portal for the current client. */
export async function POST() {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Billing not configured." }, { status: 503 });
  }
  if (!client.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account yet. Subscribe to a plan first." }, { status: 400 });
  }

  const session = await stripe().billingPortal.sessions.create({
    customer: client.stripeCustomerId,
    return_url: `${env.siteUrl}/app/billing`,
  });

  return NextResponse.json({ url: session.url });
}
