import Link from "next/link";
import { AlertTriangle, ArrowRight, CircleSlash, Mail } from "lucide-react";
import { requireAdmin } from "@/lib/tenancy";
import { collectRevenueBoard, MIN_PIPELINE_EVIDENCE } from "@/lib/revenue";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { StatTile } from "@/components/stat-tile";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * The revenue board.
 *
 * The overview page reports MRR as one number, which looks identical on a good
 * month and a month where a third of it is about to leave. This page exists to
 * separate the three figures that actually matter — what is committed, what is
 * threatened, and what has not been sold yet — and then to name the specific
 * rows behind the middle one, because "at risk" is only useful if you can see
 * whose it is.
 *
 * Every number comes from `computeRevenue`, the same pure function the Monday
 * digest renders from. Two implementations of MRR would eventually disagree.
 */

export const dynamic = "force-dynamic";

function daysAgo(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

export default async function AdminRevenuePage() {
  await requireAdmin();
  const { snapshot: s, failing, cancelling, pipeline } = await collectRevenueBoard();

  return (
    <div className="space-y-8">
      <div>
        <div className="hud-label">Revenue</div>
        <h1 className="mt-1 font-heading text-3xl font-bold">What is committed, and what is moving</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Recalculated on every load from subscriptions, payment issues and open opportunities.
          Nothing here is a forecast — the pipeline is weighted only once there is a measured win
          rate to weight it with.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="MRR"
          value={formatCurrency(s.mrrCents)}
          sub={`${formatNumber(s.activeCount)} subscriptions`}
          accent="cyan"
        />
        <StatTile
          label="Secured"
          value={formatCurrency(s.securedCents)}
          sub="MRR minus everything at risk"
          accent="violet"
        />
        <StatTile
          label="At risk"
          value={formatCurrency(s.atRiskCents)}
          sub={
            s.atRiskCount === 0
              ? "Nothing failing, nothing cancelling"
              : `${formatCurrency(s.failingCents)} failing · ${formatCurrency(s.cancellingCents)} cancelling`
          }
          accent="magenta"
        />
        <StatTile
          label="Pipeline"
          value={formatCurrency(s.pipelineMonthlyCents)}
          sub={`${formatNumber(s.pipelineCount)} open`}
          accent="cyan"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="hud-label">This month</div>
          <div className="hud-value mt-1 text-2xl font-bold">
            {s.netThisMonthCents >= 0 ? "+" : "−"}
            {formatCurrency(Math.abs(s.netThisMonthCents))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            +{formatCurrency(s.newThisMonthCents)} new · −{formatCurrency(s.lostThisMonthCents)} lost
          </p>
        </Card>
        <Card>
          <div className="hud-label">Recovered this month</div>
          <div className="hud-value mt-1 text-2xl font-bold text-emerald-400">
            {formatCurrency(s.recoveredThisMonthCents)}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {s.recoveredThisMonthCount === 0
              ? "No failed invoices came back"
              : `${s.recoveredThisMonthCount} failed ${s.recoveredThisMonthCount === 1 ? "invoice" : "invoices"} paid after chasing`}
          </p>
        </Card>
        <Card>
          <div className="hud-label">Win rate</div>
          <div className="hud-value mt-1 text-2xl font-bold">
            {s.winRate === null ? "—" : `${Math.round(s.winRate * 100)}%`}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {s.winRate === null
              ? `Not stated below ${MIN_PIPELINE_EVIDENCE} closed opportunities — ${s.resolvedOpportunities} so far`
              : `Weighted pipeline ${formatCurrency(s.weightedPipelineCents ?? 0)} over ${s.resolvedOpportunities} closed`}
          </p>
        </Card>
      </div>

      {/* --- Money that has failed. The dunning ladder is already on these. --- */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <CardTitle>Failing payments</CardTitle>
          <Badge>{failing.length}</Badge>
        </div>

        {failing.length === 0 ? (
          <Card>
            <p className="text-sm text-muted-foreground">
              No failed invoices. Every subscription that billed, cleared.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {failing.map((f) => (
              <Card key={f.id} className="border-l-2 border-l-red-500/70">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{f.businessName}</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatCurrency(f.amountCents)} · failing {daysAgo(f.firstFailedAt)}d ·{" "}
                      {f.noticesSent === 0
                        ? "no notice sent yet"
                        : `${f.noticesSent} notice${f.noticesSent === 1 ? "" : "s"} sent${f.lastNoticeStep ? ` (last: ${f.lastNoticeStep})` : ""}`}
                    </p>
                    {f.escalatedAt && (
                      <p className="mt-1 text-xs text-red-400">
                        Ladder finished — this one needs a phone call.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    {f.hostedInvoiceUrl && (
                      <a
                        href={f.hostedInvoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan hover:underline"
                      >
                        Stripe invoice
                      </a>
                    )}
                    <Link
                      href={`/admin/clients/${f.clientId}`}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      Open <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* --- Already decided to leave. Nothing automated will fix these. --- */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <CircleSlash className="h-4 w-4 text-amber-400" />
          <CardTitle>Set to cancel</CardTitle>
          <Badge>{cancelling.length}</Badge>
        </div>

        {cancelling.length === 0 ? (
          <Card>
            <p className="text-sm text-muted-foreground">Nobody has set a subscription to end.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {cancelling.map((c) => (
              <Card key={`${c.clientId}-${c.planKey}`} className="border-l-2 border-l-amber-400/70">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{c.businessName}</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.planKey} · {formatCurrency(c.priceMonthlyCents)}/mo · ends{" "}
                      {c.endsAt ? c.endsAt.toISOString().slice(0, 10) : "at period end"}
                    </p>
                  </div>
                  <Link
                    href={`/admin/clients/${c.clientId}`}
                    className="inline-flex items-center gap-1 text-xs hover:underline"
                  >
                    Open <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* --- Not sold yet. The follow-up ladder is working these. --- */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-cyan" />
          <CardTitle>Open opportunities</CardTitle>
          <Badge>{pipeline.length}</Badge>
        </div>

        {pipeline.length === 0 ? (
          <Card>
            <p className="text-sm text-muted-foreground">
              Nothing open. Nobody new has asked to be contacted.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {pipeline.map((o) => (
              <Card key={o.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">
                      {o.company || o.name}{" "}
                      <span className="text-xs font-normal text-muted-foreground">{o.email}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {o.quotedMonthlyCents > 0
                        ? `${formatCurrency(o.quotedMonthlyCents)}/mo quoted · `
                        : ""}
                      in {daysAgo(o.createdAt)}d ·{" "}
                      {o.stoppedAt
                        ? "opted out — no more automated follow-ups"
                        : `${o.followUpsSent} of 3 follow-ups sent`}
                    </p>
                  </div>
                  <Badge>{o.stage}</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
