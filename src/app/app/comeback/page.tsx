import Link from "next/link";
import { revalidatePath } from "next/cache";
import { RotateCcw, ArrowUpCircle, ShieldCheck, CircleAlert, Users } from "lucide-react";
import { requireClient } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { getActiveSubscription } from "@/lib/entitlements";
import {
  summarise,
  recordStatus,
  intervalFor,
  defaultIntervalDays,
  type RecordLike,
} from "@/lib/comeback";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * THE COMEBACK.
 *
 * The read-out the catalogue promises: who was due, who was contacted, and who
 * came back. Everything that actually reaches a customer goes through The Queue
 * first — this page is the history and the source data, not the send button.
 *
 * The numbers are computed by the same pure `summarise` the engine uses, so
 * what a client reads here is exactly what the loop acted on. Every DB read is
 * guarded and its failure shown, not thrown — the schema may not exist yet on a
 * fresh deploy, and "something went wrong" on the page that proves we contact
 * people carefully is close to the worst thing it could say.
 */

export default async function ComebackPage() {
  const { client } = await requireClient();

  // The build attaches to the AI Employees line; a page that lets somebody read
  // customer history they aren't paying for it to work on would be misleading.
  const enabled = client.comebackEnabled;

  if (!enabled) {
    const sub = await getActiveSubscription(client.id, "AI_AGENTS");
    return (
      <div className="space-y-8">
        <Header />
        <Card>
          <div className="flex items-start gap-3">
            <RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />
            <div className="flex-1">
              <CardTitle>The Comeback isn&apos;t switched on yet</CardTitle>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Echo asks your customers for a review. The Comeback asks them back. It dates every
                past job, works out when the next one falls due, and drafts a reminder — or a
                re-approach for the ones who&apos;ve gone quiet — for you to release. The cheapest
                customer you have is one who&apos;s already paid you once, and right now nobody is
                reading the dates that say when to call them.
              </p>
              <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
                Nothing ever reaches a customer without you seeing it first: every message waits in{" "}
                <Link href="/app/gate" className="text-cyan underline-offset-2 hover:underline">
                  The Queue
                </Link>{" "}
                until you release it or pull it.
              </p>
              <Button asChild className="mt-4" size="sm">
                <Link href={sub ? "/app/requests" : "/app/billing"}>
                  <ArrowUpCircle className="h-4 w-4" /> {sub ? "Ask us to add it" : "See the plans"}
                </Link>
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const now = new Date();
  let records: Awaited<ReturnType<typeof prisma.serviceRecord.findMany>> = [];
  let queued = 0;
  let sent = 0;
  let dbError: string | null = null;

  try {
    [records, queued, sent] = await Promise.all([
      prisma.serviceRecord.findMany({
        where: { clientId: client.id },
        orderBy: { completedAt: "asc" },
        take: 500,
      }),
      prisma.pendingAction.count({
        where: { clientId: client.id, build: "comeback", state: { in: ["HELD", "RELEASED"] } },
      }),
      prisma.pendingAction.count({
        where: { clientId: client.id, build: "comeback", state: "EXECUTED" },
      }),
    ]);
  } catch {
    dbError =
      "The customer history can't be reached right now, so nothing can be shown. No messages are " +
      "going out either — the same failure stops the loop. Check /api/health for which half is wrong.";
  }

  async function addRecord(formData: FormData) {
    "use server";
    const { client: c } = await requireClient();
    if (!c.comebackEnabled) return;

    const customerName = String(formData.get("customerName") ?? "").trim();
    const completed = String(formData.get("completedAt") ?? "").trim();
    if (!customerName || !completed) return;
    const completedAt = new Date(completed);
    if (Number.isNaN(completedAt.getTime())) return;

    const service = String(formData.get("service") ?? "").trim() || null;
    const email = String(formData.get("email") ?? "").trim() || null;
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const intervalRaw = String(formData.get("intervalDays") ?? "").trim();
    const intervalDays = intervalRaw ? Math.max(1, Math.round(Number(intervalRaw))) : null;

    await prisma.serviceRecord.create({
      data: {
        clientId: c.id,
        customerName,
        completedAt,
        service,
        email,
        phone,
        intervalDays: Number.isFinite(intervalDays as number) ? intervalDays : null,
        source: "MANUAL",
      },
    });
    revalidatePath("/app/comeback");
  }

  const view = records.map((r) => r as unknown as RecordLike & { id: string });
  const summary = dbError ? null : summarise(view, client.verticalKey, now);
  const tradeInterval = defaultIntervalDays(client.verticalKey);

  return (
    <div className="space-y-8">
      <Header enabled />

      {dbError ? (
        <Card className="border-magenta/40 p-8">
          <CardTitle className="flex items-center gap-2">
            <CircleAlert className="h-4 w-4 text-magenta" />
            The Comeback is unavailable
          </CardTitle>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{dbError}</p>
        </Card>
      ) : (
        <>
          {/* The read-out */}
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="On file" value={summary!.total} />
            <Stat label="Due now" value={summary!.dueNow} accent={summary!.dueNow > 0} />
            <Stat label="Lapsed" value={summary!.dormant} accent={summary!.dormant > 0} />
            <Stat label="Contacted" value={summary!.contacted} />
            <Stat label="Came back" value={summary!.returned} />
            <Stat label="In the queue" value={queued} />
          </div>

          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-gold" />
                  Everything goes through the queue first
                </CardTitle>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  When the loop finds a customer who&apos;s due, it drafts the message and holds it in{" "}
                  The Queue. You can read it, pull anyone out, and release the rest — nothing reaches
                  a customer on its own. {sent > 0 ? `${sent} have been sent so far.` : ""}
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href="/app/gate">Open The Queue →</Link>
              </Button>
            </div>
          </Card>

          {/* Add a past job */}
          <Card>
            <CardTitle>Log a past job</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              In production this is fed from your CRM export or a connected sync — but you can add
              one by hand to see the loop work. Only a name and the date the last job finished are
              required. Leave the interval blank and we use{" "}
              <span className="text-foreground">
                {tradeInterval} days
              </span>{" "}
              for your trade.
            </p>
            <form action={addRecord} className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field name="customerName" label="Customer name" required placeholder="Marcy Bell" />
              <Field name="completedAt" label="Last job completed" type="date" required />
              <Field name="service" label="What was done" placeholder="Full roof replacement" />
              <Field name="intervalDays" label="Interval (days, optional)" type="number" placeholder={String(tradeInterval)} />
              <Field name="email" label="Email (optional)" type="email" placeholder="marcy@example.com" />
              <Field name="phone" label="Phone (optional)" placeholder="(602) 555-0142" />
              <div className="sm:col-span-2">
                <Button type="submit" size="sm">Add to the history</Button>
              </div>
            </form>
          </Card>

          {/* The history */}
          {view.length === 0 ? (
            <Card>
              <div className="flex items-start gap-3">
                <Users className="mt-0.5 h-5 w-5 shrink-0 text-cyan" />
                <div>
                  <CardTitle>No customer history yet</CardTitle>
                  <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                    Add a past job above, or connect your CRM, and the loop will start dating jobs
                    and queueing the ones that fall due.
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <div>
              <h2 className="mb-3 font-heading text-xl font-bold">Customer history</h2>
              <div className="hud-panel divide-y divide-border/40">
                {view
                  .slice()
                  .sort((a, b) => statusRank(a, client.verticalKey, now) - statusRank(b, client.verticalKey, now))
                  .map((r) => {
                    const status = recordStatus(r, client.verticalKey, now);
                    const record = records.find((x) => x.id === r.id)!;
                    return (
                      <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{record.customerName}</div>
                          <div className="hud-label mt-0.5">
                            {record.service ? `${record.service} · ` : ""}
                            {new Intl.DateTimeFormat("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              timeZone: "UTC",
                            }).format(record.completedAt)}
                            {" · every "}
                            {intervalFor(r, client.verticalKey)}d
                          </div>
                        </div>
                        <StatusBadge status={status} />
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Header({ enabled }: { enabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="hud-label">The Comeback</div>
        <h1 className="mt-1 font-heading text-3xl font-bold">Your past customers, on a clock</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Every job you&apos;ve done has a date the next one falls due. The Comeback reads those
          dates, drafts the message, and holds it for you to release.
        </p>
      </div>
      {enabled && <Badge variant="success">Running daily</Badge>}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div
      className={
        "rounded-xl border px-4 py-3 text-center " +
        (accent ? "border-cyan/40 bg-cyan/[0.06]" : "border-border bg-card")
      }
    >
      <div className={"font-mono text-2xl font-bold tabular-nums " + (accent ? "text-cyan" : "")}>
        {value}
      </div>
      <div className="mt-0.5 text-[0.68rem] text-muted-foreground">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = status.startsWith("Lapsed")
    ? "border-magenta/40 text-magenta"
    : status.startsWith("Due")
      ? "border-cyan/40 text-cyan"
      : status === "Came back"
        ? "border-emerald-500/40 text-emerald-400"
        : status === "Do not contact"
          ? "border-border text-muted-foreground"
          : "border-border text-muted-foreground";
  return (
    <Badge variant="muted" className={"shrink-0 text-[0.62rem] " + tone}>
      {status}
    </Badge>
  );
}

/** Sort order for the list: lapsed and due first, quiet ones last. */
function statusRank(r: RecordLike, verticalKey: string | null | undefined, now: Date): number {
  const s = recordStatus(r, verticalKey, now);
  if (s.startsWith("Lapsed")) return 0;
  if (s.startsWith("Due")) return 1;
  if (s === "Contacted, waiting") return 2;
  if (s === "Came back") return 3;
  if (s === "Do not contact") return 5;
  return 4;
}

function Field({
  name,
  label,
  type = "text",
  required,
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-xs">
        {label}
      </Label>
      <Input id={name} name={name} type={type} required={required} placeholder={placeholder} />
    </div>
  );
}
