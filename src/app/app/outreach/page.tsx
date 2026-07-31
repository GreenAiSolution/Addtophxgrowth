import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PhoneOutgoing, CircleAlert, Ban, Clock } from "lucide-react";
import { requireClient } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { addDoNotCall, proposeOutboundCall } from "@/lib/voice-store";
import {
  CALL_PURPOSES,
  MAX_OUTBOUND_ATTEMPTS,
  OUTBOUND_WINDOW,
  type CallPurpose,
} from "@/lib/voice";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * OUTREACH — the calls that go out, and the ones that must not.
 *
 * Two gates in series, and the page exists to make both of them legible.
 *
 *   `canCallNow` asks whether this number may legally and decently be rung at
 *   all: suppressed, consented, inside the attempt limit, inside the hours
 *   where they are. It runs BEFORE anything queues, so a suppressed contact
 *   never appears in a queue as something releasable.
 *
 *   The gate then asks whether this particular call is one the owner wants
 *   made. That is `/app/gate`, and it holds every outbound call for review.
 *
 * The refusals are shown, not hidden. A number that will not be rung, with the
 * reason in the owner's language, is the single most reassuring thing on this
 * screen — and it is what an owner will point at when a customer complains.
 */

export const dynamic = "force-dynamic";

const PURPOSES = CALL_PURPOSES.filter((p) => p.direction === "OUTBOUND");

