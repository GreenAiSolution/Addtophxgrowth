import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { FileText, AlertTriangle, Plus, Send, ShieldCheck, Trash2 } from "lucide-react";
import { requireClient } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { employeeByKey } from "@/lib/employees";
import {
  RATE_UNITS,
  canSend,
  describeGap,
  unitShort,
  type LineRequest,
} from "@/lib/estimating";
import {
  contactLine,
  describeStatus,
  draftEstimate,
  queueEstimate,
  rateCardFor,
  repriceStored,
} from "@/lib/estimates";
import { formatCurrency, cn } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RateUnit } from "@prisma/client";

/**
 * Where prices get made.
 *
 * Two halves, and the order is the argument: the rate card first, because
 * nothing can be quoted off a card that does not exist, and an estimator with
 * no rates is the one failure mode that looks like the feature being broken
 * rather than unconfigured.
 */

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "border-border text-muted-foreground",
  HELD: "border-cyan/40 text-cyan",
  SENT: "border-violet/40 text-violet",
  VIEWED: "border-violet/40 text-violet",
  ACCEPTED: "border-cyan/50 text-cyan",
  DECLINED: "border-magenta/40 text-magenta",
  EXPIRED: "border-border text-muted-foreground",
  WITHDRAWN: "border-border text-muted-foreground",
};

