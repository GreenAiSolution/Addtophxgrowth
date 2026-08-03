import { PhoneMissed, PhoneCall, Clock, FileWarning } from "lucide-react";
import { requireClient } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { leakReport } from "@/lib/conversations/ingest";
import {
  CALLBACK_WINDOW_MINUTES,
  QUOTE_FOLLOWUP_HOURS,
  type LeakKind,
} from "@/lib/conversations/analyze";
import { OBJECTIONS, type Objection } from "@/lib/conversations/taxonomy";
import { formatCurrency } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * What happened after the phone rang.
 *
 * WHY THE LEAKS ARE THE PAGE AND THE TRANSCRIPTS ARE NOT
 *   The temptation with call data is to build a transcript browser. Nobody
 *   reads a transcript browser. The reason to hold this data is that it can
 *   name, this morning, the specific people who tried to buy something and
 *   were dropped — and that list is short, actionable, and has a deadline.
 *
 *   So the leak list is above the fold and everything else is context for it.
 *
 * WHY NO TOTAL IS INVENTED
 *   The headline figure sums only quotes somebody actually said out loud, and
 *   the count of leaks with no figure is shown next to it rather than folded
 *   in at an assumed average. A big satisfying number built on an assumed job
 *   value is the easiest thing on this page to add and the first thing a
 *   client would catch us doing.
 */

export const dynamic = "force-dynamic";

const LEAK_META: Record<LeakKind, { label: string; icon: typeof PhoneMissed }> = {
  MISSED_NO_CALLBACK: { label: "Missed, never returned", icon: PhoneMissed },
  REPEAT_MISSED: { label: "Rang repeatedly, never reached", icon: PhoneMissed },
  PROMISE_BROKEN: { label: "Promised a callback", icon: Clock },
  QUOTE_COLD: { label: "Quote gone cold", icon: FileWarning },
};

export default async function ConversationsPage() {
  const { client } = await requireClient();

  const [report, recent, total] = await Promise.all([
    leakReport(client.id),
    prisma.customerConversation.findMany({
      where: { clientId: client.id },
      orderBy: { startedAt: "desc" },
      take: 12,
      select: {
        id: true,
        contactName: true,
        contactKey: true,
        direction: true,
        channel: true,
        startedAt: true,
        outcome: true,
        quotedCents: true,
        summary: true,
        objections: true,
      },
    }),
    prisma.customerConversation.count({ where: { clientId: client.id } }),
  ]);

  const { leaks, knownCents, unpriced, answer } = report;

  return (
    <div className="space-y-8">
      <div>
        <div className="hud-label">Conversations</div>
        <h1 className="mt-1 font-heading text-3xl font-bold">What happened after the phone rang</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Your ads are measured all the way to the call and then the trail goes cold. This is the
          rest of it: who tried to reach you and did not, what people actually object to, and which
          quotes are going quiet. The list below is arithmetic over your own call records — no
          model, no scoring, nothing that can be wrong about what happened.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="hud-label">Needs a call today</div>
          <div className="hud-value mt-1 text-3xl font-bold text-magenta">{leaks.length}</div>
        </Card>
        <Card>
          <div className="hud-label">Answer rate</div>
          <div className="hud-value mt-1 text-3xl font-bold">
            {answer.rate == null ? "—" : `${Math.round(answer.rate * 100)}%`}
          </div>
          {answer.inbound > 0 && (
            <div className="mt-1 font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground">
              {answer.answered} of {answer.inbound} inbound
            </div>
          )}
        </Card>
        <Card>
          <div className="hud-label">Quoted and waiting</div>
          <div className="hud-value mt-1 text-3xl font-bold">
            {knownCents > 0 ? formatCurrency(knownCents) : "—"}
          </div>
          {unpriced > 0 && (
            <div className="mt-1 font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground">
              plus {unpriced} we cannot price
            </div>
          )}
        </Card>
      </div>

      <div>
        <h2 className="mb-3 flex items-center gap-2 font-heading text-xl font-bold">
          <PhoneMissed className="h-5 w-5 text-magenta" /> Leaking right now
        </h2>

        {leaks.length === 0 ? (
          <Card>
            <p className="text-sm text-muted-foreground">
              {total === 0
                ? "No conversations have been connected yet. Once your call records are flowing, anybody who rings and does not get through shows up here within the hour."
                : "Nothing is leaking. Every inbound call has been answered or returned, no promised callback is overdue, and no quote has gone quiet."}
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {leaks.map((l) => {
              const meta = LEAK_META[l.kind];
              const Icon = meta.icon;
              return (
                <div key={l.conversationId} className="hud-panel flex items-start justify-between gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-magenta" />
                      <span className="hud-label">{meta.label}</span>
                      <Badge variant={l.severity === "CRITICAL" ? "danger" : "warning"}>
                        {l.severity}
                      </Badge>
                    </div>
                    <p className="mt-1.5 font-mono text-sm">{l.contactKey}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{l.detail}</p>
                  </div>
                  {l.valueCents != null && (
                    <span className="hud-value shrink-0 text-sm">{formatCurrency(l.valueCents)}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-3 text-xs text-muted-foreground">
          A missed call counts as leaking after {CALLBACK_WINDOW_MINUTES} minutes with nothing going
          back the other way; a quote after {Math.round(QUOTE_FOLLOWUP_HOURS / 24)} days of silence.
          One customer produces at most one row — three reminders about the same lost job is how a
          list stops getting worked.
        </p>
      </div>

      {recent.length > 0 && (
        <div>
          <h2 className="mb-3 flex items-center gap-2 font-heading text-xl font-bold">
            <PhoneCall className="h-5 w-5 text-cyan" /> Recent conversations
          </h2>
          <div className="hud-panel divide-y divide-border/40">
            {recent.map((c) => {
              const objections = (c.objections ?? []) as unknown as Objection[];
              return (
                <div key={c.id} className="flex items-start justify-between gap-4 p-3 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{c.contactName || c.contactKey}</span>
                    <span className="ml-2 font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground">
                      {c.direction} {c.channel}
                    </span>
                    {c.summary && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">{c.summary}</span>
                    )}
                    {objections.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {objections.map((o) => (
                          <Badge key={o.key} variant="muted">
                            {OBJECTIONS.find((x) => x.key === o.key)?.label ?? o.key}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {c.quotedCents != null && (
                      <span className="hud-value text-sm">{formatCurrency(c.quotedCents)}</span>
                    )}
                    {c.outcome && <Badge variant="muted">{c.outcome.replace(/_/g, " ")}</Badge>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Card>
        <CardTitle>What we hold, and what we do not</CardTitle>
        <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">Nothing is stored without a basis.</strong> Every
            conversation carries a recorded reason we are permitted to hold it, and one that arrives
            without a basis is refused rather than stored and flagged.
          </li>
          <li>
            <strong className="text-foreground">Card numbers, IDs and addresses are stripped
            before storage</strong> — not before display. Names are kept, because names have no
            shape a pattern can catch and pretending otherwise would be the more dangerous claim.
          </li>
          <li>
            <strong className="text-foreground">Only the outcomes that actually resolved reach your
            system memory.</strong> A quote in progress is not a loss, and a call to somebody outside
            your service area is a targeting problem rather than a failed sale — neither is counted
            against your close rate.
          </li>
        </ul>
      </Card>
    </div>
  );
}
