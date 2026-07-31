import { revalidatePath } from "next/cache";
import { Phone, PhoneIncoming, PhoneOutgoing, Sparkles } from "lucide-react";
import { requireClient } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/estimate";
import { cn } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CallOutcome } from "@prisma/client";

/**
 * The phone desk, from the client's side.
 *
 * Buying and assigning the real Twilio number is an admin step (real money,
 * a Twilio console action) — see components/admin/phone-line-admin.tsx.
 * Everything else here — the on/off switch, the greeting, who a transfer
 * rings, and when — is the client's to run without waiting on us.
 */

const OUTCOME_STYLE: Record<CallOutcome, { label: string; variant: "success" | "warning" | "muted" | "default" | "violet" | "danger" }> = {
  IN_PROGRESS: { label: "in progress", variant: "default" },
  ESTIMATE_GIVEN: { label: "estimate given", variant: "success" },
  BOOKED: { label: "booked", variant: "success" },
  TRANSFERRED: { label: "transferred", variant: "violet" },
  MESSAGE_TAKEN: { label: "message taken", variant: "warning" },
  VOICEMAIL: { label: "voicemail", variant: "warning" },
  NO_ANSWER: { label: "no answer", variant: "muted" },
  HUNG_UP: { label: "ended", variant: "muted" },
  SPAM: { label: "spam", variant: "danger" },
};

function dollarsFromHour(h: number | null | undefined) {
  return h == null ? "" : String(h);
}

