import { requireAdmin } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CsvImport } from "@/components/csv-import";

async function addMetric(formData: FormData) {
  "use server";
  await requireAdmin();
  const adAccountId = String(formData.get("adAccountId"));
  const dateStr = String(formData.get("date"));
  if (!adAccountId || !dateStr) return;
  const date = new Date(dateStr + "T00:00:00.000Z");
  const num = (k: string) => Math.max(0, Math.round(Number(formData.get(k) || 0)));

  await prisma.adMetricDaily.upsert({
    where: { adAccountId_date: { adAccountId, date } },
    update: {
      spend: num("spend") * 100,
      impressions: num("impressions"),
      clicks: num("clicks"),
      leads: num("leads"),
      conversions: num("conversions"),
      revenue: num("revenue") * 100,
      source: "MANUAL",
    },
    create: {
      adAccountId,
      date,
      spend: num("spend") * 100,
      impressions: num("impressions"),
      clicks: num("clicks"),
      leads: num("leads"),
      conversions: num("conversions"),
      revenue: num("revenue") * 100,
      source: "MANUAL",
    },
  });
  revalidatePath("/admin/metrics");
}

export default async function AdminMetricsPage() {
  await requireAdmin();
  const accounts = await prisma.adAccount.findMany({
    include: { client: { select: { businessName: true } }, _count: { select: { metrics: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="hud-label">Admin</div>
        <h1 className="mt-1 font-heading text-3xl font-bold">Ad metrics entry</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manual entry + CSV upload below. The ingestion layer is source-tagged (MANUAL / CSV / API) so a
          Meta/Google Ads sync can be added later without schema changes.
        </p>
      </div>

      <Card>
        <CardTitle>Add / update a daily row</CardTitle>
        <form action={addMetric} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="adAccountId">Ad account</Label>
              <select id="adAccountId" name="adAccountId" required className="h-10 w-full rounded-md border border-input bg-background/60 px-3 text-sm focus-visible:border-cyan/60 focus-visible:outline-none">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.client.businessName} — {a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="date">Date</Label>
              <Input id="date" name="date" type="date" required />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["spend", "Spend ($)"],
              ["impressions", "Impressions"],
              ["clicks", "Clicks"],
              ["leads", "Leads"],
              ["conversions", "Conversions"],
              ["revenue", "Revenue ($)"],
            ].map(([name, label]) => (
              <div key={name}>
                <Label htmlFor={name}>{label}</Label>
                <Input id={name} name={name} type="number" min="0" step="1" defaultValue="0" />
              </div>
            ))}
          </div>
          <Button type="submit">Save row</Button>
        </form>
      </Card>

      <Card>
        <CardTitle>CSV import</CardTitle>
        <div className="mt-4">
          <CsvImport
            accounts={accounts.map((a) => ({ id: a.id, label: `${a.client.businessName} — ${a.name}` }))}
          />
        </div>
      </Card>

      <div>
        <h2 className="mb-3 font-heading text-lg font-semibold">Accounts</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => (
            <Card key={a.id} className="flex items-center justify-between">
              <div>
                <div className="font-medium">{a.name}</div>
                <div className="font-mono text-xs text-muted-foreground">{a.client.businessName} · {a.platform}</div>
              </div>
              <span className="font-mono text-xs text-muted-foreground">{a._count.metrics} rows</span>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
