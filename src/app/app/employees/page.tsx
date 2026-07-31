import Link from "next/link";
import { PhoneCall, Receipt, CalendarDays, ArrowRight, Info } from "lucide-react";
import { requireClient } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { CREW, EMPLOYEES, crewRing, employeeByKey } from "@/lib/employees";
import { headlines, scoreboard, stillLeaking } from "@/lib/scoreboard";
import { hoursFor, settingsFor } from "@/lib/bookings";
import { formatCurrency } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * The crew, together.
 *
 * The three employees have a page each. This is the one that says why they are
 * three and not three features — the ring, and the count of what it caught.
 *
 * The numbers here are the client's own rows counted, every one carrying its
 * own derivation on the face of it. See the top of `scoreboard.ts` for why this
 * page is allowed to show figures at all when nothing on the public site is.
 */

const HOME: Record<string, { href: string; icon: typeof PhoneCall }> = {
  switchboard: { href: "/app/calls", icon: PhoneCall },
  estimator: { href: "/app/estimates", icon: Receipt },
  booker: { href: "/app/bookings", icon: CalendarDays },
};

/** How far back the scoreboard looks. Stated on the page, not hidden here. */
const WINDOW_DAYS = 30;

export default async function EmployeesPage() {
  const { client } = await requireClient();
  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);

  const [calls, estimates, bookings, outcomes, hours, settings] = await Promise.all([
    prisma.employeeCall.findMany({
      where: { clientId: client.id, startedAt: { gte: since } },
      select: {
        direction: true,
        outcome: true,
        startedAt: true,
        durationSeconds: true,
        textBackSentAt: true,
      },
    }),
    prisma.estimate.findMany({
      where: { clientId: client.id, createdAt: { gte: since } },
      select: { status: true, createdAt: true, sentAt: true, totalCents: true },
    }),
    prisma.booking.findMany({
      where: { clientId: client.id, createdAt: { gte: since } },
      select: { source: true, status: true, startsAt: true, createdAt: true },
    }),
    prisma.dealOutcome.findMany({
      where: { clientId: client.id, createdAt: { gte: since } },
      select: { outcome: true, valueCents: true, createdAt: true },
    }),
    hoursFor(client.id),
    settingsFor(client.id),
  ]);

  const board = scoreboard({
    calls,
    estimates,
    bookings,
    // `valueCents` defaults to 0 on the model, and 0 means "logged without a
    // figure" rather than "worth nothing" — `attributionOf` only totals the
    // ones carrying a real number, so it is passed through as null.
    outcomes: outcomes.map((o) => ({
      kind: o.outcome,
      valueCents: o.valueCents > 0 ? o.valueCents : null,
      createdAt: o.createdAt,
    })),
    hours,
    timeZone: settings.timeZone,
  });

  const leak = stillLeaking(board);
  const ring = crewRing();

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{CREW.eyebrow}</p>
        <h1 className="text-2xl font-semibold">{CREW.headline}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{CREW.body}</p>
      </header>

      {/* ---- What it caught ---- */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <CardTitle className="text-base">The last {WINDOW_DAYS} days</CardTitle>
          <span className="text-xs text-muted-foreground">Your rows, counted</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {headlines(board).map((h) => (
            <Card key={h.label} className="p-5">
              <p className="text-3xl font-semibold text-cyan">{h.value}</p>
              <p className="mt-1 text-sm">{h.label}</p>
              <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                {h.basis}
              </p>
            </Card>
          ))}
        </div>

        {leak && (
          <Card className="border-l-2 border-l-magenta p-4">
            <p className="text-sm text-magenta">{leak}</p>
          </Card>
        )}

        <Card className="p-5">
          <p className="text-sm font-medium">What your own closed deals say</p>
          {board.attribution ? (
            <p className="mt-2 text-sm text-muted-foreground">
              You logged {board.attribution.won} won and {board.attribution.lost} lost in this
              window
              {board.attribution.wonValueCents !== null
                ? `, worth ${formatCurrency(board.attribution.wonValueCents)} on the ones you put a figure against.`
                : ". None of them carried a value, so there is no total to show."}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              You haven&apos;t logged any closed deals in this window, so there is nothing here we
              can honestly total. Mark a lead won or lost on{" "}
              <Link href="/app/leads" className="underline underline-offset-4">
                your leads
              </Link>{" "}
              and this fills in — from your figures, never ours.
            </p>
          )}
        </Card>
      </section>

      {/* ---- The three ---- */}
      <section className="space-y-3">
        <CardTitle className="text-base">Who is on</CardTitle>
        <div className="space-y-3">
          {EMPLOYEES.map((e) => {
            const home = HOME[e.key];
            const Icon = home.icon;
            const next = employeeByKey(e.handsTo)!;
            return (
              <Card key={e.key} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <Icon className="mt-1 h-5 w-5 shrink-0 text-cyan" />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{e.name}</span>
                        <Badge variant="muted" className="text-[10px]">
                          {e.role}
                        </Badge>
                      </div>
                      <p className="max-w-xl text-sm text-muted-foreground">{e.leak}</p>
                    </div>
                  </div>
                  <Link
                    href={home.href}
                    className="flex items-center gap-1 text-sm text-cyan underline-offset-4 hover:underline"
                  >
                    Open <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

                <p className="mt-3 max-w-2xl border-t border-border pt-3 text-sm">{e.winsBy}</p>

                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {e.duties.map((d) => (
                    <li key={d}>· {d}</li>
                  ))}
                </ul>

                <p className="mt-3 text-xs text-muted-foreground">
                  Hands to <span className="text-cyan">{next.name}</span>.
                </p>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ---- The ring ---- */}
      <Card className="p-5">
        <CardTitle className="text-base">Why three</CardTitle>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Each one hands to the next, and the last hands back to the first — tomorrow&apos;s diary
          is what {employeeByKey("switchboard")!.name} rings out about tonight. Any one of them
          alone just moves the leak one step downstream.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          {ring.map((key, i) => (
            <span key={key} className="flex items-center gap-2">
              <span className="rounded-full border border-cyan/40 px-3 py-1 text-cyan">
                {employeeByKey(key)!.name}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              {i === ring.length - 1 && (
                <span className="rounded-full border border-border px-3 py-1 text-muted-foreground">
                  {employeeByKey(ring[0])!.name}
                </span>
              )}
            </span>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">{CREW.boundary}</p>
      </Card>
    </div>
  );
}
