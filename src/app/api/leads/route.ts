import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { postWebhook } from "@/lib/webhooks";
import { sendNotification, agencyAddress } from "@/lib/notify";

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

  const d = parsed.data;

  // Fire to Zapier Catch Hook → HubSpot contact creation.
  await postWebhook(
    env.zapierLeadHook ?? env.zapierOnboardHook,
    { source: "marketing_lead_form", ...d, submittedAt: new Date().toISOString() },
    { label: "zapier-lead" },
  );

  // And straight to the agency inbox, so an enquiry can't be lost just because
  // no Zap has been built yet.
  await sendNotification({
    kind: "MARKETING_LEAD",
    to: agencyAddress(),
    payload: {
      businessName: d.company?.trim() || d.name,
      title: d.name,
      detail: [
        `Name:    ${d.name}`,
        `Email:   ${d.email}`,
        d.company ? `Company: ${d.company}` : "",
        d.monthlyAdSpend ? `Spend:   ${d.monthlyAdSpend}` : "",
        d.message ? `\n"${d.message}"` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      path: "/",
    },
  });

  return NextResponse.json({ ok: true });
}
