import { requireClient } from "@/lib/tenancy";
import { getClientOverview } from "@/lib/client-data";
import { PLANS, PRODUCT_LINES, type ProductLineKey } from "@/lib/catalog";
import { formatCurrency, formatNumber, cn } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ManageBillingButton, CheckoutButton } from "@/components/billing-actions";
import { UsageMeter } from "@/components/usage-meter";

const LINES: ProductLineKey[] = ["AI_AGENTS", "AD_OPS"];

export default async function BillingPage() {
  const { client } = await requireClient();
  const overview = await getClientOverview(client.id);
  const activeByLine: Record<string, string | undefined> = {
    AI_AGENTS: overview.agentSub?.planKey,
    AD_OPS: overview.adOpsSub?.planKey,
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="hud-label">Billing</div>
          <h1 className="mt-1 font-heading text-3xl font-bold">Plans & usage</h1>
        </div>
        <ManageBillingButton />
      </div>

      {/* Current state */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>AI Agents</CardTitle>
            <Badge variant={overview.agentSub ? "success" : "muted"}>
              {overview.agentSub?.plan.name ?? "None"}
            </Badge>
          </div>
          {overview.agentSub && (
            <div className="mt-4 space-y-2">
              <UsageMeter used={overview.agentRunsThisPeriod} limit={overview.agentSub.plan.maxAgentRunsMonthly} />
              <p className="text-xs text-muted-foreground">
                {formatCurrency(overview.agentSub.plan.priceMonthly)}/mo
                {overview.agentSub.currentPeriodEnd &&
                  ` · renews ${overview.agentSub.currentPeriodEnd.toISOString().slice(0, 10)}`}
              </p>
            </div>
          )}
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Ad Ops</CardTitle>
            <Badge variant={overview.adOpsSub ? "success" : "muted"}>
              {overview.adOpsSub?.plan.name ?? "None"}
            </Badge>
          </div>
          {overview.adOpsSub && (
            <p className="mt-4 text-xs text-muted-foreground">
              {formatCurrency(overview.adOpsSub.plan.priceMonthly)}/mo · {formatNumber(overview.adAccountCount)} account(s)
            </p>
          )}
        </Card>
      </div>

      {/* Plan grid */}
      {LINES.map((line) => (
        <div key={line}>
          <h2 className="mb-3 font-heading text-lg font-semibold">{PRODUCT_LINES[line].name}</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {PLANS.filter((p) => p.line === line).map((plan) => {
              const isCurrent = activeByLine[line] === plan.key;
              return (
                <div key={plan.key} className={cn("hud-panel flex flex-col p-5", plan.highlight && "ring-1 ring-cyan/40")}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-heading font-semibold">{plan.name}</h3>
                    {isCurrent && <Badge variant="success">Current</Badge>}
                  </div>
                  <div className="hud-value mt-2 text-2xl font-bold">{formatCurrency(plan.priceMonthly)}<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
                  {plan.setupFee && !isCurrent ? (
                    activeByLine[line] ? (
                      <div className="mt-1 font-mono text-[0.65rem] text-emerald-400">
                        Build fee waived — already onboarded
                      </div>
                    ) : (
                      <div className="mt-1 font-mono text-[0.65rem] text-secondary">
                        + {formatCurrency(plan.setupFee)} one-time build
                      </div>
                    )
                  ) : null}
                  <ul className="mt-3 flex-1 space-y-1 text-xs text-muted-foreground">
                    {plan.features.map((f) => (
                      <li key={f}>› {f}</li>
                    ))}
                  </ul>
                  <div className="mt-4">
                    {isCurrent ? (
                      <span className="block text-center text-xs text-muted-foreground">Active plan</span>
                    ) : (
                      <CheckoutButton planKey={plan.key} label={activeByLine[line] ? "Switch to " + plan.name : "Choose " + plan.name} highlight={plan.highlight} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