export default async function PhonePage() {
  const { client } = await requireClient();

  const line = await prisma.phoneLine.findUnique({ where: { clientId: client.id } });

  const [calls, estimates] = line
    ? await Promise.all([
        prisma.callLog.findMany({
          where: { clientId: client.id },
          orderBy: { createdAt: "desc" },
          take: 25,
        }),
        prisma.estimate.findMany({
          where: { clientId: client.id },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      ])
    : [[], []];

  async function saveSettings(formData: FormData) {
    "use server";
    const { client: c } = await requireClient();
    const existing = await prisma.phoneLine.findUnique({ where: { clientId: c.id }, select: { id: true } });
    if (!existing) return;

    const startUtcHour = Number(formData.get("startUtcHour"));
    const endUtcHour = Number(formData.get("endUtcHour"));
    const hasHours = Number.isInteger(startUtcHour) && Number.isInteger(endUtcHour);

    await prisma.phoneLine.update({
      where: { id: existing.id },
      data: {
        greeting: String(formData.get("greeting") ?? "").trim() || null,
        afterHoursGreeting: String(formData.get("afterHoursGreeting") ?? "").trim() || null,
        forwardingNumber: String(formData.get("forwardingNumber") ?? "").trim() || null,
        businessHours: hasHours ? { startUtcHour, endUtcHour } : undefined,
      },
    });
    revalidatePath("/app/phone");
  }

  async function toggleActive(formData: FormData) {
    "use server";
    const { client: c } = await requireClient();
    const existing = await prisma.phoneLine.findUnique({
      where: { clientId: c.id },
      select: { id: true, active: true, twilioNumber: true },
    });
    if (!existing?.twilioNumber) return; // can't go live with no number assigned
    await prisma.phoneLine.update({ where: { id: existing.id }, data: { active: !existing.active } });
    revalidatePath("/app/phone");
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="hud-label">Phone Desk</div>
        <h1 className="mt-1 font-heading text-3xl font-bold">Your AI phone employee</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Answers every call, day or night. Books what it can, transfers what needs a person during your
          hours, takes a message the rest of the time — and every call becomes a lead automatically.
        </p>
      </div>

      {!line ? (
        <Card>
          <CardTitle>Not on your plan yet</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            The Inbound Phone Line ships on every tier. If you don&apos;t see it provisioned, ask us to
            re-run provisioning on your account.
          </p>
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-cyan" />
                <CardTitle>Status</CardTitle>
              </div>
              <Badge variant={line.active ? "success" : "muted"}>{line.active ? "live" : "off"}</Badge>
            </div>

            {line.twilioNumber ? (
              <>
                <p className="mt-2 font-mono text-lg">{line.twilioNumber}</p>
                <form action={toggleActive} className="mt-4">
                  <Button type="submit" size="sm" variant={line.active ? "outline" : "default"}>
                    {line.active ? "Turn off" : "Turn on"}
                  </Button>
                </form>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Your number is being set up — we&apos;ll have it assigned shortly. Configure your greeting
                and hours below in the meantime; they&apos;ll be live the moment the number is.
              </p>
            )}
            {line.outboundEnabled && (
              <p className="mt-3 text-xs text-cyan">
                Outbound is included on your tier — missed and unworked leads get called back on their
                own.
              </p>
            )}
          </Card>

          <Card>
            <CardTitle>Settings</CardTitle>
            <form action={saveSettings} className="mt-4 space-y-4">
              <div>
                <Label htmlFor="greeting">Greeting (leave blank for the default)</Label>
                <Textarea
                  id="greeting"
                  name="greeting"
                  placeholder={`Thanks for calling ${client.businessName}...`}
                  defaultValue={line.greeting ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="afterHoursGreeting">After-hours greeting</Label>
                <Textarea
                  id="afterHoursGreeting"
                  name="afterHoursGreeting"
                  placeholder="It's after hours, but I'm still here and can help right now..."
                  defaultValue={line.afterHoursGreeting ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="forwardingNumber">
                  Transfer calls to (during business hours — leave blank to always take a message instead)
                </Label>
                <Input
                  id="forwardingNumber"
                  name="forwardingNumber"
                  placeholder="+16025551234"
                  defaultValue={line.forwardingNumber ?? ""}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="startUtcHour">Business hours start (UTC hour, 0-23)</Label>
                  <Input
                    id="startUtcHour"
                    name="startUtcHour"
                    inputMode="numeric"
                    placeholder="15 (= 8am Phoenix)"
                    defaultValue={dollarsFromHour((line.businessHours as { startUtcHour?: number } | null)?.startUtcHour)}
                  />
                </div>
                <div>
                  <Label htmlFor="endUtcHour">Business hours end (UTC hour, 0-23)</Label>
                  <Input
                    id="endUtcHour"
                    name="endUtcHour"
                    inputMode="numeric"
                    placeholder="1 (= 6pm Phoenix)"
                    defaultValue={dollarsFromHour((line.businessHours as { endUtcHour?: number } | null)?.endUtcHour)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                The AI answers 24/7 regardless — this only controls whether a TRANSFER request during a
                call actually rings your forwarding number, or takes a message instead.
              </p>
              <Button type="submit" size="sm" variant="outline">
                Save settings
              </Button>
            </form>
          </Card>

          {estimates.length > 0 && (
            <div>
              <h2 className="mb-3 font-heading text-lg font-semibold">Estimates from calls</h2>
              <div className="space-y-2">
                {estimates.map((e) => (
                  <Card key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <div className="text-sm font-medium">{e.jobType}</div>
                      <div className="hud-label mt-0.5">
                        {formatCents(e.priceLowCents)}–{formatCents(e.priceHighCents)}
                      </div>
                    </div>
                    <Badge variant={e.status === "SENT" ? "success" : "muted"}>{e.status.toLowerCase()}</Badge>
                  </Card>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Every estimate waits in{" "}
                <a href="/app/gate" className="text-cyan hover:underline">
                  the queue
                </a>{" "}
                for you to release before it reaches the customer — nothing here is a promise the AI made
                on its own.
              </p>
            </div>
          )}

          <div>
            <h2 className="mb-3 font-heading text-lg font-semibold">Recent calls</h2>
            {calls.length === 0 ? (
              <Card className="text-sm text-muted-foreground">No calls yet.</Card>
            ) : (
              <div className="space-y-2">
                {calls.map((c) => {
                  const style = OUTCOME_STYLE[c.outcome];
                  return (
                    <Card key={c.id} className={cn("py-3", "border-l-2 border-l-border")}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm">
                          {c.direction === "INBOUND" ? (
                            <PhoneIncoming className="h-3.5 w-3.5 text-cyan" />
                          ) : (
                            <PhoneOutgoing className="h-3.5 w-3.5 text-violet" />
                          )}
                          <span className="font-mono">{c.direction === "INBOUND" ? c.fromNumber : c.toNumber}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {c.outcome === "ESTIMATE_GIVEN" && <Sparkles className="h-3.5 w-3.5 text-gold" />}
                          <Badge variant={style.variant}>{style.label}</Badge>
                        </div>
                      </div>
                      <div className="hud-label mt-1">
                        {c.startedAt.toLocaleString()} {c.durationSec ? `· ${c.durationSec}s` : ""}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
