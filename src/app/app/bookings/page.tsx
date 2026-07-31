import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CalendarDays, Clock, Link2, AlertTriangle } from "lucide-react";
import { requireClient } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { employeeByKey } from "@/lib/employees";
import { WEEKDAY_NAMES, describeSlot, minutesToClock } from "@/lib/booking";
import { cancelBooking, hoursFor, settingsFor } from "@/lib/bookings";
import { cn } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The diary.
 *
 * Shows what is booked and, above it, the two things that decide whether
 * anything can be: the working week and the public link. An empty diary with no
 * published link is not a quiet week, it is an unfinished setup — and the page
 * says which of the two it is looking at rather than leaving the client to guess.
 */

const STATUS_STYLE: Record<string, string> = {
  BOOKED: "border-cyan/40 text-cyan",
  CONFIRMED: "border-cyan/50 text-cyan",
  COMPLETED: "border-border text-muted-foreground",
  CANCELLED: "border-border text-muted-foreground",
  NO_SHOW: "border-magenta/40 text-magenta",
};

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const { client } = await requireClient();
  const now = new Date();
  const dispatch = employeeByKey("booker")!;

  const [bookings, rules, settings, profile] = await Promise.all([
    prisma.booking.findMany({
      where: { clientId: client.id },
      orderBy: { startsAt: "asc" },
      take: 100,
    }),
    hoursFor(client.id),
    settingsFor(client.id),
    prisma.clientProfile.findUnique({
      where: { id: client.id },
      select: { bookingSlug: true, timeZone: true },
    }),
  ]);

  const upcoming = bookings.filter((b) => b.startsAt >= now && b.status !== "CANCELLED");
  const past = bookings.filter((b) => b.startsAt < now || b.status === "CANCELLED");

  async function setHours(formData: FormData) {
    "use server";
    const { client: c } = await requireClient();
    const start = Number(formData.get("start"));
    const end = Number(formData.get("end"));
    const days = formData.getAll("weekday").map(Number);

    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      redirect("/app/bookings?error=A+day+has+to+end+after+it+starts.");
    }

    // Replace rather than merge: a client editing their hours means "these are
    // my hours now", and leaving yesterday's windows behind would quietly keep
    // offering a Saturday they just turned off.
    await prisma.$transaction([
      prisma.availabilityRule.deleteMany({ where: { clientId: c.id } }),
      prisma.availabilityRule.createMany({
        data: days.map((weekday) => ({
          clientId: c.id,
          weekday,
          startMinute: Math.round(start * 60),
          endMinute: Math.round(end * 60),
        })),
      }),
    ]);
    revalidatePath("/app/bookings");
  }

  async function publishLink() {
    "use server";
    const { client: c } = await requireClient();
    const existing = await prisma.clientProfile.findUnique({
      where: { id: c.id },
      select: { bookingSlug: true, businessName: true },
    });
    if (existing?.bookingSlug) return;

    const base =
      existing?.businessName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "book";

    // Append a short suffix on collision rather than failing. Two businesses
    // called Bell Roofing is a normal thing, not an error.
    for (let i = 0; i < 25; i++) {
      const slug = i === 0 ? base : `${base}-${i + 1}`;
      const taken = await prisma.clientProfile.findUnique({
        where: { bookingSlug: slug },
        select: { id: true },
      });
      if (!taken) {
        await prisma.clientProfile.update({ where: { id: c.id }, data: { bookingSlug: slug } });
        break;
      }
    }
    revalidatePath("/app/bookings");
  }

  async function cancel(formData: FormData) {
    "use server";
    const { client: c } = await requireClient();
    const id = String(formData.get("id") ?? "");
    const owned = await prisma.booking.findFirst({
      where: { id, clientId: c.id },
      select: { id: true },
    });
    if (!owned) return;
    await cancelBooking(owned.id, "Cancelled from the diary");
    revalidatePath("/app/bookings");
  }

  const bookingUrl = profile?.bookingSlug ? `${env.publicUrl}/book/${profile.bookingSlug}` : null;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {dispatch.name} · {dispatch.role}
        </p>
        <h1 className="text-2xl font-semibold">The diary</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{dispatch.leak}</p>
      </header>

      {searchParams.error && (
        <Card className="border-l-2 border-l-magenta p-4">
          <p className="text-sm text-magenta">{searchParams.error}</p>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Your booking page</p>
              {bookingUrl ? (
                <p className="break-all font-mono text-xs text-muted-foreground">{bookingUrl}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Not published yet. Until it is, the only way anybody books is on the phone.
                </p>
              )}
            </div>
          </div>
          {!bookingUrl && (
            <form action={publishLink}>
              <Button type="submit" size="sm">
                Publish it
              </Button>
            </form>
          )}
        </div>
      </Card>

      <section className="space-y-3">
        <CardTitle className="text-base">When you work</CardTitle>
        <Card className="p-5">
          <p className="mb-4 text-xs text-muted-foreground">
            Local time in {profile?.timeZone ?? settings.timeZone}. Nothing is ever offered outside
            these hours, and no appointment is offered that would run past the end of one.
          </p>
          <form action={setHours} className="space-y-4">
            <div className="flex flex-wrap gap-3">
              {WEEKDAY_NAMES.map((name, i) => (
                <label key={i} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="weekday"
                    value={i}
                    defaultChecked={rules.some((r) => r.weekday === i)}
                    className="h-4 w-4"
                  />
                  {name.slice(0, 3)}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <Label htmlFor="start">From</Label>
                <Input
                  id="start"
                  name="start"
                  type="number"
                  min="0"
                  max="23"
                  step="0.5"
                  defaultValue={(rules[0]?.startMinute ?? 480) / 60}
                  className="w-24"
                />
              </div>
              <div>
                <Label htmlFor="end">To</Label>
                <Input
                  id="end"
                  name="end"
                  type="number"
                  min="1"
                  max="24"
                  step="0.5"
                  defaultValue={(rules[0]?.endMinute ?? 1020) / 60}
                  className="w-24"
                />
              </div>
              <Button type="submit" size="sm">
                Save hours
              </Button>
            </div>
          </form>
          <p className="mt-4 text-xs text-muted-foreground">
            Currently:{" "}
            {rules.length === 0
              ? "nothing set — falling back to weekdays, 8am to 5pm"
              : rules
                  .map(
                    (r) =>
                      `${WEEKDAY_NAMES[r.weekday].slice(0, 3)} ${minutesToClock(
                        r.startMinute,
                      )}–${minutesToClock(r.endMinute)}`,
                  )
                  .join(" · ")}
          </p>
        </Card>
      </section>

      <section className="space-y-3">
        <CardTitle className="text-base">Coming up</CardTitle>
        {upcoming.length === 0 ? (
          <Card className="p-8 text-center">
            <CalendarDays className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
              {bookingUrl
                ? "Nothing in the diary yet. Appointments taken on the phone or on your booking page land here."
                : "Nothing in the diary, and no booking page published — so there is nowhere for anybody to book from yet."}
            </p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {upcoming.map((b) => (
              <Card key={b.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{b.customerName}</span>
                      <Badge variant="muted" className={cn("text-[10px]", STATUS_STYLE[b.status])}>
                        {b.status.toLowerCase().replace("_", " ")}
                      </Badge>
                      <Badge variant="muted" className="text-[10px]">
                        {b.source.toLowerCase()}
                      </Badge>
                    </div>
                    <p className="text-sm">
                      {describeSlot(
                        { start: b.startsAt, end: b.endsAt },
                        profile?.timeZone ?? settings.timeZone,
                      )}
                    </p>
                    {b.jobSummary && (
                      <p className="text-sm text-muted-foreground">{b.jobSummary}</p>
                    )}
                    {b.address && <p className="text-xs text-muted-foreground">{b.address}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    {b.remindAt && !b.remindedAt && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" /> reminder queued
                      </span>
                    )}
                    <form action={cancel}>
                      <input type="hidden" name="id" value={b.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        Cancel
                      </Button>
                    </form>
                  </div>
                </div>
              </Card>
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section className="space-y-3">
          <CardTitle className="text-base">Been and gone</CardTitle>
          <Card className="divide-y divide-border">
            {past.slice(0, 20).map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-4 p-4 text-sm">
                <span>{b.customerName}</span>
                <span className="text-xs text-muted-foreground">
                  {describeSlot(
                    { start: b.startsAt, end: b.endsAt },
                    profile?.timeZone ?? settings.timeZone,
                  )}
                </span>
                <Badge variant="muted" className={cn("text-[10px]", STATUS_STYLE[b.status])}>
                  {b.status.toLowerCase().replace("_", " ")}
                </Badge>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
