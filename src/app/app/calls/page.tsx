import { revalidatePath } from "next/cache";
import Link from "next/link";
import {
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  MessageSquare,
  Copy,
  AlertTriangle,
  CalendarCheck,
  FileText,
} from "lucide-react";
import { requireClient } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { runTextBack } from "@/lib/switchboard";
import { formatNumber, missing, type CallFacts } from "@/lib/telephony";
import { employeeByKey } from "@/lib/employees";
import { cn } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CallOutcome } from "@prisma/client";

/**
 * The flight deck for the phone.
 *
 * Leads with the calls nobody reached, because that is the number the client is
 * actually buying down and the one a screen full of successes would hide. The
 * empty state says how many calls were answered rather than showing nothing —
 * the same judgement `/app/ads` makes about a quiet week, for the same reason:
 * the weeks where nothing went wrong still contain work.
 */

const FILTERS = [
  { key: "missed", label: "Missed", outcomes: ["MISSED", "VOICEMAIL", "FAILED"] as CallOutcome[] },
  { key: "all", label: "All calls", outcomes: [] as CallOutcome[] },
  {
    key: "handled",
    label: "Handled",
    outcomes: ["QUALIFIED", "BOOKED", "ESTIMATE_REQUESTED", "MESSAGE"] as CallOutcome[],
  },
  { key: "booked", label: "Booked", outcomes: ["BOOKED"] as CallOutcome[] },
];

const OUTCOME_STYLE: Record<string, { chip: string; edge: string }> = {
  BOOKED: { chip: "border-cyan/40 text-cyan", edge: "border-l-cyan" },
  QUALIFIED: { chip: "border-violet/40 text-violet", edge: "border-l-violet" },
  ESTIMATE_REQUESTED: { chip: "border-violet/40 text-violet", edge: "border-l-violet" },
  MESSAGE: { chip: "border-border text-muted-foreground", edge: "border-l-border" },
  TRANSFERRED: { chip: "border-border text-muted-foreground", edge: "border-l-border" },
  MISSED: { chip: "border-magenta/50 text-magenta", edge: "border-l-magenta" },
  VOICEMAIL: { chip: "border-magenta/40 text-magenta", edge: "border-l-magenta" },
  FAILED: { chip: "border-magenta/60 text-magenta", edge: "border-l-magenta" },
  IN_PROGRESS: { chip: "border-cyan/40 text-cyan", edge: "border-l-cyan" },
};

