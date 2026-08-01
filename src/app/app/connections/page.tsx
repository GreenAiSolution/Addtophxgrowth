import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  Plug,
  CircleAlert,
  CircleCheck,
  Clock,
  KeyRound,
  ExternalLink,
  Trash2,
  Send,
} from "lucide-react";
import { requireClient } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EVENT_CATALOGUE } from "@/lib/events";
import {
  CONNECTORS,
  acceptedEvents,
  connectorById,
  newSigningSecret,
  validateEndpoint,
} from "@/lib/connectors";
import { attemptDelivery, testEvent } from "@/lib/event-bus";

/**
 * CONNECTIONS.
 *
 * Where a business points the rest of its software at what the operator does.
 *
 * Three things this page is careful about:
 *
 *   1. **The secret is shown once.** It comes back in the redirect and never
 *      again, because a secret that can be re-read on a screen is a secret that
 *      is only as safe as the weakest session that can reach this page.
 *   2. **Test sends are real.** The button posts an actual signed request to
 *      the actual URL and prints the actual response code. A green tick that
 *      only means "we saved your text" is how integrations get discovered to be
 *      broken by a customer rather than by us.
 *   3. **QuickBooks says what it is.** The connector is marked unverified and
 *      the sentence explaining why is printed next to it, not buried.
 */

export const dynamic = "force-dynamic";

