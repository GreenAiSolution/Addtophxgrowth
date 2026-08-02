import { revalidatePath } from "next/cache";
import Link from "next/link";
import {
  BriefcaseBusiness,
  CircleAlert,
  Clock,
  Plug,
  ShieldCheck,
  CircleCheck,
  CircleHelp,
} from "lucide-react";
import { requireClient } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { EMPLOYEES, isOnShift, employeeBySlug } from "@/lib/employees";
import { CONNECTORS, connectorStatus } from "@/lib/connectors";
import { reasonLabel, type EscalationReason } from "@/lib/resilience";
import { kindByKey } from "@/lib/gate";
import { cn, formatCurrency } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * THE DESK.
 *
 * The screen that answers the question anybody sensible asks before letting
 * software near their customers: what is this thing allowed to do, what has it
 * done, and what is it waiting on me for.
 *
 * Order is deliberate and it is not the order the system finds most natural.
 * Escalations come first — they are the only part of this page where *the
 * business* is the bottleneck, and everything else can wait a scroll. Then the
 * employees and their written authority, then the record of what they did, then
 * the stack, which is the least urgent and the most reassuring.
 *
 * The authority block is printed in full rather than summarised. A ceiling
 * shown as "configured" is a ceiling nobody has read.
 */

const RUN_STYLE: Record<string, { badge: string; label: string }> = {
  RUNNING: { badge: "border-cyan/40 text-cyan", label: "Working" },
  COMPLETE: { badge: "border-signal/40 text-signal", label: "Done" },
  ESCALATED: { badge: "border-gold/40 text-gold", label: "Asked you" },
  FAILED: { badge: "border-magenta/40 text-magenta", label: "Failed" },
  SKIPPED: { badge: "border-border text-muted-foreground", label: "Skipped" },
};

const STATE_LABEL: Record<string, string> = {
  TRIAL: "Supervised",
  ACTIVE: "Working",
  SUSPENDED: "Stopped",
};

