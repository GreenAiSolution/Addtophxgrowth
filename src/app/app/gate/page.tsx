import { revalidatePath } from "next/cache";
import { ShieldCheck, Clock, Ban, CircleCheck, CircleAlert, Hourglass } from "lucide-react";
import { requireClient } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import {
  ACTION_KINDS,
  kindByKey,
  canRelease,
  canWithdraw,
  describeWait,
  hasExecutor,
  release,
  withdraw,
  type GateAction,
} from "@/lib/gate";
import { cn } from "@/lib/utils";
// Side-effect import: registers the Comeback executors so the queue reports
// comeback actions as wired ("needs you") rather than as an unwired loop.
import "@/lib/outreach/comeback";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { GateState } from "@prisma/client";

/**
 * THE QUEUE.
 *
 * The screen the catalogue's oversight promise points at. Two sentences on a
 * public price list say a client can read what an automation intends to do
 * before it does it, pull anything out, and see afterwards what happened —
 * and none of that means anything without somewhere to look.
 *
 * Built before either automation exists, so it opens empty. That is the right
 * order: a queue added after a loop has been running is a queue with a gap in
 * its history exactly where the trust was supposed to be.
 *
 * WHAT THE EMPTY STATE HAS TO DO
 *   Say why it is empty without implying something is broken, and show what
 *   *would* appear here, because the promise is easier to believe when the
 *   list of gated actions is visible before anything is queued.
 */

const FILTERS = [
  { key: "open", label: "Waiting", states: ["HELD", "RELEASED"] as GateState[] },
  { key: "money", label: "Moves money", states: ["HELD", "RELEASED"] as GateState[], money: true },
  { key: "done", label: "Done", states: ["EXECUTED"] as GateState[] },
  { key: "stopped", label: "Stopped", states: ["WITHDRAWN", "EXPIRED", "FAILED"] as GateState[] },
];

const STATE_STYLE: Record<GateState, { badge: string; icon: typeof Clock; label: string }> = {
  HELD: { badge: "border-gold/40 text-gold", icon: Hourglass, label: "Held" },
  RELEASED: { badge: "border-cyan/40 text-cyan", icon: CircleCheck, label: "Released" },
  EXECUTED: { badge: "border-signal/40 text-signal", icon: CircleCheck, label: "Done" },
  WITHDRAWN: { badge: "border-border text-muted-foreground", icon: Ban, label: "Pulled" },
  EXPIRED: { badge: "border-border text-muted-foreground", icon: Clock, label: "Lapsed" },
  FAILED: { badge: "border-magenta/40 text-magenta", icon: CircleAlert, label: "Failed" },
};