export default async function OutreachPage({
  searchParams,
}: {
  searchParams: { note?: string; error?: string };
}) {
  const { client, actor } = await requireClient();

  let suppressed: Awaited<ReturnType<typeof prisma.doNotCallEntry.findMany>> = [];
  let queued: Awaited<ReturnType<typeof prisma.pendingAction.findMany>> = [];
  let recent: Awaited<ReturnType<typeof prisma.voiceCall.findMany>> = [];
  let dbError: string | null = null;

  try {
    [suppressed, queued, recent] = await Promise.all([
      prisma.doNotCallEntry.findMany({
        where: { clientId: client.id },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.pendingAction.findMany({
        where: { clientId: client.id, build: "voice-employee", state: { in: ["HELD", "RELEASED"] } },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
      prisma.voiceCall.findMany({
        where: { clientId: client.id, direction: "OUTBOUND" },
        orderBy: { startedAt: "desc" },
        take: 15,
      }),
    ]);
  } catch {
    dbError =
      "Outreach cannot reach its storage, so nothing can be queued or suppressed right now. " +
      "No calls are going out either — the same failure stops the sweep.";
  }

  async function queueCall(formData: FormData) {
    "use server";
    const { client: c } = await requireClient();
    const s = (k: string) => String(formData.get(k) ?? "").trim();

    const phone = s("phone");
    if (!phone) return redirect(`/app/outreach?error=${encodeURIComponent("No number given.")}`);

    const result = await proposeOutboundCall({
      clientId: c.id,
      purpose: (s("purpose") || "reactivate") as CallPurpose,
      phone,
      reason: s("reason") || "Ring a customer",
      subject: s("name") || phone,
      utcOffsetMinutes: Number(s("offset")) || -420,
      consent: formData.get("consent") === "on",
      context: { note: s("note") || null, addedBy: "outreach screen" },
    });

    revalidatePath("/app/outreach");
    revalidatePath("/app/gate");

    if (!result.queued) {
      // The refusal is the product. Show it in full rather than a generic error.
      return redirect(`/app/outreach?error=${encodeURIComponent(`Not queued — ${result.why}`)}`);
    }
    return redirect(
      `/app/outreach?note=${encodeURIComponent(
        "Queued. It waits in your queue before it dials — pull it there if you change your mind.",
      )}`,
    );
  }

  async function suppress(formData: FormData) {
    "use server";
    const { client: c, actor: a } = await requireClient();
    const phone = String(formData.get("phone") ?? "").trim();
    if (!phone) return;
    await addDoNotCall(c.id, phone, {
      source: "owner",
      reason: `Added by ${a.email || "a signed-in user"}`,
    });
    revalidatePath("/app/outreach");
    redirect(
      `/app/outreach?note=${encodeURIComponent(
        `${phone} will never be rung by this system again.`,
      )}`,
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
          <PhoneOutgoing className="h-5 w-5 text-violet" />
          Outreach
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          Calls that go out. Every one is checked against your do-not-call list, the consent on the
          record, the attempt limit and the hours where the customer is — and then waits in your
          queue before it dials.
        </p>
      </header>

      {searchParams.note && (
        <Card className="border-signal/40 p-4">
          <p className="text-sm text-signal">{searchParams.note}</p>
        </Card>
      )}
      {searchParams.error && (
        <Card className="border-gold/40 p-4">
          <p className="text-sm text-gold">{searchParams.error}</p>
        </Card>
      )}

      {dbError ? (
        <Card className="border-magenta/40 p-8">
          <CardTitle className="flex items-center gap-2">
            <CircleAlert className="h-4 w-4 text-magenta" />
            Outreach is unavailable
          </CardTitle>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{dbError}</p>
        </Card>
      ) : (
        <>
          <Card className="p-5">
            <CardTitle>The rules, before anything dials</CardTitle>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                `Calls go out ${OUTBOUND_WINDOW.startHour}am to ${OUTBOUND_WINDOW.endHour - 12}pm in the customer's own time — never ours.`,
                `${MAX_OUTBOUND_ATTEMPTS} attempts per number, then it stops. No exceptions, no override.`,
                "Anybody who says stop is suppressed on the call itself, without waiting for approval.",
                "A missed caller can be rung back inside 90 minutes without a consent record — they rang us.",
              ].map((line) => (
                <li
                  key={line}
                  className="rounded-lg border border-border px-3 py-2 text-[0.8rem] text-muted-foreground"
                >
                  {line}
                </li>
              ))}
            </ul>
          </Card>

          <form action={queueCall}>
            <Card className="p-5">
              <CardTitle>Ring somebody</CardTitle>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-[0.72rem] uppercase tracking-[0.12em] text-muted-foreground">
                    Their number
                  </Label>
                  <Input name="phone" className="mt-1.5" placeholder="602 555 0134" maxLength={40} />
                </div>
                <div>
                  <Label className="text-[0.72rem] uppercase tracking-[0.12em] text-muted-foreground">
                    Their name
                  </Label>
                  <Input name="name" className="mt-1.5" maxLength={120} />
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-[0.72rem] uppercase tracking-[0.12em] text-muted-foreground">
                    Why
                  </Label>
                  <select
                    name="purpose"
                    className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  >
                    {PURPOSES.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-[0.72rem] uppercase tracking-[0.12em] text-muted-foreground">
                    Their timezone offset from UTC, in minutes
                  </Label>
                  <Input name="offset" className="mt-1.5" defaultValue={-420} />
                  <p className="mt-1 text-[0.7rem] text-muted-foreground">
                    Phoenix is -420. This decides what counts as a decent hour for them.
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <Label className="text-[0.72rem] uppercase tracking-[0.12em] text-muted-foreground">
                  What the call is for
                </Label>
                <Input
                  name="reason"
                  className="mt-1.5"
                  placeholder="Win back a customer who hasn't booked since spring"
                  maxLength={200}
                />
              </div>

              <div className="mt-4">
                <Label className="text-[0.72rem] uppercase tracking-[0.12em] text-muted-foreground">
                  Anything the operator should know
                </Label>
                <Textarea name="note" className="mt-1.5" rows={2} maxLength={500} />
              </div>

              <div className="mt-4 flex items-start gap-2 rounded-lg border border-gold/30 bg-gold/[0.04] p-3">
                <input type="checkbox" name="consent" id="consent" className="mt-0.5 h-4 w-4" />
                <Label htmlFor="consent" className="text-sm leading-relaxed">
                  This customer gave us permission to call them, and I can show where that came
                  from.
                  <span className="mt-0.5 block text-[0.72rem] text-muted-foreground">
                    Without this, nothing is queued — the only exception is ringing back somebody
                    who called us in the last 90 minutes.
                  </span>
                </Label>
              </div>

              <div className="mt-5 flex justify-end border-t border-border pt-5">
                <Button type="submit">Put it in the queue</Button>
              </div>
            </Card>
          </form>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gold" />
                Waiting to dial
              </CardTitle>
              {queued.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Nothing queued. Anything you add appears here and on{" "}
                  <a href="/app/gate" className="text-cyan hover:underline">
                    the queue
                  </a>{" "}
                  before it rings anybody.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {queued.map((q) => (
                    <li key={q.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="muted" className="text-[0.62rem]">
                          {q.state.toLowerCase()}
                        </Badge>
                        <span>{q.subject}</span>
                      </div>
                      <p className="mt-0.5 text-[0.72rem] text-muted-foreground">{q.summary}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-5">
              <CardTitle className="flex items-center gap-2">
                <Ban className="h-4 w-4 text-magenta" />
                Never call these
              </CardTitle>
              <form action={suppress} className="mt-3 flex gap-2">
                <Input name="phone" placeholder="Add a number" maxLength={40} />
                <Button type="submit" variant="outline" size="sm">
                  Suppress
                </Button>
              </form>
              {suppressed.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Nobody suppressed yet. Anyone who says stop on a call or replies STOP to a text
                  lands here automatically, without anybody approving it.
                </p>
              ) : (
                <ul className="mt-3 max-h-64 space-y-1.5 overflow-auto">
                  {suppressed.map((d) => (
                    <li
                      key={d.id}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-border px-3 py-1.5 text-[0.8rem]"
                    >
                      <span className="font-mono">{d.phone}</span>
                      <span className="text-[0.7rem] text-muted-foreground">
                        {d.reason ?? d.source ?? "suppressed"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-[0.7rem] text-muted-foreground">
                Numbers are matched on their last ten digits, so a number saved one way and dialled
                another still matches.
              </p>
            </Card>
          </div>

          <Card className="p-5">
            <CardTitle>Calls that went out</CardTitle>
            {recent.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">None yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {recent.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <span className="font-mono text-[0.8rem]">{c.toNumber}</span>
                    <span className="text-[0.72rem] text-muted-foreground">
                      {c.purpose} · {c.outcome?.toLowerCase().replace(/_/g, " ") ?? "in progress"}
                      {c.durationSec != null ? ` · ${c.durationSec}s` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      <p className="text-[0.72rem] text-muted-foreground">
        Signed in as {actor.email}. Everything queued here is recorded against this address.
      </p>
    </div>
  );
}
