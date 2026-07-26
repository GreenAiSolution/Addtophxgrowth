import { requireClient } from "@/lib/tenancy";
import { getAdMetrics } from "@/lib/client-data";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { StatTile } from "@/components/stat-tile";
import { ReportGenerator } from "@/components/report-generator";

export default async function ReportsPage() {
  const { client } = await requireClient();
  const ads = await getAdMetrics(client.id, 30);
  const month = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="space-y-8">
      <div>
        <div className="hud-label">Reports</div>
        <h1 className="mt-1 font-heading text-3xl font-bold">{month} summary</h1>
        <p className="mt-1 text-sm text-muted-foreground">{client.businessName}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatTile label="Spend" value={formatCurrency(ads.totals.spend)} accent="cyan" />
        <StatTile label="Leads" value={formatNumber(ads.totals.leads)} accent="violet" />
        <StatTile label="Cost / lead" value={formatCurrency(ads.cpl)} accent="magenta" />
        <StatTile label="ROAS" value={`${ads.roas.toFixed(2)}×`} accent="cyan" />
      </div>

      <ReportGenerator />
    </div>
  );
}