function when(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export default async function EmployeesPage() {
  const { client, actor } = await requireClient();

  /*
    Guarded like the queue is, and for the same reason. This page's whole job is
    to prove a client can see what an unattended system is doing on their
    behalf; rendering a framework error here reads exactly like the system
    hiding something.
  */
  let employments: { employeeSlug: string; state: string; moneyCeilingCents: number | null; hiredAt: Date }[] = [];
  let escalations: {
    id: string;
    title: string;
    body: string;
    question: string;
    reason: string;
    employeeSlug: string;
    createdAt: Date;
  }[] = [];
  let runs: {
    id: string;
    employeeSlug: string;
    dutyKey: string;
    status: string;
    summary: string | null;
    confidence: number | null;
    reviewed: number | null;
    proposed: number;
    startedAt: Date;
    contextDropped: unknown;
  }[] = [];
  let dbError: string | null = null;

  try {
    [employments, escalations, runs] = await Promise.all([
      prisma.employment.findMany({
        where: { clientId: client.id },
        select: { employeeSlug: true, state: true, moneyCeilingCents: true, hiredAt: true },
      }),
      prisma.escalation.findMany({
        where: { clientId: client.id, state: "OPEN" },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          title: true,
          body: true,
          question: true,
          reason: true,
          employeeSlug: true,
          createdAt: true,
        },
      }),
      prisma.employeeRun.findMany({
        where: { clientId: client.id },
        orderBy: { startedAt: "desc" },
        take: 15,
        select: {
          id: true,
          employeeSlug: true,
          dutyKey: true,
          status: true,
          summary: true,
          confidence: true,
          reviewed: true,
          proposed: true,
          startedAt: true,
          contextDropped: true,
        },
      }),
    ]);
  } catch {
    dbError =
      "The desk cannot reach its storage, so nothing can be shown right now. Nothing is running " +
      "either — the same failure stops the shift, so no employee is working unobserved. " +
      "Check /api/health for which half is wrong.";
  }

  /**
   * Answering an escalation is a server action for the same reason releasing a
   * held action is: the shortest possible path from a signed-in person to a
   * row, with nothing in between that could show one thing and record another.
   */
  async function resolve(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    const answer = String(formData.get("answer") ?? "").trim();
    const verb = String(formData.get("verb") ?? "");
    const { client: c, actor: a } = await requireClient();

    const owned = await prisma.escalation.findFirst({
      where: { id, clientId: c.id, state: "OPEN" },
      select: { id: true },
    });
    if (!owned) return;

    await prisma.escalation.update({
      where: { id: owned.id },
      data: {
        state: verb === "dismiss" ? "DISMISSED" : "ANSWERED",
        answer: answer || null,
        answeredBy: a.email || "a signed-in user",
        answeredAt: new Date(),
      },
    });
    revalidatePath("/app/employees");
  }

  const byslug = new Map(employments.map((e) => [e.employeeSlug, e]));
  const hired = EMPLOYEES.filter((e) => byslug.has(e.slug));
  const now = new Date();
  const lastRun = new Map<string, Date>();
  for (const r of runs) {
    const key = `${r.employeeSlug}:${r.dutyKey}`;
    if (!lastRun.has(key)) lastRun.set(key, r.startedAt);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
            <BriefcaseBusiness className="h-5 w-5 text-cyan" />
            The Desk
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Employees, not chat windows. They work a shift whether or not anybody is logged in,
            they can read your records, and everything they want to do waits for you in{" "}
            <Link href="/app/gate" className="text-cyan hover:underline">
              the queue
            </Link>
            .
          </p>
        </div>
        <div className="flex gap-3">
          <div
            className={cn(
              "rounded-xl border px-4 py-2.5 text-center",
              escalations.length > 0 ? "border-gold/40 bg-gold/[0.06]" : "border-border bg-card",
            )}
          >
            <div
              className={cn(
                "font-mono text-xl font-bold tabular-nums",
                escalations.length > 0 && "text-gold",
              )}
            >
              {escalations.length}
            </div>
            <div className="text-[0.68rem] text-muted-foreground">waiting on you</div>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-2.5 text-center">
            <div className="font-mono text-xl font-bold tabular-nums">{hired.length}</div>
            <div className="text-[0.68rem] text-muted-foreground">hired</div>
          </div>
        </div>
      </header>

      {dbError && (
        <Card className="border-magenta/40 p-8">
          <CardTitle className="flex items-center gap-2">
            <CircleAlert className="h-4 w-4 text-magenta" />
            The desk is unavailable
          </CardTitle>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{dbError}</p>
        </Card>
      )}

      {/* ---- Waiting on a person ---- */}
      {escalations.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
            Waiting on you
          </h2>
          {escalations.map((e) => {
            const employee = employeeBySlug(e.employeeSlug);
            return (
              <Card key={e.id} className="border-gold/30 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="muted" className="border-gold/40 text-[0.62rem] text-gold">
                    <CircleHelp className="mr-1 h-3 w-3" />
                    {reasonLabel(e.reason as EscalationReason)}
                  </Badge>
                  <span className="text-[0.7rem] text-muted-foreground">
                    {employee?.name ?? e.employeeSlug} · {when(e.createdAt)}
                  </span>
                </div>
                <p className="mt-2.5 font-medium">{e.question}</p>
                <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-border bg-black/30 p-3 text-[0.72rem] leading-relaxed text-muted-foreground">
                  {e.body}
                </pre>
                <form action={resolve} className="mt-4 space-y-2">
                  <input type="hidden" name="id" value={e.id} />
                  <Textarea
                    name="answer"
                    rows={2}
                    placeholder="Your answer — it is kept on the record beside the question."
                    className="text-sm"
                  />
                  <div className="flex gap-2">
                    <Button type="submit" name="verb" value="answer" size="sm">
                      Answer
                    </Button>
                    <Button type="submit" name="verb" value="dismiss" size="sm" variant="ghost">
                      Nothing needed
                    </Button>
                  </div>
                </form>
              </Card>
            );
          })}
        </section>
      )}

      {/* ---- The roster ---- */}
      <section className="space-y-3">
        <h2 className="text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
          The roster
        </h2>

        {EMPLOYEES.map((employee) => {
          const employment = byslug.get(employee.slug);
          const ceiling = employment?.moneyCeilingCents ?? employee.authority.moneyCeilingCents;

          return (
            <Card key={employee.slug} className={cn("p-5", !employment && "opacity-70")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>{employee.name}</CardTitle>
                    <Badge
                      variant="muted"
                      className={cn(
                        "text-[0.62rem]",
                        employment?.state === "ACTIVE"
                          ? "border-signal/40 text-signal"
                          : employment?.state === "TRIAL"
                            ? "border-gold/40 text-gold"
                            : "border-border text-muted-foreground",
                      )}
                    >
                      {employment ? STATE_LABEL[employment.state] : "Not hired"}
                    </Badge>
                  </div>
                  <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
                    {employee.hiredFor}
                  </p>
                </div>
              </div>

              <p className="mt-4 text-[0.72rem] uppercase tracking-[0.14em] text-muted-foreground">
                Judged on
              </p>
              <p className="mt-1 max-w-2xl text-sm">{employee.accountableFor}</p>

              {/* The written authority, in full. */}
              <div className="mt-4 rounded-lg border border-border p-4">
                <p className="flex items-center gap-1.5 text-[0.72rem] uppercase tracking-[0.14em] text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-gold" />
                  What it may do without asking
                </p>
                <ul className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
                  {employee.authority.mayPropose.map((k) => {
                    const kind = kindByKey(k);
                    return (
                      <li key={k} className="flex items-center justify-between gap-3 text-sm">
                        <span>{kind?.label ?? k}</span>
                        <Badge
                          variant="muted"
                          className={cn(
                            "shrink-0 text-[0.62rem]",
                            kind?.movesMoney
                              ? "border-gold/40 text-gold"
                              : "border-border text-muted-foreground",
                          )}
                        >
                          {kind?.movesMoney
                            ? "always waits for you"
                            : `${kind?.reviewWindowMinutes}m to pull`}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 border-t border-border pt-3 text-sm">
                  Commits up to{" "}
                  <span className="font-mono text-gold">{formatCurrency(ceiling)}</span> before it
                  has to ask. Above that it stops and puts the question to you rather than drafting
                  a number you would have to argue with.
                </p>
                <ul className="mt-2 space-y-1">
                  {employee.authority.neverWithoutAPerson.map((line) => (
                    <li key={line} className="text-[0.75rem] text-muted-foreground">
                      · {line}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Duties + shift */}
              <div className="mt-4 space-y-2">
                {employee.duties.map((duty) => {
                  const last = lastRun.get(`${employee.slug}:${duty.key}`);
                  const due = isOnShift(duty.shift, now, last);
                  return (
                    <div
                      key={duty.key}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{duty.name}</p>
                        <p className="text-[0.75rem] text-muted-foreground">{duty.outcome}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-[0.7rem] text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {duty.shift.label}
                        {employment && (
                          <Badge
                            variant="muted"
                            className={cn(
                              "text-[0.62rem]",
                              due ? "border-cyan/40 text-cyan" : "border-border",
                            )}
                          >
                            {last ? (due ? "due" : `last ${when(last)}`) : "not run yet"}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {!employment && (
                <p className="mt-4 text-[0.75rem] text-muted-foreground">
                  {employee.name} staffs an automation build that is not running on this account
                  yet. Nothing about it is switched on, and it cannot read your records until it
                  is.
                </p>
              )}
            </Card>
          );
        })}
      </section>

      {/* ---- What they did ---- */}
      <section className="space-y-3">
        <h2 className="text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
          Recent shifts
        </h2>
        {runs.length === 0 ? (
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">
              No shift has been worked yet. When one is, every run appears here with what it
              looked at, what it proposed, and how sure it was.
            </p>
          </Card>
        ) : (
          <Card className="divide-y divide-border">
            {runs.map((r) => {
              const employee = employeeBySlug(r.employeeSlug);
              const duty = employee?.duties.find((d) => d.key === r.dutyKey);
              const style = RUN_STYLE[r.status] ?? RUN_STYLE.SKIPPED!;
              const dropped = Array.isArray(r.contextDropped) ? r.contextDropped.length : 0;

              return (
                <div key={r.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="muted" className={cn("text-[0.62rem]", style.badge)}>
                      {style.label}
                    </Badge>
                    <span className="text-sm">{duty?.name ?? r.dutyKey}</span>
                    <span className="text-[0.7rem] text-muted-foreground">
                      {employee?.name ?? r.employeeSlug} · {when(r.startedAt)}
                    </span>
                  </div>
                  {r.summary && <p className="mt-1.5 text-sm text-muted-foreground">{r.summary}</p>}
                  <p className="mt-1.5 font-mono text-[0.7rem] text-muted-foreground">
                    {r.reviewed ?? 0} read · {r.proposed} proposed
                    {r.confidence != null && ` · ${(r.confidence * 100).toFixed(0)}% sure`}
                    {dropped > 0 && ` · ${dropped} context block(s) left out for space`}
                  </p>
                </div>
              );
            })}
          </Card>
        )}
      </section>

      {/* ---- The stack ---- */}
      <section className="space-y-3">
        <h2 className="text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
          What they can reach
        </h2>
        <Card className="p-5">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Every connection an employee has, and every operation it can perform through it.
            Nothing that changes anything is on this list without a gate behind it — that is
            enforced in code, not by policy.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {CONNECTORS.map((c) => (
              <div key={c.key} className="rounded-lg border border-border p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <Plug className="h-3.5 w-3.5 text-cyan" />
                    {c.name}
                  </p>
                  <Badge
                    variant="muted"
                    className={cn(
                      "text-[0.62rem]",
                      connectorStatus(c) === "LIVE"
                        ? "border-signal/40 text-signal"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {connectorStatus(c) === "LIVE" ? "wired" : "not wired yet"}
                  </Badge>
                </div>
                <p className="mt-1 text-[0.72rem] text-muted-foreground">{c.purpose}</p>
                <ul className="mt-2.5 space-y-1">
                  {c.operations.map((op) => (
                    <li key={op.key} className="flex items-center gap-1.5 text-[0.72rem]">
                      {op.direction === "WRITE" ? (
                        <ShieldCheck className="h-3 w-3 shrink-0 text-gold" />
                      ) : (
                        <CircleCheck className="h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                      <span className={op.status === "LIVE" ? "" : "text-muted-foreground"}>
                        {op.name}
                      </span>
                      {op.direction === "WRITE" && (
                        <span className="text-muted-foreground">— gated</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <p className="text-[0.7rem] text-muted-foreground">
        Signed in as {actor.email}. Everything on this page is scoped to {client.businessName}.
      </p>
    </div>
  );
}
