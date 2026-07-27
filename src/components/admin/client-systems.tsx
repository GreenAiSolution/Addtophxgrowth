import Link from "next/link";
import { Moon, Radar, Brain, Target, Boxes, AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { STALE_AFTER_HOURS } from "@/lib/night-shift";
import { CONFIDENCE_FLOOR } from "@/lib/memory";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { BriefSection } from "@/lib/night-shift";

/**
 * Everything the unattended systems produced for one client, in the agency's
 * console.
 *
 * The three systems built in the last phases — night shift, Spend Watch, system
 * memory — were entirely invisible to admins. A client could ring about an
 * alert and nobody here could look it up. Read-only on purpose: this is for
 * answering a phone call, not for editing someone else's data behind their
 * back.
 */
export async function ClientSystems({ clientId }: { clientId: string }) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_AFTER_HOURS * 3_600_000);

  const [brief, alerts, leads, memory, provisioned, staleCount] = await Promise.all([
    prisma.briefRun.findFirst({
      where: { clientId, status: "COMPLETE" },
      orderBy: { runDate: "desc" },
    }),
    prisma.adAlert.findMany({
      where: { clientId, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      include: { adAccount: { select: { name: true } } },
      take: 8,
    }),
    prisma.lead.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.memoryEntry.findMany({
      where: { clientId, muted: false },
      orderBy: { confidence: "desc" },
      take: 6,
    }),
    prisma.provisionedItem.groupBy({ by: ["status"], where: { clientId }, _count: true }),
    prisma.lead.count({
      where: {
        clientId,
        status: { in: ["SCORED", "WORKING"] },
        score: { gte: 60 },
        scoredAt: { lt: staleBefore },
      },
    }),
  ]);

  const ready = provisioned.find((p) => p.status === "READY")?._count ?? 0;
  const scheduled = provisioned.find((p) => p.status === "SCHEDULED")?._count ?? 0;
  const unscored = leads.filter((l) => l.status === "NEW").length;

  return (
    <div className="space-y-6">
      {/* Latest brief */}
      <Card>
        <div className="flex items-center gap-2">
          <Moon className="h-4 w-4 text-cyan" />
          <CardTitle>Latest morning brief</CardTitle>
        </div>
        {brief ? (
          <>
            <p className="mt-2 text-sm">{brief.headline}</p>
            <div className="hud-label mt-1">
              {brief.runDate.toISOString().slice(0, 10)} · {brief.leadsScored} scored ·{" "}
              {brief.cadence.toLowerCase()}
            </div>
            <ul className="mt-3 space-y-1.5">
              {((brief.sections as unknown as BriefSection[]) ?? [])
                .filter((s) => s.priority === "HIGH")
                .slice(0, 4)
                .map((s, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    • {s.title}
                  </li>
                ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No completed brief. Either their tier has no night shift, or it has never run.
          </p>
        )}
      </Card>

      {/* Spend Watch */}
      <Card>
        <div className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-cyan" />
          <CardTitle>Open Spend Watch alerts</CardTitle>
        </div>
        {alerts.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nothing open.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border/40">
            {alerts.map((a) => (
              <li key={a.id} className="py-2">
                <div className="flex flex-wrap items-center gap-2">
                  {a.severity === "CRITICAL" && (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                  )}
                  <span className="text-sm">{a.title}</span>
                  <Badge variant={a.severity === "CRITICAL" ? "default" : "muted"}>
                    {a.severity.toLowerCase()}
                  </Badge>
                </div>
                <div className="hud-label mt-0.5">
                  {a.adAccount.name} · {a.dateBucket.toISOString().slice(0, 10)}
                  {a.status === "ACKNOWLEDGED" ? " · seen by client" : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Leads */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-cyan" />
            <CardTitle>Recent leads</CardTitle>
          </div>
          <div className="flex gap-2">
            {unscored > 0 && <Badge variant="muted">{unscored} unscored</Badge>}
            {staleCount > 0 && <Badge>{staleCount} going cold</Badge>}
          </div>
        </div>
        {leads.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No leads yet. Their intake endpoint may not be wired up on their side.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border/40">
            {leads.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <span className="text-sm">
                    {[l.name, l.company].filter(Boolean).join(" — ") || "Unnamed lead"}
                  </span>
                  <div className="hud-label">
                    {l.source} · {l.createdAt.toISOString().slice(0, 10)}
                  </div>
                </div>
                <span className="shrink-0">
                  {l.score != null ? (
                    <Badge variant={l.score >= 80 ? "default" : "muted"}>
                      {l.score} {l.tier ?? ""}
                    </Badge>
                  ) : (
                    <Badge variant="muted">{l.status.toLowerCase()}</Badge>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Memory */}
      <Card>
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-cyan" />
          <CardTitle>What their system has learned</CardTitle>
        </div>
        {memory.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing yet — they haven&apos;t logged enough closed deals. Worth prompting on the next
            call: this is what makes their agents get better.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {memory.map((m) => (
              <li key={m.id} className="text-xs">
                <span
                  className={
                    m.confidence >= CONFIDENCE_FLOOR ? "text-foreground" : "text-muted-foreground"
                  }
                >
                  {m.content}
                </span>
                <span className="hud-label ml-1">
                  ({Math.round(m.confidence * 100)}% · {m.evidenceCount} deals)
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Provisioning */}
      <Card>
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4 text-cyan" />
          <CardTitle>Provisioned system</CardTitle>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {ready + scheduled === 0
            ? "Nothing provisioned. Their subscription may never have activated."
            : `${ready} module${ready === 1 ? "" : "s"} live, ${scheduled} scheduled for the build.`}
        </p>
        <Link
          href={`/admin/requests`}
          className="mt-3 inline-block font-mono text-[0.65rem] uppercase tracking-widest text-cyan hover:underline"
        >
          open their build queue →
        </Link>
      </Card>
    </div>
  );
}