const ICON = {
  webhook: Plug,
  zapier: Plug,
  make: Plug,
  n8n: Plug,
  quickbooks: KeyRound,
} as const;

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: { note?: string; secret?: string; error?: string; add?: string };
}) {
  const { client } = await requireClient();

  let connections: Awaited<ReturnType<typeof prisma.connection.findMany>> = [];
  let counts: { connectionId: string; status: string; n: number }[] = [];
  let dbError: string | null = null;
  try {
    connections = await prisma.connection.findMany({
      where: { clientId: client.id },
      orderBy: { createdAt: "asc" },
    });
    const grouped = await prisma.eventDelivery.groupBy({
      by: ["connectionId", "status"],
      where: { clientId: client.id },
      _count: { _all: true },
    });
    counts = grouped.map((g) => ({
      connectionId: g.connectionId,
      status: g.status,
      n: g._count._all,
    }));
  } catch {
    dbError =
      "Connections cannot be read right now. Nothing is being delivered either — the outbox " +
      "runs off the same database. Check /api/health for which half is wrong.";
  }

  async function add(formData: FormData) {
    "use server";
    const { client: c, actor: who } = await requireClient();
    const connectorId = String(formData.get("connector") ?? "");
    const connector = connectorById(connectorId);
    if (!connector) return;

    const label = String(formData.get("label") ?? "").trim() || connector.name;
    const events = formData.getAll("events").map(String).filter(Boolean);

    if (connector.style === "adapter") {
      const realmId = String(formData.get("realmId") ?? "").trim();
      const refreshToken = String(formData.get("refreshToken") ?? "").trim();
      const environment = String(formData.get("environment") ?? "sandbox") === "production"
        ? "production"
        : "sandbox";
      if (!realmId || !refreshToken) {
        redirect(
          `/app/connections?error=${encodeURIComponent(
            "QuickBooks needs both the company id and the refresh token.",
          )}`,
        );
      }
      await prisma.connection.create({
        data: {
          clientId: c.id,
          connector: connector.id,
          label,
          events,
          credentials: { realmId, refreshToken, environment } as never,
          createdBy: who.email ?? who.userId,
        },
      });
      revalidatePath("/app/connections");
      redirect(
        `/app/connections?note=${encodeURIComponent(
          "QuickBooks connected. Release one estimate and check it lands before you rely on it.",
        )}`,
      );
    }

    const checked = validateEndpoint(String(formData.get("url") ?? ""));
    if (!checked.ok) {
      redirect(`/app/connections?error=${encodeURIComponent(checked.why)}`);
    }

    const secret = newSigningSecret();
    await prisma.connection.create({
      data: {
        clientId: c.id,
        connector: connector.id,
        label,
        events,
        url: checked.url,
        secret,
        createdBy: who.email ?? who.userId,
      },
    });
    revalidatePath("/app/connections");
    // The one and only time this string is ever rendered.
    redirect(`/app/connections?secret=${encodeURIComponent(secret)}`);
  }

  async function toggle(formData: FormData) {
    "use server";
    const { client: c } = await requireClient();
    const id = String(formData.get("id") ?? "");
    const owned = await prisma.connection.findFirst({
      where: { id, clientId: c.id },
      select: { id: true, enabled: true },
    });
    if (!owned) return;
    await prisma.connection.update({
      where: { id: owned.id },
      data: { enabled: !owned.enabled },
    });
    revalidatePath("/app/connections");
  }

  async function remove(formData: FormData) {
    "use server";
    const { client: c } = await requireClient();
    const id = String(formData.get("id") ?? "");
    const owned = await prisma.connection.findFirst({
      where: { id, clientId: c.id },
      select: { id: true },
    });
    if (!owned) return;
    await prisma.connection.delete({ where: { id: owned.id } });
    revalidatePath("/app/connections");
    redirect(
      `/app/connections?note=${encodeURIComponent(
        "Disconnected. Anything still queued for it went with it.",
      )}`,
    );
  }

  async function test(formData: FormData) {
    "use server";
    const { client: c } = await requireClient();
    const id = String(formData.get("id") ?? "");
    const owned = await prisma.connection.findFirst({ where: { id, clientId: c.id } });
    if (!owned) return;

    // A real request to the real URL, reported verbatim. Nothing is written to
    // the outbox — a test is not part of the client's event history.
    const result = await attemptDelivery(owned, testEvent(c.id, c.businessName ?? undefined));
    await prisma.connection.update({
      where: { id: owned.id },
      data: result.ok
        ? { lastOkAt: new Date(), lastError: null, consecutiveFailures: 0 }
        : { lastFailAt: new Date(), lastError: result.detail.slice(0, 1000) },
    });
    revalidatePath("/app/connections");
    redirect(
      result.ok
        ? `/app/connections?note=${encodeURIComponent(`Test event delivered — ${result.detail}`)}`
        : `/app/connections?error=${encodeURIComponent(`Test event failed — ${result.detail}`)}`,
    );
  }

  const addingId = searchParams.add;
  const adding = addingId ? connectorById(addingId) : undefined;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
          <Plug className="h-5 w-5 text-cyan" />
          Connections
        </h1>
        <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">
          Point your other software at what the operator does. Every call it finishes, every
          estimate you release and every visit it books can land in QuickBooks, your CRM, a
          spreadsheet or a Slack channel — without anybody retyping it.
        </p>
      </header>

      {searchParams.secret && (
        <Card className="border-gold/50 bg-gold/[0.06] p-4">
          <CardTitle className="flex items-center gap-2 text-gold">
            <KeyRound className="h-4 w-4" />
            Your signing secret — copy it now
          </CardTitle>
          <p className="mt-1.5 text-sm text-muted-foreground">
            This is the only time it will be shown. Your developer uses it to verify the{" "}
            <code className="text-foreground">X-Phx-Signature</code> header, the same way they
            would a Stripe webhook. Lost it? Disconnect and reconnect for a new one.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-background/60 p-3 font-mono text-xs text-foreground">
            {searchParams.secret}
          </pre>
        </Card>
      )}

      {searchParams.note && (
        <Card className="border-signal/40 p-4">
          <p className="flex items-start gap-2 text-sm text-signal">
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
            {searchParams.note}
          </p>
        </Card>
      )}

      {searchParams.error && (
        <Card className="border-destructive/50 p-4">
          <p className="flex items-start gap-2 text-sm text-destructive">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {searchParams.error}
          </p>
        </Card>
      )}

      {dbError && (
        <Card className="border-destructive/50 p-4">
          <p className="text-sm text-destructive">{dbError}</p>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* What is connected                                                   */}
      {/* ------------------------------------------------------------------ */}
      {connections.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Connected
          </h2>
          {connections.map((conn) => {
            const connector = connectorById(conn.connector);
            const Icon = ICON[conn.connector as keyof typeof ICON] ?? Plug;
            const mine = counts.filter((c) => c.connectionId === conn.id);
            const at = (s: string) => mine.find((c) => c.status === s)?.n ?? 0;
            const stuck = conn.consecutiveFailures >= 3;

            return (
              <Card
                key={conn.id}
                className={cn("p-5", !conn.enabled && "opacity-60", stuck && "border-destructive/50")}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0 text-cyan" />
                      <CardTitle className="text-base">{conn.label}</CardTitle>
                      <Badge className="border-border text-muted-foreground">
                        {connector?.name ?? conn.connector}
                      </Badge>
                      {!conn.enabled && (
                        <Badge className="border-border text-muted-foreground">Paused</Badge>
                      )}
                      {connector && !connector.verified && (
                        <Badge className="border-gold/40 text-gold">Unverified</Badge>
                      )}
                    </div>
                    {conn.url && (
                      <p className="mt-1.5 truncate font-mono text-xs text-muted-foreground">
                        {conn.url}
                      </p>
                    )}
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {conn.events.length === 0
                        ? "Everything this connector accepts."
                        : `${conn.events.length} event${conn.events.length === 1 ? "" : "s"}: ${conn.events.join(", ")}`}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <form action={test}>
                      <input type="hidden" name="id" value={conn.id} />
                      <Button type="submit" variant="outline" size="sm">
                        <Send className="h-3.5 w-3.5" />
                        Send test
                      </Button>
                    </form>
                    <form action={toggle}>
                      <input type="hidden" name="id" value={conn.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        {conn.enabled ? "Pause" : "Resume"}
                      </Button>
                    </form>
                    <form action={remove}>
                      <input type="hidden" name="id" value={conn.id} />
                      <Button type="submit" variant="ghost" size="sm" className="text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </form>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-border pt-3 text-xs">
                  <Stat label="delivered" value={at("DELIVERED")} tone="text-signal" />
                  <Stat label="waiting" value={at("PENDING")} tone="text-cyan" />
                  <Stat label="gave up" value={at("FAILED")} tone="text-gold" />
                  <Stat label="refused" value={at("DROPPED")} tone="text-destructive" />
                  {conn.lastOkAt && (
                    <span className="text-muted-foreground">
                      last through {conn.lastOkAt.toLocaleString()}
                    </span>
                  )}
                </div>

                {conn.lastError && (
                  <p
                    className={cn(
                      "mt-3 rounded-lg border px-3 py-2 text-xs",
                      stuck
                        ? "border-destructive/40 bg-destructive/[0.06] text-destructive"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {stuck && <strong>{conn.consecutiveFailures} failures in a row. </strong>}
                    {conn.lastError}
                  </p>
                )}
              </Card>
            );
          })}
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* The add form, or the catalogue                                      */}
      {/* ------------------------------------------------------------------ */}
      {adding ? (
        <Card className="border-cyan/40 p-5">
          <CardTitle className="text-base">Connect {adding.name}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{adding.tagline}</p>

          {!adding.verified && adding.unverifiedNote && (
            <p className="mt-3 rounded-lg border border-gold/40 bg-gold/[0.06] px-3 py-2 text-xs text-gold">
              <strong>Not yet verified against a live account. </strong>
              {adding.unverifiedNote}
            </p>
          )}

          <ol className="mt-4 space-y-1.5 text-sm text-muted-foreground">
            {adding.setup.map((step, i) => (
              <li key={step} className="flex gap-2.5">
                <span className="font-mono text-xs text-cyan">{i + 1}.</span>
                {step}
              </li>
            ))}
          </ol>

          <form action={add} className="mt-5 space-y-4">
            <input type="hidden" name="connector" value={adding.id} />

            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="label">
                What to call it
              </label>
              <Input id="label" name="label" defaultValue={adding.name} className="mt-1.5" />
            </div>

            {adding.fields.map((f) =>
              f.key === "environment" ? (
                <div key={f.key}>
                  <label className="text-xs font-medium text-muted-foreground" htmlFor={f.key}>
                    {f.label}
                  </label>
                  <select
                    id={f.key}
                    name={f.key}
                    defaultValue="sandbox"
                    className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm"
                  >
                    <option value="sandbox">Sandbox — testing</option>
                    <option value="production">Production — the real books</option>
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">{f.hint}</p>
                </div>
              ) : (
                <div key={f.key}>
                  <label className="text-xs font-medium text-muted-foreground" htmlFor={f.key}>
                    {f.label}
                  </label>
                  <Input
                    id={f.key}
                    name={f.key}
                    type={f.secret ? "password" : "text"}
                    required={f.required}
                    placeholder={f.key === "url" ? "https://" : ""}
                    className="mt-1.5 font-mono text-xs"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{f.hint}</p>
                </div>
              ),
            )}

            <fieldset>
              <legend className="text-xs font-medium text-muted-foreground">
                What to send. Leave everything unticked to get all of it.
              </legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {EVENT_CATALOGUE.filter((e) => acceptedEvents(adding!).includes(e.type)).map((e) => (
                  <label
                    key={e.type}
                    className="flex cursor-pointer gap-2.5 rounded-lg border border-border p-3 text-xs transition-colors hover:border-cyan/50"
                  >
                    <input type="checkbox" name="events" value={e.type} className="mt-0.5" />
                    <span>
                      <span className="block font-medium text-foreground">{e.label}</span>
                      <span className="block text-muted-foreground">{e.when}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex items-center gap-3">
              <Button type="submit">Connect</Button>
              <a href="/app/connections" className="text-sm text-muted-foreground hover:text-cyan">
                Cancel
              </a>
            </div>
          </form>
        </Card>
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Add a connection
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {CONNECTORS.map((c) => {
              const Icon = ICON[c.id] ?? Plug;
              return (
                <Card key={c.id} className="flex flex-col p-5">
                  <div className="flex items-start gap-2.5">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-cyan" />
                    <div>
                      <CardTitle className="text-base">{c.name}</CardTitle>
                      <p className="mt-0.5 text-sm text-muted-foreground">{c.tagline}</p>
                    </div>
                  </div>
                  <ul className="mt-3 flex-1 space-y-1 text-xs text-muted-foreground">
                    {c.does.map((d) => (
                      <li key={d} className="flex gap-2">
                        <span className="text-cyan">–</span>
                        {d}
                      </li>
                    ))}
                  </ul>
                  {!c.verified && (
                    <p className="mt-3 text-xs text-gold">
                      Not yet run against a live account — see the note before you connect it.
                    </p>
                  )}
                  <div className="mt-4 flex items-center gap-3">
                    <Button asChild variant="outline" size="sm">
                      <a href={`/app/connections?add=${c.id}`}>Connect</a>
                    </Button>
                    {c.docsUrl && (
                      <a
                        href={c.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-cyan"
                      >
                        Their docs <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* The contract                                                        */}
      {/* ------------------------------------------------------------------ */}
      <Card className="p-5">
        <CardTitle className="text-base">What gets sent</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          These are the events, and the fields a receiving system can rely on. We add fields; we do
          not remove them, so anything you build against this keeps working.
        </p>
        <div className="mt-4 space-y-3">
          {EVENT_CATALOGUE.map((e) => (
            <div key={e.type} className="border-t border-border pt-3 first:border-0 first:pt-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <code className="font-mono text-xs text-cyan">{e.type}</code>
                <span className="text-sm font-medium">{e.label}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{e.when}</p>
              <p className="mt-1 font-mono text-[0.68rem] text-muted-foreground">
                {e.fields.join(" · ")}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-4 flex items-start gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Events queue the moment they happen and go out on the five-minute sweep, so allow up to
          five minutes. If your endpoint is down we retry six times over about a day, then stop.
          Card numbers, bank details and anything that looks like a secret are stripped before
          anything leaves, including from what a caller said out loud.
        </p>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span className={cn("font-mono tabular-nums", value > 0 ? tone : "text-muted-foreground")}>
      {value} <span className="font-sans text-muted-foreground">{label}</span>
    </span>
  );
}
