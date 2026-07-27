import { revalidatePath } from "next/cache";
import { Target, Check } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/tenancy";
import { checksForPlan, type AdAlertKind } from "@/lib/spend-watch";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Targets are the input the Spend Watch can't invent.
 *
 * Three of the seven checks — pacing, cost-per-sale breach, ROAS decline —
 * measure against a number only the client knows. The engine correctly skips a
 * check with no target rather than guessing, which meant that until this form
 * existed those three could never fire for anybody: nothing in the app could
 * write the values. This is that missing input.
 *
 * Dollars in, cents stored. Clearing a field sets the target back to null and
 * switches that check off again, which is a legitimate choice rather than an
 * error — some accounts genuinely have no budget cap.
 */

/** Which checks each target switches on, so the UI can say what it buys. */
const TARGET_UNLOCKS: Record<string, { label: string; checks: AdAlertKind[] }> = {
  monthlyBudgetCents: { label: "Budget Pacing Watch", checks: ["PACING_OVER", "PACING_UNDER"] },
  targetCpaCents: { label: "Target CPA Guardrail", checks: ["CPA_BREACH"] },
  targetRoas: { label: "ROAS Trend Watch", checks: ["ROAS_DECLINE"] },
};

function dollars(cents: number | null): string {
  return cents == null ? "" : String(Math.round(cents / 100));
}

/** "" clears the target; anything unparseable is treated as a clear, not a 0. */
function parseDollars(raw: FormDataEntryValue | null): number | null {
  const cleaned = String(raw ?? "").replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function parseRatio(raw: FormDataEntryValue | null): number | null {
  const cleaned = String(raw ?? "").replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export async function AdAccountTargets({
  clientId,
  planKey,
}: {
  clientId: string;
  planKey: string | null | undefined;
}) {
  const accounts = await prisma.adAccount.findMany({
    where: { clientId },
    orderBy: { createdAt: "asc" },
  });
  if (accounts.length === 0) return null;

  const enabled = checksForPlan(planKey);

  async function saveTargets(formData: FormData) {
    "use server";
    const { client } = await requireClient();

    const accountId = String(formData.get("accountId") ?? "");
    // Scoped read before the write — an id in a hidden field is untrusted, and
    // a cross-tenant write here would rewrite someone else's budget.
    const account = await prisma.adAccount.findFirst({
      where: { id: accountId, clientId: client.id },
      select: { id: true },
    });
    if (!account) return;

    await prisma.adAccount.update({
      where: { id: account.id },
      data: {
        monthlyBudgetCents: parseDollars(formData.get("monthlyBudget")),
        targetCpaCents: parseDollars(formData.get("targetCpa")),
        targetRoas: parseRatio(formData.get("targetRoas")),
      },
    });

    revalidatePath("/app/ads");
  }

  return (
    <Card>
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-secondary" />
        <CardTitle>Targets</CardTitle>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        These are the numbers the Spend Watch measures against. A check with no target is skipped
        rather than guessed — we would rather run fewer checks than raise an alarm against a figure
        we invented. Leave a field blank to switch its check back off.
      </p>

      <div className="mt-5 space-y-6">
        {accounts.map((a) => {
          const missing = Object.entries(TARGET_UNLOCKS).filter(([field, meta]) => {
            const unset =
              field === "targetRoas"
                ? a.targetRoas == null
                : (a[field as "monthlyBudgetCents" | "targetCpaCents"] ?? null) == null;
            return unset && meta.checks.some((c) => enabled.has(c));
          });

          return (
            <form
              key={a.id}
              action={saveTargets}
              className="rounded-md border border-border/60 p-4"
            >
              <input type="hidden" name="accountId" value={a.id} />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{a.name}</div>
                  <div className="hud-label">{a.platform}</div>
                </div>
                {missing.length === 0 ? (
                  <Badge variant="success">
                    <Check className="h-3 w-3" /> all checks armed
                  </Badge>
                ) : (
                  <Badge variant="muted">
                    {missing.length} check{missing.length === 1 ? "" : "s"} asleep
                  </Badge>
                )}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor={`budget-${a.id}`}>Monthly budget ($)</Label>
                  <Input
                    id={`budget-${a.id}`}
                    name="monthlyBudget"
                    inputMode="decimal"
                    placeholder="5000"
                    defaultValue={dollars(a.monthlyBudgetCents)}
                  />
                  <p className="mt-1 text-[0.65rem] text-muted-foreground">
                    Arms pacing — over and under.
                  </p>
                </div>
                <div>
                  <Label htmlFor={`cpa-${a.id}`}>Target cost per sale ($)</Label>
                  <Input
                    id={`cpa-${a.id}`}
                    name="targetCpa"
                    inputMode="decimal"
                    placeholder="600"
                    defaultValue={dollars(a.targetCpaCents)}
                  />
                  <p className="mt-1 text-[0.65rem] text-muted-foreground">
                    Arms the cost-per-sale guardrail.
                  </p>
                </div>
                <div>
                  <Label htmlFor={`roas-${a.id}`}>Target ROAS (×)</Label>
                  <Input
                    id={`roas-${a.id}`}
                    name="targetRoas"
                    inputMode="decimal"
                    placeholder="3.5"
                    defaultValue={a.targetRoas == null ? "" : String(a.targetRoas)}
                  />
                  <p className="mt-1 text-[0.65rem] text-muted-foreground">
                    Arms the return-on-ad-spend watch.
                  </p>
                </div>
              </div>

              {missing.length > 0 && (
                <p className="mt-3 text-xs text-amber-300/90">
                  Asleep on this account:{" "}
                  {missing.map(([, m]) => m.label).join(", ")} — set the matching target above and
                  the next sweep picks it up.
                </p>
              )}

              <div className="mt-4">
                <Button type="submit" size="sm" variant="outline">
                  Save targets
                </Button>
              </div>
            </form>
          );
        })}
      </div>
    </Card>
  );
}
