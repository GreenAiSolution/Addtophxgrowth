import Link from "next/link";
import { Activity, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";
import { requireAdmin } from "@/lib/tenancy";
import { collectSignals, summarizeSignals, type SignalSeverity } from "@/lib/signals";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * The agency's morning triage.
 *
 * Deliberately not a dashboard of every client — it lists only what is wrong,
 * ordered so the silently-broken things come first. A client whose Spend Watch
 * stopped running is more dangerous than one with a loud critical alert,
 * because the loud one is already emailing them and the quiet one is telling
 * nobody anything.
 */

export const dynamic = "force-dynamic";

const SEVERITY_STYLE: Record<SignalSeverity, string> = {
  URGENT: "border-l-2 border-l-red-500/70",
  ATTENTION: "border-l-2 border-l-amber-400/70",
  FYI: "border-l-2 border-l-border",
};

export default async function AdminSignalsPage() {
  await requireAdmin();
  const { signals, clientCount } = await collectSignals();

  const urgent = signals.filter((s) => s.severity === "URGENT");
  const attention = signals.filter((s) => s.severity === "ATTENTION");
  const fyi = signals.filter((s) => s.severity === "FYI");

  return (
    <div className="space-y-8">
      <div>
        <div className="hud-label">Signals</div>
        <h1 className="mt-1 font-heading text-3xl font-bold">What needs the desk today</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {summarizeSignals(signals, clientCount)} Healthy clients aren&apos;t listed — this page is
          only what is wrong, worst first.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="hud-label">Urgent</div>
          <div className="hud-value mt-1 text-3xl font-bold text-red-400">{urgent.length}</div>
        </Card>
        <Card>
          <div className="hud-label">Needs attention</div>
          <div className="hud-value mt-1 text-3xl font-bold text-amber-400">
            {attention.length}
          </div>
        </Card>
        <Card>
          <div className="hud-label">Worth mentioning</div>
          <div className="hud-value mt-1 text-3xl font-bold">{fyi.length}</div>
        </Card>
      </div>

      {signals.length === 0 ? (
        <Card>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
            <div>
              <CardTitle>Nothing needs you</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Every sweep has run, no briefs failed, no critical alerts are open, and no qualified
                lead is going cold. Go and sell something.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {signals.map((s, i) => (
            <Link key={`${s.clientId}-${s.kind}-${i}`} href={s.path} className="block">
              <div
                className={`hud-panel flex items-start justify-between gap-4 p-4 transition-colors hover:border-cyan/50 ${
                  SEVERITY_STYLE[s.severity]
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {s.severity === "URGENT" && (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                    )}
                    <span className="text-sm font-medium">{s.title}</span>
                    <Badge variant={s.severity === "URGENT" ? "default" : "muted"}>
                      {s.businessName}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{s.detail}</p>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>
      )}

      <Card>
        <div className="flex items-start gap-3">
          <Activity className="mt-0.5 h-5 w-5 shrink-0 text-cyan" />
          <div>
            <CardTitle>How this is ordered</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Things that are silently broken outrank things that are loudly wrong. A stalled Spend
              Watch or a failed brief means a client is getting nothing and doesn&apos;t know it. A
              critical alert has already emailed them.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
