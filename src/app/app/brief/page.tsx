import Link from "next/link";
import { Moon, AlertTriangle, ArrowUpCircle, Clock, Copy } from "lucide-react";
import { requireClient } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { getActiveSubscription } from "@/lib/entitlements";
import { cadenceForPlan, type BriefSection } from "@/lib/night-shift";
import { env } from "@/lib/env";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * The morning brief. What the client sees before their first coffee — and the
 * page that makes the difference between software they might open and a system
 * they'd notice missing.
 */

const PRIORITY_STYLES: Record<string, string> = {
  HIGH: "border-l-2 border-l-cyan",
  MEDIUM: "border-l-2 border-l-secondary",
  LOW: "border-l-2 border-l-border",
};

function formatDay(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export default async function BriefPage() {
  const { client } = await requireClient();
  const sub = await getActiveSubscription(client.id, "AI_AGENTS");
  const cadence = cadenceForPlan(sub?.planKey);

  const briefs = await prisma.briefRun.findMany({
    where: { clientId: client.id, status: "COMPLETE" },
    orderBy: { runDate: "desc" },
    take: 14,
  });

  const [latest, ...history] = briefs;
  const intakeUrl = client.intakeToken
    ? `${env.siteUrl}/api/intake/${client.id}?token=${client.intakeToken}`
    : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="hud-label">Night shift</div>
          <h1 className="mt-1 font-heading text-3xl font-bold">Your morning brief</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            While nobody was logged in, the desk scored every lead that came in, checked what was
            going cold, and left this waiting.
          </p>
        </div>
        {cadence && (
          <Badge variant={cadence === "DAILY" ? "success" : "default"}>
            {cadence === "DAILY" ? "Runs nightly" : "Runs weekly"}
          </Badge>
        )}
      </div>

      {/* Tier gate */}
      {!cadence && (
        <Card>
          <div className="flex items-start gap-3">
            <Moon className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />
            <div className="flex-1">
              <CardTitle>The night shift isn&apos;t running on your plan</CardTitle>
              <p className="mt-2 text-sm text-muted-foreground">
                Scale runs an unattended pass once a week. Command runs one every night — every
                lead scored and ranked before you open your laptop, which is what unlimited runs
                actually buys you.
              </p>
              <Button asChild className="mt-4" size="sm">
                <Link href="/app/billing">
                  <ArrowUpCircle className="h-4 w-4" /> See the tiers
                </Link>
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Latest brief */}
      {cadence && !latest && (
        <Card>
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-cyan" />
            <div>
              <CardTitle>No brief yet</CardTitle>
              <p className="mt-2 text-sm text-muted-foreground">
                Your first brief lands after the next run. Point your lead form at the intake
                endpoint below and there will be something in it.
              </p>
            </div>
          </div>
        </Card>
      )}

      {latest && (
        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <span className="hud-label">{formatDay(latest.runDate)}</span>
            <span className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
              {latest.leadsScored} scored
            </span>
          </div>

          <div className="hud-panel hud-corners p-6">
            <h2 className="font-heading text-xl font-bold">{latest.headline}</h2>
            {latest.summary && (
              <div className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                {latest.summary}
              </div>
            )}

            <div className="mt-6 space-y-3">
              {((latest.sections as unknown as BriefSection[]) ?? []).map((s, i) => (
                <div key={`${s.title}-${i}`} className={`pl-4 ${PRIORITY_STYLES[s.priority] ?? ""}`}>
                  <div className="flex items-center gap-2">
                    {s.priority === "HIGH" && (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-cyan" />
                    )}
                    <span className="text-sm font-medium">{s.title}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.detail}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link href="/app/agents/lead-qualifier">Open the Lead Qualifier →</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/app/memory">Log what closed</Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Intake endpoint */}
      {intakeUrl && (
        <Card>
          <CardTitle>Your lead intake endpoint</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Point your website form, Zapier zap, or lead-ad connector at this URL and leads land
            here on their own — no copy-paste, and the night shift picks them up.
          </p>
          <div className="mt-3 flex items-center gap-2 overflow-x-auto rounded-md border border-border bg-muted/20 p-3">
            <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <code className="whitespace-nowrap font-mono text-[0.7rem]">{intakeUrl}</code>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            POST JSON with any of: name, email, phone, company, message. Everything else you send is
            kept. Treat the token like a password — ask us to rotate it if it leaks.
          </p>
        </Card>
      )}

      {/* History */}
      {history.length > 0 && (
        <div>
          <h2 className="mb-3 font-heading text-xl font-bold">Earlier briefs</h2>
          <div className="hud-panel divide-y divide-border/40">
            {history.map((b) => (
              <div key={b.id} className="flex items-start justify-between gap-4 p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{b.headline}</div>
                  <div className="hud-label mt-0.5">{formatDay(b.runDate)}</div>
                </div>
                <span className="hud-value shrink-0 text-xs text-muted-foreground">
                  {b.leadsScored} scored
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
