import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Bot, BarChart3, Inbox, Moon, Target, Brain } from "lucide-react";
import { requireClient } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { getClientOverview, getAdMetrics } from "@/lib/client-data";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { StatTile } from "@/components/stat-tile";
import { UsageMeter } from "@/components/usage-meter";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const { client } = await requireClient();
  if (!client.onboardedAt) redirect("/app/onboarding");

  const overview = await getClientOverview(client.id);
  const ads = await getAdMetrics(client.id, 30);

  const [latestBrief, unscoredLeads, openLeads] = await Promise.all([
    prisma.briefRun.findFirst({
      where: { clientId: client.id, status: "COMPLETE" },
      orderBy: { runDate: "desc" },
      select: { headline: true },
    }),
    prisma.lead.count({ where: { clientId: client.id, status: "NEW" } }),
    prisma.lead.count({ where: { clientId: client.id, status: { in: ["SCORED", "WORKING"] } } }),
  ]);

  const runLimit = overview.limits?.maxAgentRunsMonthly ?? null;

  return (
    <div className="space-y-8">
      <div>
        <div className="hud-label">Cockpit</div>
        <h1 className="mt-1 font-heading text-3xl font-bold">Welcome back, {client.businessName}</h1>
      </div>

      {/* Subscriptions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>AI Automation Agents</CardTitle>
            {overview.agentSub ? (
              <Badge variant="success">{overview.agentSub.plan.name}</Badge>
            ) : (
              <Badge variant="muted">Inactive</Badge>
            )}
          </div>
          {overview.agentSub ? (
            <div className="mt-4">
              <UsageMeter used={overview.agentRunsThisPeriod} limit={runLimit} />
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No agent subscription yet. <Link href="/app/billing" className="text-cyan">Activate a plan →</Link>
            </p>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Ad Operations</CardTitle>
            {overview.adOpsSub ? (
              <Badge variant="success">{overview.adOpsSub.plan.name}</Badge>
            ) : (
              <Badge variant="muted">Inactive</Badge>
            )}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {overview.adAccountCount} ad account{overview.adAccountCount === 1 ? "" : "s"} connected · {overview.openRequests} open request{overview.openRequests === 1 ? "" : "s"}
          </p>
        </Card>
      </div>

      {/* Ad KPIs (last 30 days) */}
      <div>
        <h2 className="mb-3 font-heading text-lg font-semibold">Last 30 days</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile label="Ad spend" value={formatCurrency(ads.totals.spend)} accent="cyan" />
          <StatTile label="Leads" value={formatNumber(ads.totals.leads)} sub={`CPL ${formatCurrency(ads.cpl)}`} accent="violet" />
          <StatTile label="ROAS" value={`${ads.roas.toFixed(2)}×`} sub={`Rev ${formatCurrency(ads.totals.revenue)}`} accent="magenta" />
        </div>
      </div>

      {/* Quick links. The brief, leads and memory belong here as much as
          anywhere — they were reachable only from the sidebar, which meant the
          daily-habit features were invisible from the page clients land on. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <QuickLink
          href="/app/brief"
          icon={Moon}
          title="Morning Brief"
          desc={
            latestBrief
              ? latestBrief.headline ?? "Waiting for you"
              : "What the desk did overnight"
          }
        />
        <QuickLink
          href="/app/leads"
          icon={Target}
          title="Leads"
          desc={
            unscoredLeads > 0
              ? `${unscoredLeads} waiting to be scored`
              : `${openLeads} open`
          }
        />
        <QuickLink href="/app/agents" icon={Bot} title="Agent Workspace" desc="Run your AI crew" />
        <QuickLink href="/app/ads" icon={BarChart3} title="Ad Ops Dashboard" desc="Spend, CPL, ROAS" />
        <QuickLink href="/app/memory" icon={Brain} title="System Memory" desc="What your desk has learned" />
        <QuickLink href="/app/requests" icon={Inbox} title="Requests" desc="Ask the ad-ops team" />
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  title,
  desc,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <Link href={href} className="hud-panel group flex items-center justify-between p-5 transition-colors hover:border-cyan/50">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-cyan" />
        <div>
          <div className="font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
    </Link>
  );
}