export default async function GatePage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const { client, actor } = await requireClient();
  const filter = FILTERS.find((f) => f.key === searchParams.filter) ?? FILTERS[0]!;

  /*
    Every read is guarded, and the failure is shown rather than thrown.

    The table did not exist in production when this shipped — the repo had
    never had `db push` run against it — and an unguarded query here would
    have rendered the framework's error page. "Something went wrong" on the
    screen whose entire job is to prove a client can see what an automation is
    about to do is close to the worst possible failure, because it looks
    exactly like the automation hiding something.
  */
  let actions: Awaited<ReturnType<typeof prisma.pendingAction.findMany>> = [];
  let waiting = 0;
  let waitingMoney = 0;
  let dbError: string | null = null;

  try {
    [actions, waiting, waitingMoney] = await Promise.all([
      prisma.pendingAction.findMany({
        where: {
          clientId: client.id,
          state: { in: filter.states },
          ...("money" in filter && filter.money ? { movesMoney: true } : {}),
        },
        orderBy: [{ state: "asc" }, { createdAt: "desc" }],
        take: 100,
      }),
      prisma.pendingAction.count({ where: { clientId: client.id, state: "HELD" } }),
      prisma.pendingAction.count({
        where: { clientId: client.id, state: "HELD", movesMoney: true },
      }),
    ]);
  } catch {
    dbError =
      "The queue cannot reach its storage, so nothing can be shown or released right now. " +
      "No automation is running either — the same failure stops the sweep, so nothing has " +
      "gone out unreviewed. Check /api/health for which half is wrong.";
  }

  /**
   * Server actions rather than a client component. The release path should be
   * as short as it can possibly be: session → ownership → state machine →
   * database, with no fetch, no JSON round-trip and no client-side state that
   * could get out of step with what is actually queued.
   */
  async function act(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    const verb = String(formData.get("verb") ?? "");
    const { client: c, actor: a } = await requireClient();

    // Re-scoped inside the action. The form is user input like any other.
    const owned = await prisma.pendingAction.findFirst({
      where: { id, clientId: c.id },
      select: { id: true },
    });
    if (!owned) return;

    const name = a.email || "a signed-in user";
    if (verb === "release") await release(owned.id, { name, userId: a.userId });
    if (verb === "withdraw") await withdraw(owned.id, { name });
    revalidatePath("/app/gate");
  }

  const now = new Date();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
            <ShieldCheck className="h-5 w-5 text-gold" />
            The Queue
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Everything an automation wants to do on your behalf lands here first. Anything that
            moves money waits until you release it — and every release is recorded against your
            name.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="rounded-xl border border-border bg-card px-4 py-2.5 text-center">
            <div className="font-mono text-xl font-bold tabular-nums">{waiting}</div>
            <div className="text-[0.68rem] text-muted-foreground">waiting</div>
          </div>
          <div
            className={cn(
              "rounded-xl border px-4 py-2.5 text-center",
              waitingMoney > 0 ? "border-gold/40 bg-gold/[0.06]" : "border-border bg-card",
            )}
          >
            <div
              className={cn(
                "font-mono text-xl font-bold tabular-nums",
                waitingMoney > 0 && "text-gold",
              )}
            >
              {waitingMoney}
            </div>
            <div className="text-[0.68rem] text-muted-foreground">need you</div>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <a
            key={f.key}
            href={`/app/gate?filter=${f.key}`}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs transition-colors",
              f.key === filter.key
                ? "border-cyan/40 bg-cyan/10 text-cyan"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </a>
        ))}
      </div>

      {dbError ? (
        <Card className="border-magenta/40 p-8">
          <CardTitle className="flex items-center gap-2">
            <CircleAlert className="h-4 w-4 text-magenta" />
            The queue is unavailable
          </CardTitle>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{dbError}</p>
        </Card>
      ) : actions.length === 0 ? (
        <Card className="p-8">
          <CardTitle>Nothing queued</CardTitle>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            No automation has proposed anything yet. When one does, it appears here before it
            happens — not after.
          </p>
          <div className="mt-6 border-t border-border pt-5">
            <p className="text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
              What passes through this queue
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {ACTION_KINDS.map((k) => (
                <li
                  key={k.key}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <span>{k.label}</span>
                  <Badge
                    variant="muted"
                    className={cn(
                      "shrink-0 text-[0.62rem]",
                      k.movesMoney ? "border-gold/40 text-gold" : "border-border text-muted-foreground",
                    )}
                  >
                    {k.movesMoney ? "needs you" : `${k.reviewWindowMinutes}m to pull`}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {actions.map((a) => {
            const kind = kindByKey(a.kind);
            const style = STATE_STYLE[a.state];
            const Icon = style.icon;
            const view = a as unknown as GateAction;
            const unwired = a.state === "HELD" && !hasExecutor(a.kind);

            return (
              <Card
                key={a.id}
                className={cn("p-5", a.movesMoney && a.state === "HELD" && "border-gold/30")}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="muted" className={cn("text-[0.62rem]", style.badge)}>
                        <Icon className="mr-1 h-3 w-3" />
                        {style.label}
                      </Badge>
                      <span className="text-[0.7rem] text-muted-foreground">
                        {kind?.label ?? a.kind}
                      </span>
                      {a.movesMoney && (
                        <Badge variant="muted" className="border-gold/40 text-[0.62rem] text-gold">
                          Moves money
                        </Badge>
                      )}
                      {a.state === "HELD" && (
                        <span className="text-[0.7rem] text-muted-foreground">
                          · {describeWait(view, now)}
                        </span>
                      )}
                    </div>

                    <p className="mt-2.5 font-medium">{a.summary}</p>
                    {a.subject && (
                      <p className="mt-0.5 text-sm text-muted-foreground">{a.subject}</p>
                    )}

                    {/* Inspectable, field by field — the published standard. */}
                    <details className="group mt-3">
                      <summary className="cursor-pointer text-[0.75rem] text-muted-foreground hover:text-foreground">
                        Read exactly what it would do
                      </summary>
                      <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-border bg-black/30 p-3 text-[0.7rem] leading-relaxed">
                        {JSON.stringify(a.payload, null, 2)}
                      </pre>
                    </details>

                    {/* The after-the-fact record. */}
                    {a.releasedAt && (
                      <p className="mt-3 text-[0.72rem] text-muted-foreground">
                        Released {a.autoReleased ? "automatically" : "by"}{" "}
                        <span className="text-foreground">{a.releasedBy}</span> ·{" "}
                        {a.releasedAt.toISOString().slice(0, 16).replace("T", " ")}
                      </p>
                    )}
                    {a.withdrawnAt && (
                      <p className="mt-3 text-[0.72rem] text-muted-foreground">
                        Pulled by <span className="text-foreground">{a.withdrawnBy}</span>
                        {a.withdrawnReason ? ` — ${a.withdrawnReason}` : ""}
                      </p>
                    )}
                    {a.error && (
                      <p className="mt-3 text-[0.72rem] text-magenta">{a.error}</p>
                    )}
                    {unwired && (
                      <p className="mt-3 text-[0.72rem] text-muted-foreground">
                        Nothing can perform this yet — the loop that owns it has not been
                        installed. Releasing it will record a failure rather than send anything.
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {canRelease(view, now) && (
                      <form action={act}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="verb" value="release" />
                        <Button type="submit" size="sm">
                          Release
                        </Button>
                      </form>
                    )}
                    {canWithdraw(view) && (
                      <form action={act}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="verb" value="withdraw" />
                        <Button type="submit" size="sm" variant="outline">
                          Pull it
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-[0.72rem] text-muted-foreground">
        Signed in as {actor.email}. Releases are recorded against this address.
      </p>
    </div>
  );
}
