import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  PhoneCall,
  CircleAlert,
  CircleCheck,
  ShieldCheck,
  Radio,
  BookOpen,
} from "lucide-react";
import { requireClient } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { activePlaybook, activePriceBook, savePlaybook, savePriceBook } from "@/lib/voice-store";
import { playbookSchema, type Playbook } from "@/lib/voice";
import { priceBookSchema, UNIT_LABELS, type PriceBook } from "@/lib/estimates";
import { DRILLS } from "@/lib/training";
import { PROVIDERS } from "@/lib/telephony";
import { calendarSchema, nextSlots, offerLine, WEEKDAY_NAMES, type Calendar } from "@/lib/booking";
import { activeCalendar, bookedAppointments, saveCalendar } from "@/lib/booking-store";
import { runDrills } from "@/lib/drill-runner";
import {
  centsToDollars,
  dollarsToCents,
  parseList,
  parsePriceItems,
  parseQualifiers,
  serialiseList,
  serialisePriceItems,
  serialiseQualifiers,
} from "@/lib/voice-forms";
import { cn, formatCurrency } from "@/lib/utils";
import { env } from "@/lib/env";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * THE VOICE EMPLOYEE'S OWN SCREEN.
 *
 * This is the "train it" surface, and the order of the page is an argument: what
 * it says, then what it may charge, then proof it survives the six calls that
 * cost people money, then every call it has taken.
 *
 * The drills run on render rather than behind a button. A playbook that has been
 * edited but not tested is the state this screen exists to make impossible, and
 * a button is a state — one an owner can leave un-pressed. They are pure and
 * they cost nothing, so they simply always show.
 */

export const dynamic = "force-dynamic";

function errorPanel(message: string) {
  return (
    <Card className="border-magenta/40 p-8">
      <CardTitle className="flex items-center gap-2">
        <CircleAlert className="h-4 w-4 text-magenta" />
        The operator cannot reach its storage
      </CardTitle>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{message}</p>
    </Card>
  );
}

