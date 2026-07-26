import { NextResponse } from "next/server";
import { requireClient, AuthError } from "@/lib/tenancy";
import { getAdMetrics } from "@/lib/client-data";
import { anthropic, ANTHROPIC_MODEL } from "@/lib/anthropic";
import { formatCurrency } from "@/lib/utils";

/**
 * Server-side monthly executive narrative. Never exposes the Anthropic key.
 * Falls back to a deterministic summary if the API key is absent.
 */
export async function POST() {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ads = await getAdMetrics(client.id, 30);
  const facts = {
    business: client.businessName,
    spend: formatCurrency(ads.totals.spend),
    leads: ads.totals.leads,
    cpl: formatCurrency(ads.cpl),
    roas: `${ads.roas.toFixed(2)}x`,
    revenue: formatCurrency(ads.totals.revenue),
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      narrative: `Over the last 30 days, ${facts.business} spent ${facts.spend} and generated ${facts.leads} leads at a cost per lead of ${facts.cpl}. Return on ad spend landed at ${facts.roas} on ${facts.revenue} in attributed revenue. (Set ANTHROPIC_API_KEY to generate a full AI narrative.)`,
      facts,
      ai: false,
    });
  }

  try {
    const msg = await anthropic().messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 700,
      system:
        "You are a senior growth strategist writing a concise monthly executive summary for a client. Be specific, cite the numbers provided, highlight one win and one focus area, and end with a recommended next action. 150-220 words. No markdown headers.",
      messages: [
        {
          role: "user",
          content: `Write the monthly summary using ONLY these metrics (last 30 days): ${JSON.stringify(facts)}`,
        },
      ],
    });
    const narrative = msg.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return NextResponse.json({ narrative, facts, ai: true });
  } catch (err) {
    console.error("[reports] anthropic error:", err);
    return NextResponse.json({ error: "Could not generate narrative right now." }, { status: 502 });
  }
}