export default async function EstimatesPage({
  searchParams,
}: {
  searchParams: { error?: string; ok?: string };
}) {
  const { client } = await requireClient();
  const now = new Date();
  const gauge = employeeByKey("estimator")!;

  const [rates, estimates, profile] = await Promise.all([
    rateCardFor(client.id),
    prisma.estimate.findMany({
      where: { clientId: client.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.clientProfile.findUnique({
      where: { id: client.id },
      select: { taxRatePercent: true },
    }),
  ]);

  async function addRate(formData: FormData) {
    "use server";
    const { client: c } = await requireClient();
    const code = String(formData.get("code") ?? "").trim().toUpperCase();
    const label = String(formData.get("label") ?? "").trim();
    const unit = String(formData.get("unit") ?? "EACH") as RateUnit;
    const price = Number(formData.get("price"));
    const minimum = Number(formData.get("minimum"));

    if (!code || !label || !Number.isFinite(price) || price < 0) {
      redirect("/app/estimates?error=A+code%2C+a+label+and+a+price+are+all+required.");
    }

    await prisma.rateCardItem.upsert({
      where: { clientId_code: { clientId: c.id, code } },
      create: {
        clientId: c.id,
        code,
        label,
        unit,
        unitPriceCents: Math.round(price * 100),
        minimumCents: Number.isFinite(minimum) && minimum > 0 ? Math.round(minimum * 100) : null,
        taxable: formData.get("taxable") !== null,
      },
      update: {
        label,
        unit,
        unitPriceCents: Math.round(price * 100),
        minimumCents: Number.isFinite(minimum) && minimum > 0 ? Math.round(minimum * 100) : null,
        taxable: formData.get("taxable") !== null,
        active: true,
      },
    });
    revalidatePath("/app/estimates");
  }

  async function removeRate(formData: FormData) {
    "use server";
    const { client: c } = await requireClient();
    const code = String(formData.get("code") ?? "").trim().toUpperCase();
    if (!code) return;
    // Deactivated, never deleted. Estimates snapshot their lines, so deleting
    // the row would not corrupt an old quote — but the code is what the client
    // types, and one they can resurrect is kinder than one they must retype.
    // Scoped by clientId as well as code: a tenant must never be able to
    // deactivate somebody else's rate by guessing a common code like LABOUR.
    await prisma.rateCardItem.updateMany({
      where: { code, clientId: c.id },
      data: { active: false },
    });
    revalidatePath("/app/estimates");
  }

  async function createEstimate(formData: FormData) {
    "use server";
    const { client: c } = await requireClient();
    const customerName = String(formData.get("customerName") ?? "").trim();
    const jobSummary = String(formData.get("jobSummary") ?? "").trim();
    if (!customerName || !jobSummary) {
      redirect("/app/estimates?error=A+customer+and+a+job+are+both+required.");
    }

    // Lines arrive as parallel arrays from the repeated fields.
    const codes = formData.getAll("lineCode").map(String);
    const quantities = formData.getAll("lineQty").map((q) => Number(q));
    const lines: LineRequest[] = codes
      .map((code, i) => ({ code: code.trim().toUpperCase(), quantity: quantities[i] }))
      .filter((l) => l.code && Number.isFinite(l.quantity) && l.quantity > 0);

    if (lines.length === 0) {
      redirect("/app/estimates?error=Add+at+least+one+line+with+a+quantity.");
    }

    const { priced } = await draftEstimate({
      clientId: c.id,
      customerName,
      customerPhone: String(formData.get("customerPhone") ?? "").trim() || null,
      customerEmail: String(formData.get("customerEmail") ?? "").trim() || null,
      jobSummary,
      lines,
    });

    revalidatePath("/app/estimates");
    const gap = describeGap(priced);
    if (gap) redirect(`/app/estimates?error=${encodeURIComponent(`Saved, but ${gap}`)}`);
    redirect("/app/estimates?ok=Priced+and+saved+as+a+draft.");
  }

  async function send(formData: FormData) {
    "use server";
    const { client: c } = await requireClient();
    const id = String(formData.get("id") ?? "");
    const owned = await prisma.estimate.findFirst({
      where: { id, clientId: c.id },
      select: { id: true },
    });
    if (!owned) return;

    const verdict = await queueEstimate(owned.id);
    revalidatePath("/app/estimates");
    revalidatePath("/app/gate");
    if (!verdict.queued) {
      redirect(`/app/estimates?error=${encodeURIComponent(verdict.why)}`);
    }
    redirect("/app/estimates?ok=In+the+queue.+Release+it+and+it+goes.");
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {gauge.name} · {gauge.role}
        </p>
        <h1 className="text-2xl font-semibold">Estimates</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{gauge.leak}</p>
      </header>

      {searchParams.error && (
        <Card className="border-l-2 border-l-magenta p-4">
          <p className="text-sm text-magenta">{searchParams.error}</p>
        </Card>
      )}
      {searchParams.ok && (
        <Card className="border-l-2 border-l-cyan p-4">
          <p className="text-sm text-cyan">{searchParams.ok}</p>
        </Card>
      )}

      {rates.length === 0 && (
        <Card className="border-l-2 border-l-magenta p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-magenta" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">There is no rate card yet.</p>
              <p className="text-muted-foreground">
                Nothing can be quoted until there is. {gauge.name} prices off your rates and
                nothing else — it will never invent a number it was not given, which means an
                empty card produces no estimates rather than cheap ones.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ---- The rate card ---- */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <CardTitle className="text-base">Your rate card</CardTitle>
          <span className="text-xs text-muted-foreground">
            {rates.length} live rate{rates.length === 1 ? "" : "s"}
          </span>
        </div>

        {rates.length > 0 && (
          <Card className="divide-y divide-border">
            {rates.map((r) => (
              <div key={r.code} className="flex flex-wrap items-center gap-3 p-4">
                <span className="font-mono text-xs text-cyan">{r.code}</span>
                <span className="flex-1 text-sm">{r.label}</span>
                <span className="text-sm">
                  {formatCurrency(r.unitPriceCents)}
                  <span className="text-muted-foreground"> / {unitShort(r.unit)}</span>
                </span>
                {r.minimumCents ? (
                  <Badge variant="muted" className="text-[10px]">
                    min {formatCurrency(r.minimumCents)}
                  </Badge>
                ) : null}
                {!r.taxable && (
                  <Badge variant="muted" className="text-[10px]">
                    no tax
                  </Badge>
                )}
                <form action={removeRate}>
                  <input type="hidden" name="code" value={r.code} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${r.label}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </form>
              </div>
            ))}
          </Card>
        )}

        <Card className="p-5">
          <form action={addRate} className="grid gap-4 sm:grid-cols-6">
            <div className="sm:col-span-1">
              <Label htmlFor="code">Code</Label>
              <Input id="code" name="code" placeholder="LABOUR" required />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="label">Label</Label>
              <Input id="label" name="label" placeholder="Labour, standard rate" required />
            </div>
            <div className="sm:col-span-1">
              <Label htmlFor="unit">Unit</Label>
              <select
                id="unit"
                name="unit"
                className="h-10 w-full rounded-md border border-border bg-transparent px-3 text-sm"
              >
                {RATE_UNITS.map((u) => (
                  <option key={u.key} value={u.key}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-1">
              <Label htmlFor="price">Price</Label>
              <Input id="price" name="price" type="number" step="0.01" min="0" required />
            </div>
            <div className="sm:col-span-1">
              <Label htmlFor="minimum">Minimum</Label>
              <Input id="minimum" name="minimum" type="number" step="0.01" min="0" />
            </div>
            <div className="flex items-center gap-2 sm:col-span-4">
              <input id="taxable" name="taxable" type="checkbox" defaultChecked className="h-4 w-4" />
              <Label htmlFor="taxable" className="text-xs text-muted-foreground">
                Taxable{" "}
                {profile?.taxRatePercent
                  ? `(at ${profile.taxRatePercent}%)`
                  : "— no tax rate set, so nothing is charged"}
              </Label>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" className="w-full">
                <Plus className="mr-1 h-3.5 w-3.5" /> Save rate
              </Button>
            </div>
          </form>
        </Card>
      </section>

      {/* ---- New estimate ---- */}
      {rates.length > 0 && (
        <section className="space-y-4">
          <CardTitle className="text-base">Price a job</CardTitle>
          <Card className="p-5">
            <form action={createEstimate} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="customerName">Customer</Label>
                  <Input id="customerName" name="customerName" required />
                </div>
                <div>
                  <Label htmlFor="customerPhone">Phone</Label>
                  <Input id="customerPhone" name="customerPhone" />
                </div>
                <div>
                  <Label htmlFor="customerEmail">Email</Label>
                  <Input id="customerEmail" name="customerEmail" type="email" />
                </div>
              </div>
              <div>
                <Label htmlFor="jobSummary">The job</Label>
                <Textarea id="jobSummary" name="jobSummary" rows={2} required />
              </div>

              <div className="space-y-2">
                <Label>Lines</Label>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="grid grid-cols-3 gap-3">
                    <select
                      name="lineCode"
                      className="col-span-2 h-10 rounded-md border border-border bg-transparent px-3 text-sm"
                      defaultValue=""
                    >
                      <option value="">—</option>
                      {rates.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.code} · {r.label} ({formatCurrency(r.unitPriceCents)}/
                          {unitShort(r.unit)})
                        </option>
                      ))}
                    </select>
                    <Input name="lineQty" type="number" step="0.25" min="0" placeholder="Qty" />
                  </div>
                ))}
              </div>

              <Button type="submit">Price it</Button>
            </form>
          </Card>
        </section>
      )}

      {/* ---- The estimates ---- */}
      <section className="space-y-4">
        <CardTitle className="text-base">Estimates</CardTitle>
        {estimates.length === 0 ? (
          <Card className="p-8 text-center">
            <FileText className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
              Nothing priced yet. Estimates raised on a call land here too, ready to release.
            </p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {estimates.map((e) => {
              const priced = repriceStored(e.lines, e.taxRatePercent);
              const verdict = canSend(priced);
              return (
                <Card key={e.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          {e.reference}
                        </span>
                        <span className="font-medium">{e.customerName}</span>
                        <Badge
                          variant="muted"
                          className={cn("text-[10px]", STATUS_STYLE[e.status])}
                        >
                          {e.status.toLowerCase()}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{e.jobSummary}</p>
                      <p className="text-xs text-muted-foreground">
                        {describeStatus(e.status, e.sentAt, now)} · {contactLine(e)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold">{formatCurrency(e.totalCents)}</p>
                      {e.taxCents > 0 && (
                        <p className="text-xs text-muted-foreground">
                          incl. {formatCurrency(e.taxCents)} tax
                        </p>
                      )}
                    </div>
                  </div>

                  <ul className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                    {priced.lines.map((l, i) => (
                      <li key={i} className="flex justify-between gap-4">
                        <span>
                          {l.label} · {l.quantity} {unitShort(l.unit)}
                          {l.minimumApplied && " (minimum applied)"}
                        </span>
                        <span>{formatCurrency(l.amountCents)}</span>
                      </li>
                    ))}
                  </ul>

                  {!verdict.ok && (
                    <p className="mt-3 flex items-start gap-2 text-xs text-magenta">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {verdict.ok === false && verdict.why}
                    </p>
                  )}

                  {e.status === "DRAFT" && (
                    <form action={send} className="mt-4 flex items-center gap-3">
                      <input type="hidden" name="id" value={e.id} />
                      <Button type="submit" size="sm" disabled={!verdict.ok}>
                        <Send className="mr-1 h-3.5 w-3.5" /> Queue to send
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        A price is a commitment, so it waits for you to release it.
                      </span>
                    </form>
                  )}

                  {e.status === "HELD" && (
                    <p className="mt-4 flex items-center gap-2 text-xs text-cyan">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Waiting in{" "}
                      <Link href="/app/gate" className="underline underline-offset-4">
                        the queue
                      </Link>{" "}
                      for you to release it.
                    </p>
                  )}
                </Card>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
