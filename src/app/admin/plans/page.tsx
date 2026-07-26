import { requireAdmin } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function AdminPlansPage() {
  await requireAdmin();
  const plans = await prisma.plan.findMany({ orderBy: [{ lineKey: "asc" }, { priceMonthly: "asc" }] });

  return (
    <div className="space-y-6">
      <div>
        <div className="hud-label">Admin</div>
        <h1 className="mt-1 font-heading text-3xl font-bold">Plans & pricing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Read from the DB catalog. Stripe Price IDs are synced via <code className="font-mono">pnpm stripe:setup</code>.
        </p>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
              <th className="p-4">Plan</th>
              <th className="p-4">Line</th>
              <th className="p-4 text-right">Price</th>
              <th className="p-4 text-right">Run limit</th>
              <th className="p-4">Stripe Price</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id} className="border-b border-border/40 last:border-0">
                <td className="p-4 font-medium">{p.name}</td>
                <td className="p-4">
                  <Badge variant={p.lineKey === "AI_AGENTS" ? "default" : "violet"}>
                    {p.lineKey === "AI_AGENTS" ? "Agents" : "Ad Ops"}
                  </Badge>
                </td>
                <td className="p-4 text-right hud-value">{formatCurrency(p.priceMonthly)}</td>
                <td className="p-4 text-right hud-value">{p.maxAgentRunsMonthly ?? "∞"}</td>
                <td className="p-4 font-mono text-xs text-muted-foreground">
                  {p.stripePriceId ? p.stripePriceId : <span className="text-amber-400">not linked</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
