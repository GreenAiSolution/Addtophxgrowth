import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FileText, CircleAlert, ShieldCheck } from "lucide-react";
import { requireClient } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { proposeEstimateSend } from "@/lib/voice-store";
import { cn, formatCurrency } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { EstimateStatus } from "@prisma/client";

/**
 * ESTIMATES.
 *
 * What the operator priced on the phone, and what happened to it afterwards.
 *
 * The button on this page does not send anything. It *proposes* — the estimate
 * goes to the queue as a money-moving action and waits for a named release,
 * because a written price is the number the customer holds the business to. The
 * copy says so plainly, since a button labelled "Send" that doesn't send is
 * worse than no button.
 */

export const dynamic = "force-dynamic";

const STATUS: Record<EstimateStatus, { label: string; style: string; blurb: string }> = {
  DRAFT: {
    label: "Priced on the call",
    style: "border-cyan/40 text-cyan",
    blurb: "Said out loud, nothing in writing yet.",
  },
  QUEUED: {
    label: "Waiting in the queue",
    style: "border-gold/40 text-gold",
    blurb: "Held until somebody releases it against their name.",
  },
  SENT: { label: "Sent", style: "border-signal/40 text-signal", blurb: "" },
  ACCEPTED: { label: "Accepted", style: "border-signal/40 text-signal", blurb: "" },
  DECLINED: { label: "Declined", style: "border-border text-muted-foreground", blurb: "" },
};

export default async function EstimatesPage({
  searchParams,
}: {
  searchParams: { note?: string };
}) {
  const { client, actor } = await requireClient();

  let estimates: Awaited<ReturnType<typeof prisma.voiceEstimate.findMany>> = [];
  let dbError: string | null = null;
  try {
    estimates = await prisma.voiceEstimate.findMany({
      where: { clientId: client.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  } catch {
    dbError =
      "Estimates cannot be read right now. Nothing has been sent either — the same failure " +
      "stops the queue. Check /api/health for which half is wrong.";
  }

  async function send(formData: FormData) {
    "use server";
    const { client: c } = await requireClient();
    const id = String(formData.get("id") ?? "");

    // Re-scoped inside the action. A form field is user input like any other.
    const owned = await prisma.voiceEstimate.findFirst({
      where: { id, clientId: c.id },
      select: { id: true, status: true },
    });
    if (!owned) return;
    if (owned.status !== "DRAFT") {
      redirect(`/app/estimates?note=${encodeURIComponent("That one is already on its way.")}`);
    }

    await proposeEstimateSend(owned.id);
    revalidatePath("/app/estimates");
    revalidatePath("/app/gate");
    redirect(
      `/app/estimates?note=${encodeURIComponent(
        "In the queue. It goes out when you release it — nothing has been sent yet.",
      )}`,
    );
  }

  const draftValue = estimates
    .filter((e) => e.status === "DRAFT")
    .reduce((s, e) => s + e.totalCents, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
            <FileText className="h-5 w-5 text-cyan" />
            Estimates
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Every job the operator priced, and exactly what it said out loud. Nothing here reaches a
            customer in writing until you release it.
          </p>
        </div>
        {draftValue > 0 && (
          <div className="rounded-xl border border-cyan/40 bg-cyan/[0.06] px-4 py-2.5 text-center">
            <div className="font-mono text-xl font-bold tabular-nums text-cyan">
              {formatCurrency(draftValue)}
            </div>
            <div className="text-[0.68rem] text-muted-foreground">priced, not yet sent</div>
          </div>
        )}
      </header>

      {searchParams.note && (
        <Card className="border-cyan/40 p-4">
          <p className="text-sm text-cyan">{searchParams.note}</p>
        </Card>
      )}

      {dbError ? (
        <Card className="border-magenta/40 p-8">
          <CardTitle className="flex items-center gap-2">
            <CircleAlert className="h-4 w-4 text-magenta" />
            Estimates are unavailable
          </CardTitle>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{dbError}</p>
        </Card>
      ) : estimates.length === 0 ? (
        <Card className="p-8">
          <CardTitle>Nothing priced yet</CardTitle>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            When the operator prices a job on a call it appears here — with the breakdown, the
            confidence, and the exact sentence the caller heard. It can only ever quote from your
            price book, so if this stays empty while calls are coming in, the book is the place to
            look.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {estimates.map((e) => {
            const style = STATUS[e.status];
            const payload = (e.payload ?? {}) as Record<string, unknown>;
            const lines = Array.isArray(payload.lines)
              ? (payload.lines as Record<string, unknown>[])
              : [];
            return (
              <Card key={e.id} className={cn("p-5", e.status === "DRAFT" && "border-cyan/25")}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="muted" className={cn("text-[0.62rem]", style.style)}>
                        {style.label}
                      </Badge>
                      <span className="font-mono text-lg font-bold tabular-nums">
                        {formatCurrency(e.totalCents)}
                      </span>
                      <span className="text-[0.7rem] text-muted-foreground">
                        range {formatCurrency(e.lowCents)}–{formatCurrency(e.highCents)} ·{" "}
                        {e.confidence.toLowerCase()} confidence
                      </span>
                    </div>

                    <p className="mt-2 font-medium">
                      {e.customerName || e.customerPhone || "A caller"}
                      {e.jobDescription ? ` — ${e.jobDescription}` : ""}
                    </p>
                    {e.customerAddress && (
                      <p className="text-sm text-muted-foreground">{e.customerAddress}</p>
                    )}

                    {/* What the caller actually heard, verbatim. If they ever say
                        "you told me eleven hundred", this is the answer. */}
                    {e.spoken && (
                      <p className="mt-2.5 rounded-lg border border-border bg-black/20 px-3 py-2 text-[0.78rem]">
                        <span className="text-muted-foreground">Said on the call: </span>
                        {e.spoken}
                      </p>
                    )}

                    {lines.length > 0 && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-[0.75rem] text-muted-foreground hover:text-foreground">
                          The breakdown
                        </summary>
                        <ul className="mt-2 space-y-1 rounded-lg border border-border bg-black/20 p-3 text-[0.75rem]">
                          {lines.map((l, i) => (
                            <li key={i} className="flex justify-between gap-4">
                              <span>
                                {String(l.label ?? "")} × {String(l.qty ?? "")} {String(l.unit ?? "")}
                                {l.note ? ` (${String(l.note)})` : ""}
                              </span>
                              <span className="font-mono">{String(l.total ?? "")}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}

                    {style.blurb && (
                      <p className="mt-2 text-[0.72rem] text-muted-foreground">{style.blurb}</p>
                    )}
                  </div>

                  {e.status === "DRAFT" && (
                    <form action={send} className="shrink-0">
                      <input type="hidden" name="id" value={e.id} />
                      <Button type="submit" size="sm">
                        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                        Put it in the queue
                      </Button>
                    </form>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-[0.72rem] text-muted-foreground">
        Signed in as {actor.email}. Releases happen on{" "}
        <a href="/app/gate" className="text-cyan hover:underline">
          the queue
        </a>{" "}
        and are recorded against this address.
      </p>
    </div>
  );
}
