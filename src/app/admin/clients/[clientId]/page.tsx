import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { requireAdmin } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { getClientOverview, getAdMetrics } from "@/lib/client-data";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { StatTile } from "@/components/stat-tile";
import { UsageMeter } from "@/components/usage-meter";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CapacityGrants } from "@/components/admin/capacity-grants";
import { ClientSystems } from "@/components/admin/client-systems";
import { PhoneLineAdmin } from "@/components/admin/phone-line-admin";

/**
 * The admin's view of one client: what they see, plus the one mutation the
 * agency genuinely needs here — granting a capacity add-on once it's agreed.
 * Everything else on this page stays read-only.
 */
export default async function AdminClientViewPage({ params }: { params: { clientId: string } }) {
  await requireAdmin();

  const client = await prisma.clientProfile.findUnique({
    where: { id: params.clientId },
    include: { user: { select: { email: true, name: true } } },
  });
  if (!client) notFound();

  const [overview, ads, requests, conversations] = await Promise.all([
    getClientOverview(client.id),
    getAdMetrics(client.id, 30),
    prisma.request.findMany({
      where: { clientId: client.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.agentConversation.findMany({
      where: { clientId: client.id },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { agent: { select: { name: true } }, _count: { select: { messages: true } } },
    }),
  ]);

  return (
    <div className="space-y-8">
      <Link href="/admin/clients" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-cyan">
        <ArrowLeft className="h-4 w-4" /> All clients
      </Link>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-secondary/40 bg-secondary/10 px-4 py-3">
        <Eye className="h-4 w-4 text-secondary" />
        <span className="text-sm text-secondary">
          Viewing as <strong>{client.businessName}</strong> — read-only impersonation
        </span>
      </div>

      <div>
        <div className="hud-label">Client</div>
        <h1 className="mt-1 font-heading text-3xl font-bold">{client.businessName}</h1>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {client.user.email} · {client.industry ?? "no industry"} · {client.website ?? "no website"}
        </p>
      </div>

      {/* Subscriptions + usage */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>AI Agents</CardTitle>
            <Badge variant={overview.agentSub ? "success" : "muted"}>{overview.agentSub?.plan.name ?? "None"}</Badge>
          </div>
          {overview.agentSub && (
            <div className="mt-4">
              <UsageMeter used={overview.agentRunsThisPeriod} limit={overview.limits?.maxAgentRunsMonthly ?? null} />
            </div>
          )}
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Ad Ops</CardTitle>
            <Badge variant={overview.adOpsSub ? "success" : "muted"}>{overview.adOpsSub?.plan.name ?? "None"}</Badge>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {overview.adAccountCount} ad account(s) · {overview.openRequests} open request(s)
          </p>
        </Card>
      </div>

      {/* 30-day KPIs */}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatTile label="Spend (30d)" value={formatCurrency(ads.totals.spend)} accent="cyan" />
        <StatTile label="Leads" value={formatNumber(ads.totals.leads)} accent="violet" />
        <StatTile label="CPL" value={formatCurrency(ads.cpl)} accent="magenta" />
        <StatTile label="ROAS" value={`${ads.roas.toFixed(2)}×`} accent="cyan" />
      </div>

      {/* What the unattended systems produced for this client. */}
      <ClientSystems clientId={client.id} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <CapacityGrants clientId={client.id} />
        </div>
        <div>
          <PhoneLineAdmin clientId={client.id} />
        </div>
        <div>
          <h2 className="mb-3 font-heading text-lg font-semibold">Recent requests</h2>
          <div className="space-y-2">
            {requests.length === 0 && <Card className="text-sm text-muted-foreground">None.</Card>}
            {requests.map((r) => (
              <Link key={r.id} href={`/admin/requests/${r.id}`} className="block">
                <Card className="flex items-center justify-between py-3 transition-colors hover:border-cyan/50">
                  <span className="text-sm">{r.title}</span>
                  <Badge variant={r.status === "DELIVERED" ? "success" : r.status === "IN_PROGRESS" ? "warning" : "default"}>
                    {r.status.replace("_", " ")}
                  </Badge>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-3 font-heading text-lg font-semibold">Recent agent activity</h2>
          <div className="space-y-2">
            {conversations.length === 0 && <Card className="text-sm text-muted-foreground">No conversations yet.</Card>}
            {conversations.map((c) => (
              <Card key={c.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-sm">{c.title ?? "Untitled"}</div>
                  <div className="font-mono text-xs text-muted-foreground">{c.agent.name}</div>
                </div>
                <span className="font-mono text-xs text-muted-foreground">{c._count.messages} msgs</span>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
