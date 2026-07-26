import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { postWebhook } from "@/lib/webhooks";

const LeadSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  company: z.string().max(160).optional(),
  monthlyAdSpend: z.string().max(60).optional(),
  message: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = LeadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }

  // Fire to Zapier Catch Hook → HubSpot contact creation.
  await postWebhook(
    env.zapierLeadHook ?? env.zapierOnboardHook,
    { source: "marketing_lead_form", ...parsed.data, submittedAt: new Date().toISOString() },
    { label: "zapier-lead" },
  );

  return NextResponse.json({ ok: true });
}
