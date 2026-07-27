import { CheckCircle2 } from "lucide-react";
import { requireClient } from "@/lib/tenancy";
import { getClientOverview } from "@/lib/client-data";
import { PLANS, PRODUCT_LINES, planByKey, type ProductLineKey } from "@/lib/catalog";
import { formatCurrency, formatNumber, cn } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ManageBillingButton, CheckoutButton } from "@/components/billing-actions";
import { AddonMenu } from "@/components/addon-request";
import { UsageMeter } from "@/components/usage-meter";
import { describeGrant } from "@/lib/capacity";

const LINES: ProductLineKey[] = ["AI_AGENTS", "AD_OPS"];

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { plan?: string };
}) {
  const { client } = await requireClient();
  const overview = await getClientOverview(client.id);
  const activeByLine: Record<string, string | undefined> = {
    AI_AGENTS: overview.agentSub?.planKey,
    AD_OPS: overview.adOpsSub?.planKey,
  };

  /**
   * A visitor who chose a tier before signing in arrives here with `?plan=`.
   * Finishing that purchase must not mean scrolling a six-card grid to find the
   * thing they already picked, so it gets resumed at the top of the page.
   */
  const resuming = searchParams.plan ? planByKey(searchParams.plan) : undefined;
  const resumingIsActive = resuming ? activeByLine[resuming.line] === resuming.key : false;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="hud-label">Billing</div>
          <h1 className="mt-1 font-heading text-3xl font-bold">Plans & usage</h1>
        </div>
        <ManageBillingButton />
      </div>

      {resuming && (
        <Card className={cn("hud-corners", !resumingIsActive && "ring-1 ring-cyan/40")}>
          {resumingIsActive ? (
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
              <div>
                <CardTitle>You&apos;re already on {resuming.name}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Nothing to do — it&apos;s live. Change tiers below whenever you like.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="hud-label">Picking up where you left off</div>
                <CardTitle className="mt-1">Activate {resuming.name}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{resuming.tagline}</p>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="hud-value text-2xl font-bold">
                    {formatCurrency(resuming.priceMonthly)}
                    <span className="text-sm font-normal text-muted-foreground">/mo</span>
                  </span>
                  {resuming.setupFee ? (
                    <span className="font-mono text-[0.65rem] text-secondary">
                      {activeByLine[resuming.line]
                        ? "Build fee waived — already onboarded"
                        : `+ ${formatCurrency(resuming.setupFee)} one-time build`}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="w-full shrink-0 sm:w-48">
                <CheckoutButton planKey={resuming.key} label={`Activate ${resuming.name}`} highlight />
              </div>
            </div>
          )}
        </Card>
      )}

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
              <UsageMeter used={overview.agentRunsThisPeriod} limit={overview.limits?.maxAgentRunsMonthly ?? null} />
              <p className="text-xs text-muted-foreground">
                {formatCurrency(overview.agentSub.plan.priceMonthly)}/mo
                {overview.agentSub.currentPeriodEnd &&
                  ` · renews ${overview.agentSub.currentPeriodEnd.toISOString().slice(0, 10)}`}
              </p>
              {/* Capacity add-ons, shown where the limit is — so a client can
                  see the thing they pay extra for is actually switched on. */}
              {overview.limits?.hasGrants && (
                <div className="rounded-md border border-cyan/25 bg-primary/5 p-2.5">
                  <div className="hud-label">Add-ons on your meter</div>
                  <ul className="mt-1 space-y-0.5">
                    {overview.grants.map((g, i) => (
                      <li key={`${g.addonKey}-${i}`} className="text-xs text-muted-foreground">
                        {describeGrant(g)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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

      <AddonMenu />
    </div>
  );
}
