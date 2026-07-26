/**
 * Centralized, lazily-validated environment access.
 * We do NOT hard-crash on import (the app must build without secrets in CI);
 * instead each accessor throws only when the feature that needs it is used.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export const env = {
  optional: (name: string) => process.env[name],
  required,

  get anthropicKey() {
    return required("ANTHROPIC_API_KEY");
  },
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",

  get stripeSecret() {
    return required("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return required("STRIPE_WEBHOOK_SECRET");
  },

  zapierOnboardHook: process.env.ZAPIER_ONBOARD_HOOK_URL,
  zapierLeadHook: process.env.ZAPIER_LEAD_HOOK_URL,

  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};
