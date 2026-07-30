import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FlaskConical, CircleAlert, CircleCheck, History } from "lucide-react";
import { requireClient } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import {
  decideProposal,
  gradeUngradedCalls,
  monthlyReadOut,
  needsInput,
  refreshProposals,
} from "@/lib/voice-tuning";
import { RETUNE_THRESHOLD, type Patch } from "@/lib/training";
import { cn } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * THE TUNING LAB.
 *
 * "Grade the crew against closed deals and retune on what actually won."
 *
 * The screen is arranged around one question an owner has about an automation
 * they cannot watch: is it getting better or is it drifting? So the read-out is
 * first, the things needing a decision are second, and the version history —
 * the proof that a change happened on a date and can be traced to the calls that
 * argued for it — is last.
 *
 * Nothing on this page applies itself. Every proposal is a button an owner
 * presses, and the patch it applies was computed by a pure function that can be
 * read in `training.ts`. That is the same posture as the gate, and it is
 * deliberate: an automation that retunes itself is one nobody can answer for.
 */

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;

export default async function TuningPage({
  searchParams,
}: {
  searchParams: { note?: string };
}) {
  const { client, actor } = await requireClient();
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);

  let readOutLines: string[] = [];
  let average: number | null = null;
  let proposals: Awaited<ReturnType<typeof prisma.tuneProposal.findMany>> = [];
  let versions: { version: number; note: string | null; createdAt: Date; kind: string }[] = [];
  let ungraded = 0;
  let dbError: string | null = null;

  try {
    const [ro, props, playbooks, priceBooks, notGraded] = await Promise.all([
      monthlyReadOut(client.id, since),
      prisma.tuneProposal.findMany({
        where: { clientId: client.id },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: 40,
      }),
      prisma.voicePlaybook.findMany({
        where: { clientId: client.id },
        orderBy: { version: "desc" },
        take: 10,
        select: { version: true, note: true, createdAt: true },
      }),
      prisma.voicePriceBook.findMany({
        where: { clientId: client.id },
        orderBy: { version: "desc" },
        take: 10,
        select: { version: true, note: true, createdAt: true },
      }),
      prisma.voiceCall.count({
        where: { clientId: client.id, gradedAt: null, endedAt: { not: null } },
      }),
    ]);
    readOutLines = ro.lines;
    average = ro.average;
    proposals = props;
    ungraded = notGraded;
    versions = [
      ...playbooks.map((p) => ({ ...p, kind: "playbook" })),
      ...priceBooks.map((p) => ({ ...p, kind: "prices" })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  } catch {
    dbError =
      "The Lab cannot reach its storage, so nothing can be graded or applied. " +
      "Check /api/health for which half is wrong.";
  }

  /** Grade whatever is ungraded, then recompute what the batch implies. */
  async function grade() {
    "use server";
    const { client: c } = await requireClient();
    const { graded } = await gradeUngradedCalls(c.id);
    const { created } = await refreshProposals(c.id, new Date(Date.now() - WINDOW_DAYS * 86_400_000));
    revalidatePath("/app/tuning");
    redirect(
      `/app/tuning?note=${encodeURIComponent(
        `Graded ${graded} call${graded === 1 ? "" : "s"}. ${
          created ? `${created} new suggestion${created === 1 ? "" : "s"}.` : "No new suggestions."
        }`,
      )}`,
    );
  }

  async function decide(formData: FormData) {
    "use server";
    const { client: c, actor: a } = await requireClient();
    const id = String(formData.get("id") ?? "");
    const approve = String(formData.get("verb") ?? "") === "approve";
    const value = String(formData.get("value") ?? "");

    const result = await decideProposal(c.id, id, {
      approve,
      by: a.email || "a signed-in user",
      value,
    });
    revalidatePath("/app/tuning");
    revalidatePath("/app/voice");
    redirect(
      `/app/tuning?note=${encodeURIComponent(
        result.applied
          ? `Applied — saved as version ${result.version}. Live on the next call.`
          : `Nothing changed: ${result.why}.`,
      )}`,
    );
  }

  const pending = proposals.filter((p) => p.status === "PENDING");
  const decided = proposals.filter((p) => p.status !== "PENDING");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
            <FlaskConical className="h-5 w-5 text-violet" />
            The Tuning Lab
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Every call graded on the same rubric, and what a month of them says to change. Nothing
            here alters the operator until you press a button.
          </p>
        </div>
        {average != null && (
          <div className="rounded-xl border border-border bg-card px-4 py-2.5 text-center">
            <div className="font-mono text-xl font-bold tabular-nums">{average}</div>
            <div className="text-[0.68rem] text-muted-foreground">avg / 100</div>
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
            The Lab is unavailable
          </CardTitle>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{dbError}</p>
        </Card>
      ) : (
        <>
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <CardTitle>The last {WINDOW_DAYS} days</CardTitle>
              <form action={grade}>
                <Button type="submit" size="sm" variant={ungraded ? "default" : "outline"}>
                  {ungraded ? `Grade ${ungraded} call${ungraded === 1 ? "" : "s"}` : "Re-grade"}
                </Button>
              </form>
            </div>
            <ul className="mt-4 space-y-1.5">
              {readOutLines.map((l, i) => (
                <li key={i} className="text-sm text-muted-foreground">
                  {l}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <CardTitle>Waiting on you</CardTitle>
            {pending.length === 0 ? (
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Nothing to change. A suggestion appears here once {RETUNE_THRESHOLD} or more calls
                show the same thing — one caller asking for something you don&apos;t sell is noise,
                several is a decision.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {pending.map((p) => {
                  const patch = p.patch as unknown as Patch;
                  const input = needsInput(patch);
                  return (
                    <li key={p.id} className="rounded-lg border border-gold/30 bg-gold/[0.04] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="muted" className="text-[0.62rem]">
                          {p.target === "pricebook" ? "Price book" : "Playbook"}
                        </Badge>
                        <span className="font-medium">{p.title}</span>
                      </div>
                      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{p.why}</p>
                      <p className="mt-2 text-[0.72rem] text-muted-foreground">
                        From {p.evidence.length} call{p.evidence.length === 1 ? "" : "s"}.
                      </p>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[0.72rem] text-muted-foreground hover:text-foreground">
                          Read exactly what it would change
                        </summary>
                        <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-border bg-black/30 p-3 text-[0.7rem]">
                          {JSON.stringify(patch, null, 2)}
                        </pre>
                      </details>

                      <form action={decide} className="mt-3 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="id" value={p.id} />
                        {input.needs && (
                          <div className="min-w-[240px] flex-1">
                            <label className="text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">
                              {input.label}
                            </label>
                            <Input name="value" className="mt-1" maxLength={600} />
                          </div>
                        )}
                        <Button type="submit" name="verb" value="approve" size="sm">
                          Approve
                        </Button>
                        <Button type="submit" name="verb" value="reject" size="sm" variant="outline">
                          Not this
                        </Button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {decided.length > 0 && (
            <Card className="p-5">
              <CardTitle>Already decided</CardTitle>
              <ul className="mt-3 space-y-2">
                {decided.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    {p.status === "APPLIED" ? (
                      <CircleCheck className="h-3.5 w-3.5 text-signal" />
                    ) : (
                      <CircleAlert className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span>{p.title}</span>
                    <span className="text-[0.7rem] text-muted-foreground">
                      {p.status === "APPLIED"
                        ? `applied as v${p.resultVersion} by ${p.decidedBy}`
                        : `declined by ${p.decidedBy}`}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-5">
            <CardTitle className="flex items-center gap-2">
              <History className="h-4 w-4 text-cyan" />
              Every version
            </CardTitle>
            {versions.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Nothing saved yet. The operator is running the built-in default.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {versions.map((v) => (
                  <li
                    key={`${v.kind}-${v.version}`}
                    className={cn(
                      "flex flex-wrap items-baseline gap-2 rounded-lg border border-border px-3 py-2 text-sm",
                    )}
                  >
                    <Badge variant="muted" className="text-[0.62rem]">
                      {v.kind} v{v.version}
                    </Badge>
                    <span className="text-muted-foreground">
                      {v.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                    </span>
                    {v.note && <span>{v.note}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      <p className="text-[0.72rem] text-muted-foreground">
        Signed in as {actor.email}. Approvals are recorded against this address.
      </p>
    </div>
  );
}
