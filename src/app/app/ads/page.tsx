import { requireClient } from "@/lib/tenancy";
import { getAdMetrics } from "@/lib/client-data";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { StatTile } from "@/components/stat-tile";
import { AdCharts } from "@/components/ad-charts";
import { Card } from "@/components/ui/card";

export default async function AdsPage({ searchParams }: { searchParams: { days?: string } }) {
  const { client } = await requireClient();
  const days = [7, 30, 90].includes(Number(searchParams.days)) ? Number(searchParams.days) : 30;
  const ads = await getAdMetrics(client.id, days);

  return (
    <div className="space-y-8">
      <div>
        <div className="hud-label">Ad Operations</div>
        <h1 className="mt-1 font-heading text-3xl font-bold">Performance dashboard</h1>
      </div>

      {ads.accounts.length === 0 ? (
        <Card className="text-sm text-muted-foreground">
          No ad accounts connected yet. Your ad-ops team will add them during onboarding.
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <StatTile label="Spend" value={formatCurrency(ads.totals.spend)} accent="cyan" />
            <StatTile label="Leads" value={formatNumber(ads.totals.leads)} accent="violet" />
            <StatTile label="Cost / lead" value={formatCurrency(ads.cpl)} accent="magenta" />
            <StatTile label="ROAS" value={`${ads.roas.toFixed(2)}×`} accent="cyan" />
          </div>

          <AdCharts series={ads.series} ranges={[7, 30, 90]} activeDays={days} />

          <div>
            <h2 className="mb-3 font-heading text-lg font-semibold">Accounts</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ads.accounts.map((a) => (
                <Card key={a.id} className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{a.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{a.platform}</div>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{a.metrics.length} days</span>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
