/**
 * Idempotently create Stripe Products + monthly Prices for all six plans
 * (test mode). Prints the env-var lines to paste into your .env.
 *
 *   pnpm stripe:setup
 *
 * Requires STRIPE_SECRET_KEY (test mode) in the environment.
 */
import Stripe from "stripe";
import { PLANS, PRODUCT_LINES } from "../src/lib/catalog";

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("Set STRIPE_SECRET_KEY (test mode) before running.");
    process.exit(1);
  }
  const stripe = new Stripe(key, { apiVersion: "2025-02-24.acacia" });

  const envLines: string[] = [];

  for (const plan of PLANS) {
    const productName = `${PRODUCT_LINES[plan.line].name} — ${plan.name}`;

    // Find or create the product by metadata key.
    const existing = await stripe.products.search({ query: `metadata['planKey']:'${plan.key}'` });
    let product = existing.data[0];
    if (!product) {
      product = await stripe.products.create({
        name: productName,
        metadata: { planKey: plan.key, line: plan.line },
      });
      console.log(`✓ created product ${productName}`);
    } else {
      console.log(`• product exists ${productName}`);
    }

    // Reuse an existing monthly price of the right amount, else create it.
    const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
    let price = prices.data.find(
      (p) => p.unit_amount === plan.priceMonthly && p.recurring?.interval === "month",
    );
    if (!price) {
      price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.priceMonthly,
        currency: "usd",
        recurring: { interval: "month" },
        metadata: { planKey: plan.key },
      });
      console.log(`  ↳ created price ${price.id} (${plan.priceMonthly / 100} USD/mo)`);
    } else {
      console.log(`  ↳ price exists ${price.id}`);
    }

    envLines.push(`${plan.stripePriceEnv}=${price.id}`);

    // One-time build fee — a separate non-recurring Price on the same product,
    // added as a second line item at checkout for new clients.
    if (plan.setupFee && plan.setupPriceEnv) {
      let setupPrice = prices.data.find(
        (p) => p.unit_amount === plan.setupFee && !p.recurring,
      );
      if (!setupPrice) {
        setupPrice = await stripe.prices.create({
          product: product.id,
          unit_amount: plan.setupFee,
          currency: "usd",
          metadata: { planKey: plan.key, kind: "setup_fee" },
        });
        console.log(`  ↳ created one-time build fee ${setupPrice.id} (${plan.setupFee / 100} USD)`);
      } else {
        console.log(`  ↳ build fee price exists ${setupPrice.id}`);
      }
      envLines.push(`${plan.setupPriceEnv}=${setupPrice.id}`);
    }
  }

  console.log("\n# ---- Paste these into your .env ----");
  console.log(envLines.join("\n"));
  console.log("\nThen run: pnpm db:seed  (to sync stripePriceId into the DB)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
