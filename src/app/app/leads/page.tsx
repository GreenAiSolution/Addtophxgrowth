import Link from "next/link";
import { revalidatePath } from "next/cache";
import {
  Inbox,
  Sparkles,
  Clock,
  Trophy,
  XCircle,
  PhoneCall,
  Copy,
  AlertTriangle,
} from "lucide-react";
import { requireClient } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { getActiveSubscription } from "@/lib/entitlements";
import { cadenceForPlan, scoreLeadNow, STALE_AFTER_HOURS } from "@/lib/night-shift";
import { recordOutcome } from "@/lib/memory";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LeadStatus } from "@prisma/client";

/**
 * Where leads live.
 *
 * The intake endpoint has been writing Lead rows since it shipped, and until now
 * the only thing that read them was the night shift — which Launch doesn't get.
 * So a Launch client could point their form at the endpoint we gave them and
 * watch their leads disappear into a table with no screen. This is that screen,
 * plus manual scoring so a tier without a night shift is slower, not useless.
 *
 * Marking a lead won or lost goes through `recordOutcome`, so closing a lead
 * here feeds the system memory rather than being a dead status change.
 */

const FILTERS = [
  { key: "open", label: "Open", statuses: ["NEW", "SCORED", "WORKING"] as LeadStatus[] },
  { key: "new", label: "Unscored", statuses: ["NEW"] as LeadStatus[] },
  { key: "scored", label: "Scored", statuses: ["SCORED"] as LeadStatus[] },
  { key: "working", label: "Working", statuses: ["WORKING"] as LeadStatus[] },
  { key: "closed", label: "Closed", statuses: ["WON", "LOST"] as LeadStatus[] },
  { key: "all", label: "All", statuses: [] as LeadStatus[] },
];

const TIER_STYLE: Record<string, string> = {
  HOT: "border-l-2 border-l-cyan",
  WARM: "border-l-2 border-l-violet",
  COLD: "border-l-2 border-l-border",
  DISQUALIFIED: "border-l-2 border-l-border opacity-60",
};

