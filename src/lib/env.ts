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

/**
 * Read the first of several names that has a value.
 *
 * This exists because of a real, expensive incident: the production Vercel
 * project had the Resend key stored as `resend` and the Zapier hook as
 * `zapier`, while the code read `RESEND_API_KEY` and `ZAPIER_ONBOARD_HOOK_URL`.
 * Nothing errored. The enquiry endpoint reported success to every visitor and
 * quietly dropped the lead into a log line, because "no transport configured"
 * is indistinguishable from "configured correctly" unless you go looking.
 *
 * Accepting the lower-case aliases is not tidiness — it is the difference
 * between a working conversion path and a silent one, on a deploy nobody has
 * to touch. `deliveryChannels()` reports which name actually matched so the
 * mis-naming is visible rather than merely survivable.
 */
function firstOf(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return undefined;
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

  /** Canonical name first; the mis-named production alias second. */
  get resendKey() {
    return firstOf("RESEND_API_KEY", "resend", "RESEND");
  },
  get zapierOnboardHook() {
    return firstOf("ZAPIER_ONBOARD_HOOK_URL", "zapier", "ZAPIER");
  },
  get zapierLeadHook() {
    return firstOf("ZAPIER_LEAD_HOOK_URL", "zapier_lead", "ZAPIER_LEAD");
  },

  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};

export interface DeliveryChannel {
  name: string;
  live: boolean;
  /** Which env var actually supplied the value, when one did. */
  via?: string;
  hint: string;
}

/**
 * Which ways out of the building are actually open. Surfaced at /api/health so
 * "is the enquiry form reaching anyone?" is a question with a one-second
 * answer rather than an archaeology exercise.
 */
export function deliveryChannels(): DeliveryChannel[] {
  const which = (...names: string[]) => names.find((n) => process.env[n]);

  const resend = which("RESEND_API_KEY", "resend", "RESEND");
  const smtp = which("EMAIL_SERVER_HOST");
  const zapier = which("ZAPIER_ONBOARD_HOOK_URL", "zapier", "ZAPIER");

  return [
    {
      name: "Email via Resend",
      live: Boolean(resend),
      via: resend,
      hint: "Set RESEND_API_KEY to deliver enquiries by email.",
    },
    {
      name: "Email via SMTP",
      live: Boolean(smtp),
      via: smtp,
      hint: "Set EMAIL_SERVER_HOST/PORT/USER/PASSWORD as a fallback transport.",
    },
    {
      name: "Zapier mirror",
      live: Boolean(zapier),
      via: zapier,
      hint: "Set ZAPIER_ONBOARD_HOOK_URL to mirror every enquiry to a Zap.",
    },
  ];
}

/** True when at least one channel can actually reach a human. */
export function canDeliver(): boolean {
  return deliveryChannels().some((c) => c.live);
}