export default async function VoicePage({
  searchParams,
}: {
  searchParams: { saved?: string; error?: string };
}) {
  const { client, actor } = await requireClient();

  let playbook: Awaited<ReturnType<typeof activePlaybook>> | null = null;
  let priceBook: Awaited<ReturnType<typeof activePriceBook>> | null = null;
  let calls: Awaited<ReturnType<typeof prisma.voiceCall.findMany>> = [];
  let calendar: Awaited<ReturnType<typeof activeCalendar>> | null = null;
  let appointments: Awaited<ReturnType<typeof prisma.appointment.findMany>> = [];
  let token: string | null = null;
  let dbError: string | null = null;

  try {
    [playbook, priceBook, calls, token, calendar] = await Promise.all([
      activePlaybook(client.id),
      activePriceBook(client.id),
      prisma.voiceCall.findMany({
        where: { clientId: client.id },
        orderBy: { startedAt: "desc" },
        take: 25,
      }),
      prisma.clientProfile
        .findUnique({ where: { id: client.id }, select: { intakeToken: true } })
        .then((r) => r?.intakeToken ?? null),
      activeCalendar(client.id),
    ]);
    appointments = await prisma.appointment.findMany({
      where: { clientId: client.id, status: "BOOKED", at: { gte: new Date() } },
      orderBy: { at: "asc" },
      take: 20,
    });
  } catch {
    dbError =
      "Nothing can be read or saved right now, which also means no call is being answered — " +
      "the same failure stops the phone line. Check /api/health for which half is wrong.";
  }

  async function save(formData: FormData) {
    "use server";
    const { client: c, actor: a } = await requireClient();
    const section = String(formData.get("section") ?? "");

    const s = (k: string) => String(formData.get(k) ?? "");

    if (section === "playbook") {
      const quals = parseQualifiers(s("qualifiers"));
      if (quals.errors.length) {
        return redirectWith(`error=${encodeURIComponent(quals.errors.join(" "))}`);
      }
      const next: Playbook = playbookSchema.parse({
        businessName: s("businessName") || c.businessName,
        operatorName: s("operatorName") || "Ava",
        greeting: s("greeting"),
        tone: s("tone"),
        services: parseList(s("services")),
        serviceArea: parseList(s("serviceArea")),
        hours: s("hours"),
        qualifiers: quals.values,
        quoting: (["none", "range", "firm"] as const).includes(s("quoting") as never)
          ? (s("quoting") as Playbook["quoting"])
          : "range",
        booking: {
          enabled: formData.get("bookingEnabled") === "on",
          rules: s("bookingRules"),
          confirmBack: true,
        },
        answers: parseAnswers(s("answers")),
        escalations: parseEscalations(s("escalations")),
        neverSay: parseList(s("neverSay")),
        transferNumber: s("transferNumber") || undefined,
        maxTurns: Number(s("maxTurns")) || 24,
      });
      const { version } = await savePlaybook(c.id, next, {
        name: a.email || "a signed-in user",
        note: s("note") || undefined,
      });
      return redirectWith(`saved=playbook+v${version}`);
    }

    if (section === "calendar") {
      const days = WEEKDAY_NAMES.map((_, i) => i).filter((i) => formData.get(`day${i}`) === "on");
      const next: Calendar = calendarSchema.parse({
        utcOffsetMinutes: Number(s("offset")) || -420,
        days,
        startHour: Number(s("startHour")) || 8,
        endHour: Number(s("endHour")) || 16,
        slotMinutes: Number(s("slotMinutes")) || 60,
        leadTimeHours: Number(s("leadTimeHours")) || 0,
        horizonDays: Number(s("horizonDays")) || 14,
        maxPerDay: Number(s("maxPerDay")) || 6,
        blackoutDates: parseList(s("blackoutDates")).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
        note: s("calNote"),
      });
      await saveCalendar(c.id, next, a.email || "a signed-in user");
      return redirectWith("saved=the+diary");
    }

    if (section === "pricebook") {
      const items = parsePriceItems(s("items"));
      if (items.errors.length) {
        return redirectWith(`error=${encodeURIComponent(items.errors.join(" "))}`);
      }
      const next: PriceBook = priceBookSchema.parse({
        currency: "USD",
        callOutFeeCents: dollarsToCents(s("callOutFee")),
        minimumJobCents: dollarsToCents(s("minimumJob")),
        items: items.values,
        modifiers: [],
        travel: {
          includedMiles: Number(s("includedMiles")) || 0,
          perMileCents: dollarsToCents(s("perMile")),
        },
        rangeSpreadPct: Math.min(60, Math.max(0, Number(s("spread")) || 0)),
        maxSpokenTotalCents: dollarsToCents(s("cap")),
        disclaimer: s("disclaimer") || undefined,
      });
      const { version } = await savePriceBook(c.id, next, {
        name: a.email || "a signed-in user",
        note: s("note") || undefined,
      });
      return redirectWith(`saved=prices+v${version}`);
    }
  }

  if (dbError || !playbook || !priceBook || !calendar) {
    return (
      <div className="space-y-6">
        <Header version={0} />
        {errorPanel(dbError ?? "Unknown failure.")}
      </div>
    );
  }

  const pb = playbook.value;
  const book = priceBook.value;
  const drills = await runDrills(pb, book, DRILLS);
  const failing = drills.filter((d) => !d.passed);
  /*
    siteUrl, not publicUrl. `publicUrl` borrows the parent's domain when this
    deploy cannot identify itself, which is right for a link in an email and
    actively wrong here — a provider posting a live call to phxgrowth.com would
    reach the parent's marketing site. This URL has to be true or it has to be
    visibly localhost.
  */
  const endpoint = `${env.siteUrl}/api/voice/${client.id}/turn`;

  return (
    <div className="space-y-6">
      <Header version={playbook.version} />

      {searchParams.saved && (
        <Card className="border-signal/40 p-4">
          <p className="text-sm text-signal">
            Saved as {searchParams.saved.replace(/\+/g, " ")}. Live on the next call — nothing was
            overwritten, the previous version is still on the record.
          </p>
        </Card>
      )}
      {searchParams.error && (
        <Card className="border-magenta/40 p-4">
          <p className="text-sm text-magenta">Nothing was saved. {searchParams.error}</p>
        </Card>
      )}

      {/* --- Is it actually answering? Said plainly, before anything else. --- */}
      <Card className="p-5">
        <CardTitle className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-cyan" />
          The line
        </CardTitle>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Status
            ok={playbook.saved}
            label="Playbook"
            good={`v${playbook.version}, saved`}
            bad="running the built-in default"
          />
          <Status
            ok={priceBook.saved && book.items.length > 0}
            label="Price book"
            good={`${book.items.length} rate${book.items.length === 1 ? "" : "s"}`}
            bad="empty — it will book visits instead of quoting"
          />
          <Status
            ok={Boolean(token)}
            label="Endpoint"
            good="reachable, token set"
            bad="no token — the endpoint will refuse every call"
          />
          <Status
            ok={calendar.saved}
            label="The diary"
            good={`${calendar.value.days.length} days a week, ${calendar.value.slotMinutes}-minute visits`}
            bad="not set — it takes requests but never promises a time"
          />
        </div>
        <div className="mt-4 rounded-lg border border-border bg-black/30 p-3">
          <p className="text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
            Point your phone provider here
          </p>
          <code className="mt-1.5 block break-all font-mono text-[0.72rem]">{endpoint}</code>
          <p className="mt-2 text-[0.72rem] text-muted-foreground">
            Authenticate with the <code className="font-mono">x-voice-token</code> header, or{" "}
            <code className="font-mono">?token=</code> on the URL where a provider cannot set
            headers. Nothing is answered until a provider is pointed at this.
          </p>
          <ul className="mt-3 space-y-1.5">
            {PROVIDERS.map((p) => (
              <li key={p.key} className="flex flex-wrap items-baseline gap-2 text-[0.72rem]">
                <Badge
                  variant="muted"
                  className={cn(
                    "text-[0.6rem]",
                    p.verified ? "border-signal/40 text-signal" : "border-gold/40 text-gold",
                  )}
                >
                  {p.verified ? "verified" : "check the mapping"}
                </Badge>
                <span className="font-medium">{p.label}</span>
                <span className="text-muted-foreground">{p.hint}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[0.7rem] text-muted-foreground">
            &ldquo;Check the mapping&rdquo; means that provider moves its webhook shape often enough
            that we will not claim ours is current. Verify against their docs before you go live.
          </p>
        </div>
      </Card>

      {/* --- The drills. --- */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-gold" />
            The six calls it has to survive
          </CardTitle>
          <Badge
            variant="muted"
            className={cn(
              "text-[0.62rem]",
              failing.length ? "border-magenta/40 text-magenta" : "border-signal/40 text-signal",
            )}
          >
            {failing.length ? `${failing.length} failing` : "all passing"}
          </Badge>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Run against the playbook below every time this page loads. The wording is a stand-in — no
          model is called here — so a pass means your <em>rules</em> hold, not that the sentences are
          pretty.
        </p>
        <ul className="mt-4 space-y-2">
          {drills.map((d) => (
            <li
              key={d.drill.key}
              className={cn(
                "rounded-lg border p-3",
                d.passed ? "border-border" : "border-magenta/40 bg-magenta/[0.04]",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                {d.passed ? (
                  <CircleCheck className="h-3.5 w-3.5 text-signal" />
                ) : (
                  <CircleAlert className="h-3.5 w-3.5 text-magenta" />
                )}
                <span className="text-sm font-medium">{d.drill.name}</span>
                <span className="text-[0.7rem] text-muted-foreground">· {d.drill.proves}</span>
              </div>
              {!d.passed && (
                <p className="mt-1.5 text-[0.72rem] text-magenta">
                  Expected: {d.drill.expectation} — got {d.observation.outcome.toLowerCase()}.
                </p>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {/* --- What it says. --- */}
      <form action={save}>
        <input type="hidden" name="section" value="playbook" />
        <Card className="p-5">
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-violet" />
            What it says, and what it must ask
          </CardTitle>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Its name" hint="Callers talk to a person, not a product.">
              <Input name="operatorName" defaultValue={pb.operatorName} maxLength={40} />
            </Field>
            <Field label="Transfer number" hint="Blank means every handover takes a message.">
              <Input name="transferNumber" defaultValue={pb.transferNumber ?? ""} maxLength={40} />
            </Field>
          </div>

          <Field label="First thing it says" className="mt-4">
            <Textarea name="greeting" defaultValue={pb.greeting} rows={2} maxLength={400} />
          </Field>

          <Field label="Voice and tone" hint="How it should sound. Plain instructions." className="mt-4">
            <Textarea name="tone" defaultValue={pb.tone} rows={2} maxLength={600} />
          </Field>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="What you do" hint="One per line. Anything else is out of scope.">
              <Textarea name="services" defaultValue={serialiseList(pb.services)} rows={4} />
            </Field>
            <Field label="Where you'll go" hint="Towns or postcodes, one per line. Blank = anywhere.">
              <Textarea name="serviceArea" defaultValue={serialiseList(pb.serviceArea)} rows={4} />
            </Field>
          </div>

          <Field
            label="What it must find out"
            hint={`One per line: slot | question | optional. A required answer blocks a booking and a price.`}
            className="mt-4"
          >
            <Textarea
              name="qualifiers"
              defaultValue={serialiseQualifiers(pb.qualifiers)}
              rows={6}
              className="font-mono text-[0.78rem]"
            />
          </Field>

          <Field
            label="Answers it is allowed to give"
            hint="One per line: question | answer. The Tuning Lab writes here too."
            className="mt-4"
          >
            <Textarea
              name="answers"
              defaultValue={pb.answers.map((a) => `${a.q} | ${a.a}`).join("\n")}
              rows={4}
              className="font-mono text-[0.78rem]"
            />
          </Field>

          <Field
            label="When it fetches a person"
            hint="One per line: what happens | transfer or message."
            className="mt-4"
          >
            <Textarea
              name="escalations"
              defaultValue={pb.escalations
                .map((e) => `${e.when} | ${e.action === "TRANSFER" ? "transfer" : "message"}`)
                .join("\n")}
              rows={4}
              className="font-mono text-[0.78rem]"
            />
          </Field>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Never say" hint="One per line. Enforced on every reply, not just asked for.">
              <Textarea name="neverSay" defaultValue={serialiseList(pb.neverSay)} rows={3} />
            </Field>
            <div className="space-y-4">
              <Field label="Prices on the phone">
                <select
                  name="quoting"
                  defaultValue={pb.quoting}
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                >
                  <option value="none">Never quote — always book a visit</option>
                  <option value="range">Quote a range from the price book</option>
                  <option value="firm">Quote a firm figure when it is confident</option>
                </select>
              </Field>
              <Field label="Longest call" hint="Turns, before it wraps up whatever else is unfinished.">
                <Input name="maxTurns" type="number" min={4} max={60} defaultValue={pb.maxTurns} />
              </Field>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2">
            <input
              type="checkbox"
              name="bookingEnabled"
              defaultChecked={pb.booking.enabled}
              className="mt-0.5 h-4 w-4"
              id="bookingEnabled"
            />
            <Label htmlFor="bookingEnabled" className="text-sm">
              It may book appointments
            </Label>
          </div>
          <Field label="Booking rules" hint="Free text. Days, slots, how far ahead, what it must never book." className="mt-3">
            <Textarea name="bookingRules" defaultValue={pb.booking.rules} rows={2} maxLength={600} />
          </Field>

          <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-border pt-5">
            <Field label="Why this change" className="flex-1 min-w-[220px]">
              <Input name="note" placeholder="Kept for the record" maxLength={200} />
            </Field>
            <Button type="submit">Save as v{playbook.version + 1}</Button>
          </div>
        </Card>
      </form>

      {/* --- What it may charge. --- */}
      <form action={save}>
        <input type="hidden" name="section" value="pricebook" />
        <Card className="p-5">
          <CardTitle>The price book</CardTitle>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            The only place a spoken number can come from. If a job is not priceable from these
            lines, the operator books a visit instead of guessing — and it cannot round, discount or
            adjust anything here, however hard a caller pushes.
          </p>

          <Field
            label="Rates"
            hint="One per line: key | label | unit | rate | minimum. Units: each, hour, sqft, linear_ft, day, fixed."
            className="mt-4"
          >
            <Textarea
              name="items"
              defaultValue={serialisePriceItems(book.items)}
              rows={8}
              className="font-mono text-[0.78rem]"
              placeholder={"gutter_clean | Gutter clean | linear_ft | 4.50 | 40\ncallout_diag | Diagnostic visit | fixed | 89"}
            />
          </Field>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Call-out fee" hint="Dollars, per visit.">
              <Input name="callOutFee" defaultValue={centsToDollars(book.callOutFeeCents)} />
            </Field>
            <Field label="Minimum job" hint="Nothing is priced below this.">
              <Input name="minimumJob" defaultValue={centsToDollars(book.minimumJobCents)} />
            </Field>
            <Field label="Never quote above" hint="Dollars. Blank means no cap.">
              <Input name="cap" defaultValue={centsToDollars(book.maxSpokenTotalCents)} />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Range spread" hint="Percent either side.">
              <Input name="spread" type="number" min={0} max={60} defaultValue={book.rangeSpreadPct} />
            </Field>
            <Field label="Free miles" hint="Before travel is charged.">
              <Input name="includedMiles" type="number" min={0} defaultValue={book.travel.includedMiles} />
            </Field>
            <Field label="Per mile after that" hint="Dollars.">
              <Input name="perMile" defaultValue={centsToDollars(book.travel.perMileCents)} />
            </Field>
          </div>

          <Field label="Said after every price" className="mt-4">
            <Textarea name="disclaimer" defaultValue={book.disclaimer} rows={2} maxLength={300} />
          </Field>

          <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-border pt-5">
            <Field label="Why this change" className="flex-1 min-w-[220px]">
              <Input name="note" placeholder="Kept for the record" maxLength={200} />
            </Field>
            <Button type="submit">Save as v{priceBook.version + 1}</Button>
          </div>
        </Card>
      </form>

      {/* --- The diary. --- */}
      <form action={save}>
        <input type="hidden" name="section" value="calendar" />
        <Card className="p-5">
          <CardTitle>The diary</CardTitle>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            The operator can only ever offer times computed from these rules, and it can only book a
            time it read out loud on that call. It cannot invent a slot, agree to one a caller
            proposes, or promise anything sooner than your lead time — however the conversation goes.
          </p>

          <div className="mt-4">
            <Label className="text-[0.72rem] uppercase tracking-[0.12em] text-muted-foreground">
              Days you work
            </Label>
            <div className="mt-2 flex flex-wrap gap-3">
              {WEEKDAY_NAMES.map((name, i) => (
                <label key={name} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    name={`day${i}`}
                    defaultChecked={calendar!.value.days.includes(i)}
                    className="h-4 w-4"
                  />
                  {name.slice(0, 3)}
                </label>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            <Field label="First slot" hint="Local hour, 24h.">
              <Input name="startHour" type="number" min={0} max={23} defaultValue={calendar!.value.startHour} />
            </Field>
            <Field label="Last slot before" hint="Local hour, 24h.">
              <Input name="endHour" type="number" min={1} max={24} defaultValue={calendar!.value.endHour} />
            </Field>
            <Field label="Visit length" hint="Minutes.">
              <Input name="slotMinutes" type="number" min={15} max={480} defaultValue={calendar!.value.slotMinutes} />
            </Field>
            <Field label="Most per day">
              <Input name="maxPerDay" type="number" min={1} max={50} defaultValue={calendar!.value.maxPerDay} />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Soonest it may offer" hint="Hours from now. Zero means same-hour.">
              <Input name="leadTimeHours" type="number" min={0} max={168} defaultValue={calendar!.value.leadTimeHours} />
            </Field>
            <Field label="How far ahead" hint="Days. Beyond this a person books it.">
              <Input name="horizonDays" type="number" min={1} max={120} defaultValue={calendar!.value.horizonDays} />
            </Field>
            <Field label="Your offset from UTC" hint="Minutes. Phoenix is -420.">
              <Input name="offset" type="number" defaultValue={calendar!.value.utcOffsetMinutes} />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Days you are closed" hint="One per line, as 2026-12-25.">
              <Textarea
                name="blackoutDates"
                rows={3}
                defaultValue={calendar!.value.blackoutDates.join("\n")}
                className="font-mono text-[0.78rem]"
              />
            </Field>
            <Field label="Said with every offer" hint="Optional.">
              <Textarea name="calNote" rows={3} maxLength={200} defaultValue={calendar!.value.note} />
            </Field>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-black/20 p-3">
            <p className="text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
              What it would offer, right now
            </p>
            <p className="mt-1.5 text-sm">
              {offerLine(
                nextSlots(
                  calendar!.value,
                  appointments.map((a) => ({ at: a.at, minutes: a.minutes })),
                  { count: 3 },
                ),
                calendar!.value.note,
              )}
            </p>
          </div>

          {appointments.length > 0 && (
            <div className="mt-4">
              <p className="text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
                Booked
              </p>
              <ul className="mt-2 space-y-1.5">
                {appointments.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-border px-3 py-1.5 text-[0.8rem]"
                  >
                    <span>{a.customerName ?? a.customerPhone ?? "A caller"}</span>
                    <span className="text-muted-foreground">
                      {a.at.toISOString().slice(0, 16).replace("T", " ")} ·{" "}
                      {a.jobDescription ?? "visit"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex justify-end border-t border-border pt-5">
            <Button type="submit">Save the diary</Button>
          </div>
        </Card>
      </form>

      {/* --- Every call. --- */}
      <Card className="p-5">
        <CardTitle>Calls</CardTitle>
        {calls.length === 0 ? (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            No calls yet. Every one that comes in will be here with its transcript, what it captured,
            and what the Tuning Lab made of it.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {calls.map((c) => {
              const captured = (c.captured as Record<string, string> | null) ?? {};
              const turns = Array.isArray(c.turns)
                ? (c.turns as unknown as { role: string; text: string }[])
                : [];
              return (
                <li key={c.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="muted" className="text-[0.62rem]">
                      {c.direction === "INBOUND" ? "In" : "Out"}
                    </Badge>
                    <span className="text-sm font-medium">
                      {captured.caller_name || c.fromNumber || "Unknown caller"}
                    </span>
                    <span className="text-[0.7rem] text-muted-foreground">
                      {c.outcome ? c.outcome.toLowerCase().replace(/_/g, " ") : "in progress"}
                      {c.durationSec != null ? ` · ${c.durationSec}s` : ""}
                      {c.quotedTotalCents != null
                        ? ` · quoted ${formatCurrency(c.quotedTotalCents)}`
                        : ""}
                    </span>
                    {c.gradeScore != null && (
                      <Badge
                        variant="muted"
                        className={cn(
                          "text-[0.62rem]",
                          c.gradeClean ? "border-border" : "border-magenta/40 text-magenta",
                        )}
                      >
                        {c.gradeScore}/100
                      </Badge>
                    )}
                  </div>
                  {c.gradeHeadline && (
                    <p className="mt-1 text-[0.72rem] text-muted-foreground">{c.gradeHeadline}</p>
                  )}
                  {turns.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[0.72rem] text-muted-foreground hover:text-foreground">
                        Read the call
                      </summary>
                      <div className="mt-2 max-h-64 space-y-1 overflow-auto rounded-lg border border-border bg-black/30 p-3 text-[0.72rem]">
                        {turns.map((t, i) => (
                          <p key={i}>
                            <span className="text-muted-foreground">
                              {t.role === "caller" ? "Caller" : "Operator"}:{" "}
                            </span>
                            {t.text}
                          </p>
                        ))}
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <p className="text-[0.72rem] text-muted-foreground">
        Signed in as {actor.email}. Every version you save is recorded against this address.
      </p>
    </div>
  );
}

function Header({ version }: { version: number }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
          <PhoneCall className="h-5 w-5 text-cyan" />
          The Voice Employee
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          The operator that picks up the phone. What it asks, what it may charge and when it fetches
          you are all yours to set — and nothing it says about money comes from anywhere but the
          price book below.
        </p>
      </div>
      {version > 0 && (
        <Badge variant="muted" className="text-[0.62rem]">
          playbook v{version}
        </Badge>
      )}
    </header>
  );
}

function Status({
  ok,
  label,
  good,
  bad,
}: {
  ok: boolean;
  label: string;
  good: string;
  bad: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5",
        ok ? "border-border" : "border-gold/40 bg-gold/[0.05]",
      )}
    >
      <div className="text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-sm", ok ? "" : "text-gold")}>{ok ? good : bad}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-[0.72rem] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </Label>
      {hint && <p className="mb-1.5 mt-0.5 text-[0.72rem] text-muted-foreground">{hint}</p>}
      <div className={hint ? "" : "mt-1.5"}>{children}</div>
    </div>
  );
}

/** `question | answer` per line. Anything without both halves is skipped. */
function parseAnswers(text: string): { q: string; a: string }[] {
  return text
    .split("\n")
    .map((l) => l.split("|").map((p) => p.trim()))
    .filter((p) => p.length >= 2 && p[0] && p[1])
    .slice(0, 60)
    .map((p) => ({ q: p[0]!.slice(0, 200), a: p.slice(1).join(" | ").slice(0, 600) }));
}

/** `what happens | transfer|message` per line. */
function parseEscalations(text: string) {
  return text
    .split("\n")
    .map((l) => l.split("|").map((p) => p.trim()))
    .filter((p) => p[0])
    .slice(0, 12)
    .map((p, i) => ({
      key: `rule_${i + 1}`,
      when: p[0]!.slice(0, 300),
      action: /message/i.test(p[1] ?? "") ? ("TAKE_MESSAGE" as const) : ("TRANSFER" as const),
    }));
}

/** Save, then land back on the page with a sentence about what happened. */
function redirectWith(query: string): never {
  revalidatePath("/app/voice");
  redirect(`/app/voice?${query}`);
}
