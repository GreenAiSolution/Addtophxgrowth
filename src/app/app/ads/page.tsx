import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Radar, AlertTriangle, CheckCircle2, ArrowUpCircle } from "lucide-react";
import { requireClient } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { getAdMetrics } from "@/lib/client-data";
import { getActiveSubscription } from "@/lib/entitlements";
import { watchCadenceFor, checksForPlan } from "@/lib/spend-watch";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { StatTile } from "@/components/stat-tile";
import { AdCharts } from "@/components/ad-charts";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdAccountTargets } from "@/components/ad-account-targets";

const SEVERITY_STYLE: Record<string, string> = {
  CRITICAL: "border-l-2 border-l-red-500/70",
  WARNING: "border-l-2 border-l-amber-400/70",
  INFO: "border-l-2 border-l-border",
};

export default async function AdsPage({ searchParams }: { searchParams: { days?: string } }) {
  const { client } = await requireClient();
  const days = [7, 30, 90].includes(Number(searchParams.days)) ? Number(searchParams.days) : 30;

  const [ads, sub, alerts] = await Promise.all([
    getAdMetrics(client.id, days),
    getActiveSubscription(client.id, "AD_OPS"),
    prisma.adAlert.findMany({
      where: { clientId: client.id, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      include: { adAccount: { select: { name: true, platform: true } } },
      take: 25,
    }),
  ]);

  const cadence = watchCadenceFor(sub?.planKey);
  const checkCount = checksForPlan(sub?.planKey).size;

  async function acknowledge(formData: FormData) {
    "use server";
    const { client: c } = await requireClient();
    const id = String(formData.get("id") ?? "");
    // Scoped read before any mutation — never trust an id from the form alone.
    const alert = await prisma.adAlert.findFirst({
      where: { id, clientId: c.id },
      select: { id: true },
    });
    if (!alert) return;
    await prisma.adAlert.update({
      where: { id: alert.id },
      data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date() },
    });
    revalidatePath("/app/ads");
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="hud-label">Ad Operations</div>
          <h1 className="mt-1 font-heading text-3xl font-bold">Performance dashboard</h1>
        </div>
        {cadence && (
          <Badge variant="success">
            Spend Watch · {checkCount} checks · {cadence === "DAILY" ? "daily" : "weekly"}
          </Badge>
        )}
      </div>

      {/* Spend Watch */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 font-heading text-xl font-bold">
          <Radar className="h-5 w-5 text-cyan" /> Spend Watch
        </h2>

        {!cadence ? (
          <Card>
            <CardTitle>The Spend Watch isn&apos;t running on your plan</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              Monitor sweeps your accounts every week for pacing drift, rising cost per lead and
              accounts that have stopped delivering. Operate adds creative fatigue and your
              cost-per-sale target. Dominate sweeps every morning and watches return on ad spend.
            </p>
            <Button asChild className="mt-4" size="sm">
              <Link href="/app/billing?plan=monitor">
                <ArrowUpCircle className="h-4 w-4" /> Turn the Spend Watch on
              </Link>
            </Button>
          </Card>
        ) : alerts.length === 0 ? (
          <Card>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              <div>
                <CardTitle>All clear</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {ads.accounts.length === 0
                    ? "No ad accounts connected yet — your ad-ops team adds them during onboarding."
                    : `${checkCount} checks ran across ${ads.accounts.length} account${
                        ads.accounts.length === 1 ? "" : "s"
                      } and found nothing that needs you. Anything that breaks gets caught the same ${
                        cadence === "DAILY" ? "day" : "week"
                      }.`}
                </p>
              </div>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {alerts.map((a) => (
              <div
                key={a.id}
                className={`hud-panel flex items-start justify-between gap-4 p-4 ${
                  SEVERITY_STYLE[a.severity] ?? ""
                } ${a.status === "ACKNOWLEDGED" ? "opacity-60" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {a.severity === "CRITICAL" && (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                    )}
                    <span className="text-sm font-medium">{a.title}</span>
                    <Badge variant={a.severity === "CRITICAL" ? "default" : "muted"}>
                      {a.severity.toLowerCase()}
                    </Badge>
                    {a.status === "ACKNOWLEDGED" && <Badge variant="muted">seen</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{a.detail}</p>
                  <div className="hud-label mt-1.5">
                    {a.adAccount.name} · {a.adAccount.platform}
                  </div>
                </div>
                {a.status === "OPEN" && (
                  <form action={acknowledge} className="shrink-0">
                    <input type="hidden" name="id" value={a.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Mark seen
                    </Button>
                  </form>
                )}
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Alerts resolve themselves once the underlying number recovers — nothing here needs
              closing by hand.
            </p>
          </div>
        )}
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
                  <span className="font-mono text-xs text-muted-foreground">
                    {a.metrics.length} days
                  </span>
                </Card>
              ))}
            </div>
          </div>

          {cadence && <AdAccountTargets clientId={client.id} planKey={sub?.planKey} />}
        </>
      )}
    </div>
  );
}
