import { requireAdmin } from "@/lib/tenancy";
import { getAdminTotals } from "@/lib/admin-data";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { StatTile } from "@/components/stat-tile";

export default async function AdminOverview() {
  await requireAdmin();
  const totals = await getAdminTotals();

  return (
    <div className="space-y-8">
      <div>
        <div className="hud-label">Admin</div>
        <h1 className="mt-1 font-heading text-3xl font-bold">Agency overview</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatTile label="MRR" value={formatCurrency(totals.mrr)} accent="cyan" />
        <StatTile label="Clients" value={formatNumber(totals.clientCount)} accent="violet" />
        <StatTile label="Active subs" value={formatNumber(totals.activeSubCount)} accent="magenta" />
        <StatTile label="Open requests" value={formatNumber(totals.openRequests)} accent="cyan" />
      </div>
    </div>
  );
}
