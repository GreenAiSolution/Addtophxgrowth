import { notFound, redirect } from "next/navigation";
import { CalendarCheck, Clock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { offerSlots, settingsFor, takeSlot, announceBooking, confirmToCustomer } from "@/lib/bookings";
import { describeSlot } from "@/lib/booking";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * The public booking page.
 *
 * The only surface in this repository a customer of a customer ever touches, so
 * it is deliberately the plainest thing here: real slots, one form, no account.
 * Every friction step between "yes" and "in the diary" is a place the yes can
 * evaporate, which is the whole leak Dispatch exists to close.
 *
 * Force-dynamic because a cached list of free slots is a list of slots that
 * were free — and offering a taken one is exactly the failure the booker was
 * built to prevent.
 */

export const dynamic = "force-dynamic";

export default async function BookPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { error?: string; booked?: string };
}) {
  const client = await prisma.clientProfile.findUnique({
    where: { bookingSlug: params.slug },
    select: { id: true, businessName: true, timeZone: true, serviceArea: true },
  });
  if (!client) notFound();

  const now = new Date();
  const [slots, settings] = await Promise.all([
    offerSlots(client.id, now),
    settingsFor(client.id),
  ]);

  async function book(formData: FormData) {
    "use server";
    const startRaw = String(formData.get("start") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const job = String(formData.get("job") ?? "").trim();

    if (!name || !startRaw) {
      redirect(`/book/${params.slug}?error=${encodeURIComponent("Pick a time and give us a name.")}`);
    }

    const start = new Date(startRaw);
    if (Number.isNaN(start.getTime())) {
      redirect(`/book/${params.slug}?error=${encodeURIComponent("That is not a real time.")}`);
    }

    const target = await prisma.clientProfile.findUnique({
      where: { bookingSlug: params.slug },
      select: { id: true, businessName: true, timeZone: true },
    });
    if (!target) notFound();

    const result = await takeSlot({
      clientId: target.id,
      start,
      customerName: name,
      customerPhone: phone || null,
      customerEmail: String(formData.get("email") ?? "").trim() || null,
      address: String(formData.get("address") ?? "").trim() || null,
      jobSummary: job || null,
      source: "WEB",
    });

    if (!result.booked) {
      redirect(`/book/${params.slug}?error=${encodeURIComponent(result.why)}`);
    }

    const booking = {
      customerName: name,
      customerPhone: phone || null,
      startsAt: result.start,
      endsAt: result.end,
      jobSummary: job || null,
    };
    announceBooking(booking, target.businessName, target.timeZone);
    await confirmToCustomer(booking, target.businessName, target.timeZone);

    redirect(
      `/book/${params.slug}?booked=${encodeURIComponent(
        describeSlot({ start: result.start, end: result.end }, target.timeZone),
      )}`,
    );
  }

  if (searchParams.booked) {
    return (
      <main className="mx-auto max-w-lg px-6 py-20">
        <Card className="p-8 text-center">
          <CalendarCheck className="mx-auto h-8 w-8 text-cyan" />
          <CardTitle className="mt-4 text-xl">You&apos;re booked.</CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            {client.businessName} will be with you {searchParams.booked}.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            We&apos;ll send a reminder the evening before. Reply to it if anything changes.
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg space-y-6 px-6 py-16">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Book {client.businessName}</h1>
        <p className="text-sm text-muted-foreground">
          Pick a time that suits you. These are real openings — whatever you take is yours.
          {client.serviceArea ? ` Serving ${client.serviceArea}.` : ""}
        </p>
      </header>

      {searchParams.error && (
        <Card className="border-l-2 border-l-magenta p-4">
          <p className="text-sm text-magenta">{searchParams.error}</p>
        </Card>
      )}

      {slots.length === 0 ? (
        <Card className="p-8 text-center">
          <Clock className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Nothing free in the next {settings.horizonDays} days. Give us a ring and we&apos;ll
            find you something.
          </p>
        </Card>
      ) : (
        <form action={book} className="space-y-5">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Choose a time</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {slots.map((s, i) => (
                <label
                  key={s.start.toISOString()}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border p-3 text-sm transition hover:border-cyan/40 has-[:checked]:border-cyan has-[:checked]:bg-cyan/5"
                >
                  <input
                    type="radio"
                    name="start"
                    value={s.start.toISOString()}
                    defaultChecked={i === 0}
                    className="h-3.5 w-3.5"
                  />
                  {describeSlot(s, client.timeZone)}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Each appointment is about {settings.durationMinutes} minutes.
            </p>
          </fieldset>

          <div className="space-y-3">
            <div>
              <Label htmlFor="name">Your name</Label>
              <Input id="name" name="name" required />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" type="tel" />
            </div>
            <div>
              <Label htmlFor="address">Where is the work?</Label>
              <Input id="address" name="address" />
            </div>
            <div>
              <Label htmlFor="job">What do you need?</Label>
              <Textarea id="job" name="job" rows={3} />
            </div>
          </div>

          <Button type="submit" className="w-full">
            Book it
          </Button>
        </form>
      )}
    </main>
  );
}