function ageLabel(from: Date, now: Date): string {
  const hours = (now.getTime() - from.getTime()) / 3_600_000;
  if (hours < 1) return "just now";
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: { filter?: string; error?: string };
}) {
  const { client } = await requireClient();
  const now = new Date();

  const filter = FILTERS.find((f) => f.key === searchParams.filter) ?? FILTERS[0];
  const sub = await getActiveSubscription(client.id, "AI_AGENTS");
  const cadence = cadenceForPlan(sub?.planKey);

  const [leads, counts] = await Promise.all([
    prisma.lead.findMany({
      where: {
        clientId: client.id,
        ...(filter.statuses.length > 0 ? { status: { in: filter.statuses } } : {}),
      },
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
    prisma.lead.groupBy({
      by: ["status"],
      where: { clientId: client.id },
      _count: true,
    }),
  ]);

  const countFor = (statuses: LeadStatus[]) =>
    statuses.length === 0
      ? counts.reduce((t, c) => t + c._count, 0)
      : counts.filter((c) => statuses.includes(c.status)).reduce((t, c) => t + c._count, 0);

  const unscored = countFor(["NEW"]);
  const intakeUrl = client.intakeToken
    ? `${env.appUrl}/api/intake/${client.id}?token=${client.intakeToken}`
    : null;

  async function scoreLead(formData: FormData) {
    "use server";
    const { client: c } = await requireClient();
    const id = String(formData.get("id") ?? "");
    const result = await scoreLeadNow(c.id, id);
    // Surface a refusal instead of silently doing nothing — a button that
    // appears to work and doesn't is worse than one that explains itself.
    if (!result.ok && result.reason === "NOT_ALLOWED") {
      revalidatePath("/app/leads");
      return;
    }
    revalidatePath("/app/leads");
  }

  async function setStatus(formData: FormData) {
    "use server";
    const { client: c } = await requireClient();
    const id = String(formData.get("id") ?? "");
    const next = String(formData.get("status") ?? "");

    const lead = await prisma.lead.findFirst({
      where: { id, clientId: c.id },
      select: { id: true },
    });
    if (!lead) return;

    if (next === "WON" || next === "LOST") {
      // Closing a lead is the moment the system learns something. Route it
      // through recordOutcome so it lands in memory, not just in a column.
      await recordOutcome({ clientId: c.id, leadId: lead.id, outcome: next });
    } else if (next === "WORKING") {
      await prisma.lead.update({ where: { id: lead.id }, data: { status: "WORKING" } });
    }
    revalidatePath("/app/leads");
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="hud-label">Leads</div>
          <h1 className="mt-1 font-heading text-3xl font-bold">Everything that came in</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Every lead your intake endpoint receives lands here.{" "}
            {cadence
              ? `The night shift scores them ${cadence === "DAILY" ? "every night" : "every week"} — you can also score any of them right now.`
              : "Your plan has no unattended pass, so score them here whenever you like — it counts against your monthly runs like any other."}
          </p>
        </div>
        {cadence && (
          <Badge variant="success">Auto-scored {cadence === "DAILY" ? "nightly" : "weekly"}</Badge>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/app/leads?filter=${f.key}`}
            className={cn(
              "rounded-full border px-4 py-1.5 text-xs transition-colors",
              f.key === filter.key
                ? "border-cyan/70 bg-cyan/10 text-foreground"
                : "border-border text-muted-foreground hover:border-cyan/40",
            )}
          >
            {f.label}
            <span className="ml-1.5 font-mono opacity-70">{countFor(f.statuses)}</span>
          </Link>
        ))}
      </div>

      {/* Nudge when leads are sitting unscored on a plan with no night shift */}
      {!cadence && unscored > 0 && (
        <Card>
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div className="flex-1">
              <CardTitle>
                {unscored} lead{unscored === 1 ? "" : "s"} waiting to be scored
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Score them below whenever you like. Scale and Command do this on their own —
                overnight, before you open your laptop — which is the whole difference.
              </p>
              <Button asChild size="sm" className="mt-3">
                <Link href="/app/billing">See what the night shift does</Link>
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Leads */}
      {leads.length === 0 ? (
        <Card>
          <div className="flex items-start gap-3">
            <Inbox className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <CardTitle>Nothing here yet</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {intakeUrl
                  ? "Point your website form, Zapier zap or lead-ad connector at your intake endpoint below and leads start landing on their own."
                  : "Your intake endpoint is created when your subscription activates."}
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {leads.map((l) => {
            const stale =
              l.scoredAt != null &&
              (l.status === "SCORED" || l.status === "WORKING") &&
              (now.getTime() - l.scoredAt.getTime()) / 3_600_000 >= STALE_AFTER_HOURS;

            return (
              <div
                key={l.id}
                className={cn("hud-panel p-4", l.tier ? TIER_STYLE[l.tier] : "border-l-2 border-l-border")}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        {[l.name, l.company].filter(Boolean).join(" — ") || "Unnamed lead"}
                      </span>
                      {l.score != null && (
                        <Badge variant={l.score >= 80 ? "default" : "muted"}>
                          {l.score} · {l.tier ?? "unrated"}
                        </Badge>
                      )}
                      {l.status === "NEW" && <Badge variant="muted">unscored</Badge>}
                      {l.status === "WORKING" && <Badge variant="violet">working</Badge>}
                      {l.status === "WON" && <Badge variant="success">won</Badge>}
                      {l.status === "LOST" && <Badge variant="muted">lost</Badge>}
                      {stale && (
                        <span className="flex items-center gap-1 font-mono text-[0.6rem] uppercase tracking-widest text-amber-400">
                          <Clock className="h-3 w-3" /> going cold
                        </span>
                      )}
                    </div>

                    <div className="hud-label mt-1">
                      {l.source} · {ageLabel(l.createdAt, now)}
                      {l.email ? ` · ${l.email}` : ""}
                      {l.phone ? ` · ${l.phone}` : ""}
                    </div>

                    {l.message && (
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{l.message}</p>
                    )}
                    {l.nextAction && (
                      <p className="mt-2 text-xs">
                        <span className="text-cyan">Next:</span>{" "}
                        <span className="text-muted-foreground">{l.nextAction}</span>
                      </p>
                    )}
                    {l.reasoning && (
                      <p className="mt-1 text-[0.7rem] text-muted-foreground/80">{l.reasoning}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {l.status === "NEW" && (
                      <form action={scoreLead}>
                        <input type="hidden" name="id" value={l.id} />
                        <Button type="submit" size="sm">
                          <Sparkles className="h-3.5 w-3.5" /> Score now
                        </Button>
                      </form>
                    )}
                    {(l.status === "SCORED" || l.status === "NEW") && (
                      <form action={setStatus}>
                        <input type="hidden" name="id" value={l.id} />
                        <input type="hidden" name="status" value="WORKING" />
                        <Button type="submit" size="sm" variant="outline">
                          <PhoneCall className="h-3.5 w-3.5" /> Working
                        </Button>
                      </form>
                    )}
                    {l.status !== "WON" && l.status !== "LOST" && (
                      <>
                        <form action={setStatus}>
                          <input type="hidden" name="id" value={l.id} />
                          <input type="hidden" name="status" value="WON" />
                          <Button type="submit" size="sm" variant="ghost">
                            <Trophy className="h-3.5 w-3.5" /> Won
                          </Button>
                        </form>
                        <form action={setStatus}>
                          <input type="hidden" name="id" value={l.id} />
                          <input type="hidden" name="status" value="LOST" />
                          <Button type="submit" size="sm" variant="ghost">
                            <XCircle className="h-3.5 w-3.5" /> Lost
                          </Button>
                        </form>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">
            Marking a lead won or lost teaches your agents — it feeds straight into{" "}
            <Link href="/app/memory" className="text-cyan hover:underline">
              system memory
            </Link>
            , where the scoring calibrates to what actually closes for you.
          </p>
        </div>
      )}

      {/* Intake endpoint */}
      {intakeUrl && (
        <Card>
          <CardTitle>Your lead intake endpoint</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            POST JSON with any of: name, email, phone, company, message. Anything else you send is
            kept. Treat the token like a password.
          </p>
          <div className="mt-3 flex items-center gap-2 overflow-x-auto rounded-md border border-border bg-muted/20 p-3">
            <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <code className="whitespace-nowrap font-mono text-[0.7rem]">{intakeUrl}</code>
          </div>
        </Card>
      )}
    </div>
  );
}