function ageLabel(from: Date, now: Date): string {
  const hours = (now.getTime() - from.getTime()) / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function duration(seconds: number | null): string {
  if (!seconds) return "—";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default async function CallsPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const { client } = await requireClient();
  const now = new Date();
  const patch = employeeByKey("switchboard")!;

  const filter = FILTERS.find((f) => f.key === searchParams.filter) ?? FILTERS[0];

  const [calls, counts, profile] = await Promise.all([
    prisma.employeeCall.findMany({
      where: {
        clientId: client.id,
        ...(filter.outcomes.length ? { outcome: { in: filter.outcomes } } : {}),
      },
      orderBy: { startedAt: "desc" },
      take: 100,
    }),
    prisma.employeeCall.groupBy({
      by: ["outcome"],
      where: { clientId: client.id },
      _count: { _all: true },
    }),
    prisma.clientProfile.findUnique({
      where: { id: client.id },
      select: { voiceNumber: true, voiceToken: true, voiceEnabled: true },
    }),
  ]);

  const countFor = (outcomes: CallOutcome[]) =>
    counts
      .filter((c) => !outcomes.length || outcomes.includes(c.outcome))
      .reduce((n, c) => n + c._count._all, 0);

  const total = countFor([]);
  const missedCount = countFor(["MISSED", "VOICEMAIL", "FAILED"]);
  const answered = total - missedCount;

  /**
   * Retry a recovery text that never went.
   *
   * `runTextBack` always produces a reason when it refuses, and the reason is
   * the useful part — so a refusal is written onto the call rather than
   * swallowed. A button that appears to do nothing is how a client concludes
   * the whole feature is broken.
   */
  async function retryTextBack(formData: FormData) {
    "use server";
    const { client: c } = await requireClient();
    const id = String(formData.get("callId") ?? "");
    const call = await prisma.employeeCall.findFirst({
      where: { id, clientId: c.id },
      select: { id: true },
    });
    if (!call) return;

    const result = await runTextBack(call.id);
    if (!result.sent) {
      await prisma.employeeCall.update({
        where: { id: call.id },
        data: { textBackError: result.detail },
      });
    }
    revalidatePath("/app/calls");
  }

  const webhookUrl = profile?.voiceToken
    ? `${env.publicUrl}/api/voice/${client.id}?token=${profile.voiceToken}`
    : null;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {patch.name} · {patch.role}
        </p>
        <h1 className="text-2xl font-semibold">The phone</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{patch.leak}</p>
      </header>

      {!profile?.voiceEnabled && (
        <Card className="border-l-2 border-l-magenta p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-magenta" />
            <div className="space-y-2 text-sm">
              <p className="font-medium">The phone is not answering yet.</p>
              <p className="text-muted-foreground">
                Nothing is being answered on your behalf until the number is wired and voice is
                switched on. That is deliberate — answering somebody&apos;s phone is not a thing to
                turn on for them by default.
              </p>
              {webhookUrl && (
                <p className="break-all font-mono text-xs text-muted-foreground">
                  Point your carrier at: {webhookUrl}
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Answered</p>
          <p className="mt-1 text-2xl font-semibold">{answered}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Calls that reached a conversation instead of a beep.
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Never reached</p>
          <p className="mt-1 text-2xl font-semibold text-magenta">{missedCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Recorded on purpose. A switchboard that only logs its wins can&apos;t be audited.
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Booked on the call</p>
          <p className="mt-1 text-2xl font-semibold text-cyan">{countFor(["BOOKED"])}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The yes that went straight into the diary.
          </p>
        </Card>
      </div>

      <nav className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/app/calls?filter=${f.key}`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition",
              f.key === filter.key
                ? "border-cyan/50 bg-cyan/10 text-cyan"
                : "border-border text-muted-foreground hover:border-cyan/30",
            )}
          >
            {f.label} · {countFor(f.outcomes)}
          </Link>
        ))}
      </nav>

      {calls.length === 0 ? (
        <Card className="p-8 text-center">
          <PhoneCall className="mx-auto h-6 w-6 text-muted-foreground" />
          <CardTitle className="mt-3 text-base">Nothing here</CardTitle>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {total === 0
              ? "No calls yet. When the number is live, every one that comes in lands here — including the ones nobody reached."
              : `${total} call${total === 1 ? "" : "s"} on record, none matching this filter.`}
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {calls.map((call) => {
            const style = OUTCOME_STYLE[call.outcome] ?? OUTCOME_STYLE.MESSAGE;
            const facts = (call.collected ?? {}) as CallFacts;
            const outstanding = missing(facts).filter((s) => s.required);
            return (
              <Card key={call.id} className={cn("border-l-2 p-5", style.edge)}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {call.direction === "INBOUND" ? (
                        <PhoneIncoming className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <PhoneOutgoing className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-medium">
                        {call.callerName || facts.name || formatNumber(call.fromNumber)}
                      </span>
                      <Badge variant="muted" className={cn("text-[10px]", style.chip)}>
                        {call.outcome.replace(/_/g, " ").toLowerCase()}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(call.fromNumber)} · {ageLabel(call.startedAt, now)} ·{" "}
                      {duration(call.durationSeconds)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {call.outcome === "BOOKED" && <CalendarCheck className="h-4 w-4 text-cyan" />}
                    {call.outcome === "ESTIMATE_REQUESTED" && (
                      <FileText className="h-4 w-4 text-violet" />
                    )}
                    {call.leadId && (
                      <Link
                        href="/app/leads"
                        className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                      >
                        View lead
                      </Link>
                    )}
                  </div>
                </div>

                {call.summary && <p className="mt-3 text-sm">{call.summary}</p>}
                {facts.job && !call.summary && <p className="mt-3 text-sm">{facts.job}</p>}

                {outstanding.length > 0 && call.outcome !== "MISSED" && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Still unknown: {outstanding.map((s) => s.field).join(", ")} —{" "}
                    {outstanding[0].why}
                  </p>
                )}

                {call.direction === "INBOUND" &&
                  ["MISSED", "VOICEMAIL"].includes(call.outcome) && (
                    <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3">
                      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                      {call.textBackSentAt ? (
                        <span className="text-xs text-muted-foreground">
                          Recovery text sent {ageLabel(call.textBackSentAt, now)}.
                        </span>
                      ) : (
                        <>
                          <span className="text-xs text-magenta">
                            No recovery text went out
                            {call.textBackError ? ` — ${call.textBackError}` : ""}.
                          </span>
                          <form action={retryTextBack}>
                            <input type="hidden" name="callId" value={call.id} />
                            <Button type="submit" variant="outline" size="sm">
                              Send it now
                            </Button>
                          </form>
                        </>
                      )}
                    </div>
                  )}
              </Card>
            );
          })}
        </ul>
      )}

      {webhookUrl && (
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <Copy className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Your line&apos;s endpoint</p>
              <p className="break-all font-mono text-xs text-muted-foreground">{webhookUrl}</p>
              <p className="text-xs text-muted-foreground">
                This carries a secret. Treat it like a password — anyone holding it can post calls
                into your account.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
