import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError, ForbiddenError } from "@/lib/tenancy";

/**
 * CSV import for ad metrics. Accepts a text/csv body with header:
 *   date,spend,impressions,clicks,leads,conversions,revenue
 * spend/revenue are dollars (converted to cents). Query: ?adAccountId=...
 * Ingestion-agnostic: rows are tagged source=CSV.
 */
const Row = z.object({
  date: z.string(),
  spend: z.coerce.number().default(0),
  impressions: z.coerce.number().default(0),
  clicks: z.coerce.number().default(0),
  leads: z.coerce.number().default(0),
  conversions: z.coerce.number().default(0),
  revenue: z.coerce.number().default(0),
});

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: "Admin only" }, { status: 403 });
    throw e;
  }

  const adAccountId = new URL(req.url).searchParams.get("adAccountId");
  if (!adAccountId) return NextResponse.json({ error: "adAccountId required" }, { status: 400 });

  const account = await prisma.adAccount.findUnique({ where: { id: adAccountId } });
  if (!account) return NextResponse.json({ error: "Ad account not found" }, { status: 404 });

  const text = await req.text();
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift()?.split(",").map((h) => h.trim()) ?? [];

  let imported = 0;
  const errors: string[] = [];

  for (const [i, line] of lines.entries()) {
    const cells = line.split(",");
    const record: Record<string, string> = {};
    header.forEach((h, idx) => (record[h] = (cells[idx] ?? "").trim()));

    const parsed = Row.safeParse(record);
    if (!parsed.success) {
      errors.push(`Row ${i + 2}: ${parsed.error.issues[0]?.message}`);
      continue;
    }
    const d = new Date(parsed.data.date + "T00:00:00.000Z");
    if (isNaN(d.getTime())) {
      errors.push(`Row ${i + 2}: invalid date`);
      continue;
    }
    await prisma.adMetricDaily.upsert({
      where: { adAccountId_date: { adAccountId, date: d } },
      update: {
        spend: Math.round(parsed.data.spend * 100),
        impressions: parsed.data.impressions,
        clicks: parsed.data.clicks,
        leads: parsed.data.leads,
        conversions: parsed.data.conversions,
        revenue: Math.round(parsed.data.revenue * 100),
        source: "CSV",
      },
      create: {
        adAccountId,
        date: d,
        spend: Math.round(parsed.data.spend * 100),
        impressions: parsed.data.impressions,
        clicks: parsed.data.clicks,
        leads: parsed.data.leads,
        conversions: parsed.data.conversions,
        revenue: Math.round(parsed.data.revenue * 100),
        source: "CSV",
      },
    });
    imported++;
  }

  return NextResponse.json({ imported, errors });
}
