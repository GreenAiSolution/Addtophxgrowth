import Link from "next/link";
import { requireAdmin } from "@/lib/tenancy";
import { getAdminClientRows } from "@/lib/admin-data";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export default async function AdminClientsPage() {
  await requireAdmin();
  const rows = await getAdminClientRows();

  return (
    <div className="space-y-6">
      <div>
        <div className="hud-label">Admin</div>
        <h1 className="mt-1 font-heading text-3xl font-bold">Clients</h1>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
              <th className="p-4">Client</th>
              <th className="p-4">Agents</th>
              <th className="p-4">Ad Ops</th>
              <th className="p-4 text-right">MRR</th>
              <th className="p-4 text-right">Runs (mo)</th>
              <th className="p-4">Last activity</th>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">No clients yet.</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                <td className="p-4">
                  <div className="font-medium">{r.businessName}</div>
                  <div className="font-mono text-xs text-muted-foreground">{r.email}</div>
                </td>
                <td className="p-4">{r.agentsPlan ? <Badge variant="success">{r.agentsPlan}</Badge> : <span className="text-muted-foreground">—</span>}</td>
                <td className="p-4">{r.adOpsPlan ? <Badge variant="violet">{r.adOpsPlan}</Badge> : <span className="text-muted-foreground">—</span>}</td>
                <td className="p-4 text-right hud-value">{formatCurrency(r.mrr)}</td>
                <td className="p-4 text-right hud-value">{formatNumber(r.runs)}</td>
                <td className="p-4 font-mono text-xs text-muted-foreground">{r.lastActivity.toISOString().slice(0, 10)}</td>
                <td className="p-4 text-right">
                  <Link href={`/admin/clients/${r.id}`} className="whitespace-nowrap text-xs text-cyan hover:underline">
                    View as →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
