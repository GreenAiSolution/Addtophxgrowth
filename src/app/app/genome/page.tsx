import { Dna, MousePointerClick, UserCheck } from "lucide-react";
import { requireClient } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { genomeForClient } from "@/lib/genome/genome";
import { axisByKey } from "@/lib/genome/taxonomy";
import { MIN_ACCOUNTS } from "@/lib/genome/pool";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * The Creative Genome, as it applies to this one client.
 *
 * Everything here is `genomeForClient` output: pooled rows filtered to this
 * tenant, with their own contrast shrunk toward the book. Per-account studies
 * never reach this page — the raw `studies` column is filtered to the caller's
 * own accounts inside the lib, and nothing here renders an account identifier
 * that is not the client's own.
 *
 * The sentences are rendered once by `describeEffect` at refresh time and
 * quoted verbatim, so this page cannot restate a finding more confidently
 * than the estimator did.
 */

function labelsFor(axis: string, value: string): { axisLabel: string; valueLabel: string } {
  const a = axisByKey(axis);
  return {
    axisLabel: a?.label ?? axis,
    valueLabel: a?.values.find((v) => v.key === value)?.label ?? value,
  };
}

export default async function GenomePage() {
  const { client } = await requireClient();

  const [findings, codedCount, totalCount] = await Promise.all([
    genomeForClient(client.id),
    prisma.creative.count({ where: { clientId: client.id, codedAt: { not: null } } }),
    prisma.creative.count({ where: { clientId: client.id } }),
  ]);

  const decisive = findings.filter((f) => f.described.decisive);
  const byStage = {
    CLICK: findings.filter((f) => f.stage === "CLICK"),
    LEAD: findings.filter((f) => f.stage === "LEAD"),
  };

  const STAGE_META = [
    {
      key: "CLICK" as const,
      icon: MousePointerClick,
      title: "Getting the click",
      blurb: "Hook, visual and pacing can only act on whether somebody stops. Measured against click-through.",
    },
    {
      key: "LEAD" as const,
      icon: UserCheck,
      title: "Turning a click into a lead",
      blurb: "Offer, proof and call-to-action can only act after the click. Measured against click-to-lead.",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <div className="hud-label">Creative genome</div>
        <h1 className="mt-1 font-heading text-3xl font-bold">
          What the whole book has learned about ads
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Every advertiser here runs creative coded against the same vocabulary, so a device tested
          in one account becomes evidence for everybody — pooled nightly, never below{" "}
          {MIN_ACCOUNTS} independent accounts, and always quoted with its range. Where your own
          results disagree with the book, this page says so and sides with you.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="hud-label">Findings in the book</div>
          <div className="hud-value mt-1 text-3xl font-bold">{findings.length}</div>
        </Card>
        <Card>
          <div className="hud-label">Decisive</div>
          <div className="hud-value mt-1 text-3xl font-bold text-cyan">{decisive.length}</div>
        </Card>
        <Card>
          <div className="hud-label">Your creatives coded</div>
          <div className="hud-value mt-1 text-3xl font-bold">
            {codedCount}
            {totalCount > codedCount && (
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                / {totalCount}
              </span>
            )}
          </div>
        </Card>
      </div>

      {findings.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            The book is still gathering evidence. Nothing is stated until at least {MIN_ACCOUNTS}{" "}
            independent accounts have run the same creative device against an alternative — a young
            genome is nearly empty on purpose, because a table of findings without the accounts to
            back them would be actioned by somebody.
          </p>
        </Card>
      ) : (
        STAGE_META.map((stage) => {
          const rows = byStage[stage.key];
          if (rows.length === 0) return null;
          const Icon = stage.icon;
          return (
            <div key={stage.key}>
              <div className="mb-1 flex items-center gap-2">
                <h2 className="flex items-center gap-2 font-heading text-xl font-bold">
                  <Icon className="h-5 w-5 text-cyan" /> {stage.title}
                </h2>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">{stage.blurb}</p>

              <div className="space-y-3">
                {rows.map((f) => {
                  const { axisLabel, valueLabel } = labelsFor(f.axis, f.value);
                  return (
                    <div key={`${f.axis}:${f.value}`} className="hud-panel p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Dna className="h-3.5 w-3.5 shrink-0 text-cyan" />
                        <span className="hud-label">
                          {axisLabel} · {valueLabel}
                        </span>
                        {f.described.decisive ? (
                          <Badge variant={f.described.direction === "up" ? "success" : "muted"}>
                            {f.described.direction === "up" ? "works" : "hurts"}
                          </Badge>
                        ) : (
                          <Badge variant="muted">no detectable difference</Badge>
                        )}
                        {f.divergent && <Badge variant="muted">your data disagrees</Badge>}
                        <span className="ml-auto font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground">
                          {f.pooled.k} accounts
                        </span>
                      </div>

                      <p className="mt-1.5 text-sm">{f.clientSentence}</p>

                      {f.own && (
                        <div className="mt-2 flex items-center gap-3">
                          <div className="h-1 w-28 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full bg-cyan"
                              style={{ width: `${Math.round(f.own.ownWeight * 100)}%` }}
                            />
                          </div>
                          <span className="font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground">
                            {Math.round(f.own.ownWeight * 100)}% of this read is your own data
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      <Card>
        <p className="text-xs text-muted-foreground">
          These are associations from observed spend across many advertisers, not controlled tests
          — creatives are never randomly assigned, so nothing here says &ldquo;causes.&rdquo; Your
          copywriter reads this book before every draft, with your own divergences overriding it
          where they have earned it. No other advertiser&apos;s identity or numbers are visible
          here, and yours are not visible to them.
        </p>
      </Card>
    </div>
  );
}
