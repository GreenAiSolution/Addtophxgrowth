import { revalidatePath } from "next/cache";
import { BriefcaseBusiness, Pause, Play } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/tenancy";
import { EMPLOYEES, employeeBySlug } from "@/lib/employees";
import { upgradeByKey } from "@/lib/upgrades";
import { formatCurrency } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Hiring an employee for a client.
 *
 * The last mile is an agency action for the same reason granting capacity is:
 * an employee staffs an automation build that is scoped and billed in a
 * conversation, not bought at a button. A row here is what makes it real — the
 * shift runner walks `Employment`, so an employee nobody has hired never reads
 * a single record.
 *
 * NEW HIRES START SUPERVISED
 *   The default is TRIAL rather than ACTIVE, and that is not caution theatre.
 *   In TRIAL every proposal is forced to a manual hold — including the ones
 *   that would normally send on a timer — so the client sees a week of the
 *   employee's actual judgement before anything can go out unattended. It is
 *   the same shape as the supervised pilot week the Launch blueprint sells,
 *   and it is the only week in which a mis-set ceiling is cheap.
 */
export async function EmploymentControls({ clientId }: { clientId: string }) {
  const employments = await prisma.employment.findMany({
    where: { clientId },
    orderBy: { hiredAt: "desc" },
  });

  async function hire(formData: FormData) {
    "use server";
    const actor = await requireAdmin();

    const employeeSlug = String(formData.get("employeeSlug") ?? "");
    const employee = employeeBySlug(employeeSlug);
    if (!employee) return;

    const targetId = String(formData.get("clientId") ?? "");
    const client = await prisma.clientProfile.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (!client) return;

    const rawCeiling = Number(formData.get("ceilingDollars") ?? 0);
    const ceiling = Number.isFinite(rawCeiling) && rawCeiling > 0 ? Math.round(rawCeiling * 100) : null;
    const note = String(formData.get("note") ?? "").trim() || null;

    await prisma.employment.upsert({
      where: { clientId_employeeSlug: { clientId: client.id, employeeSlug } },
      update: { state: "TRIAL", moneyCeilingCents: ceiling, note },
      create: {
        clientId: client.id,
        employeeSlug,
        state: "TRIAL",
        moneyCeilingCents: ceiling,
        note,
        hiredBy: actor.userId,
      },
    });

    revalidatePath(`/admin/clients/${client.id}`);
  }

  async function setState(formData: FormData) {
    "use server";
    await requireAdmin();
    const id = String(formData.get("id") ?? "");
    const targetId = String(formData.get("clientId") ?? "");
    const state = String(formData.get("state") ?? "");
    if (!["TRIAL", "ACTIVE", "SUSPENDED"].includes(state)) return;

    const row = await prisma.employment.findFirst({
      where: { id, clientId: targetId },
      select: { id: true, clientId: true },
    });
    if (!row) return;

    await prisma.employment.update({
      where: { id: row.id },
      data: { state: state as never },
    });
    revalidatePath(`/admin/clients/${row.clientId}`);
  }

  return (
    <Card>
      <div className="flex items-center gap-2">
        <BriefcaseBusiness className="h-4 w-4 text-cyan" />
        <CardTitle>The desk</CardTitle>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        An employee here reads this client&apos;s records and proposes real actions into their
        queue. Hire one only once the build it staffs has been agreed and billed.
      </p>

      {employments.length > 0 ? (
        <ul className="mt-4 divide-y divide-border/40">
          {employments.map((e) => {
            const employee = employeeBySlug(e.employeeSlug);
            const ceiling = e.moneyCeilingCents ?? employee?.authority.moneyCeilingCents ?? 0;
            return (
              <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    {employee?.name ?? e.employeeSlug}
                    <Badge variant={e.state === "ACTIVE" ? "success" : "muted"}>
                      {e.state.toLowerCase()}
                    </Badge>
                  </div>
                  <div className="hud-label mt-0.5">
                    hired {e.hiredAt.toISOString().slice(0, 10)} · commits up to{" "}
                    {formatCurrency(ceiling)} unasked
                  </div>
                  {e.note && <div className="mt-0.5 text-xs text-muted-foreground">{e.note}</div>}
                </div>
                <div className="flex shrink-0 gap-2">
                  {e.state !== "ACTIVE" && (
                    <form action={setState}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="clientId" value={clientId} />
                      <input type="hidden" name="state" value="ACTIVE" />
                      <Button type="submit" variant="ghost" size="sm">
                        <Play className="h-3.5 w-3.5" /> Off supervision
                      </Button>
                    </form>
                  )}
                  {e.state !== "SUSPENDED" && (
                    <form action={setState}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="clientId" value={clientId} />
                      <input type="hidden" name="state" value="SUSPENDED" />
                      <Button type="submit" variant="ghost" size="sm">
                        <Pause className="h-3.5 w-3.5" /> Stop
                      </Button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
          Nobody hired. This client&apos;s queue can only ever be empty — there is nothing running
          that could propose anything into it.
        </p>
      )}

      <form action={hire} className="mt-5 grid gap-3 border-t border-border/50 pt-4 sm:grid-cols-2">
        <input type="hidden" name="clientId" value={clientId} />
        <div className="sm:col-span-2">
          <Label htmlFor="employeeSlug">Employee</Label>
          <select
            id="employeeSlug"
            name="employeeSlug"
            className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
            defaultValue={EMPLOYEES[0]?.slug}
          >
            {EMPLOYEES.map((e) => (
              <option key={e.slug} value={e.slug}>
                {e.name} — staffs {upgradeByKey(e.build)?.name ?? e.build}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="ceilingDollars">Ceiling ($, blank = roster default)</Label>
          <Input id="ceilingDollars" name="ceilingDollars" type="number" min={0} placeholder="2000" />
        </div>
        <div>
          <Label htmlFor="note">Note (what was agreed, invoice ref)</Label>
          <Input id="note" name="note" placeholder="Job Runner build signed 4 Aug — inv #1102" />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm">
            Hire — starts supervised
          </Button>
        </div>
      </form>
    </Card>
  );
}
