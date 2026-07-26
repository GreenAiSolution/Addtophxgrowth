import Stripe from "stripe";
import { env } from "@/lib/env";

let _stripe: Stripe | null = null;

/** Lazily-constructed Stripe client (so the app builds without secrets). */
export function stripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(env.stripeSecret, { apiVersion: "2025-02-24.acacia" });
  }
  return _stripe;
}
