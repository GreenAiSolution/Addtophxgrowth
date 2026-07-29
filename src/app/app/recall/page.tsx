import { Brain, Search, CircleAlert, TrendingUp, TrendingDown, Circle } from "lucide-react";
import { requireClient } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { provider, EMBEDDING_DIM } from "@/lib/embeddings";
import { recallSimilarLeads } from "@/lib/recall";
import { cn, formatCurrency } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * RECALL — "have we seen this before?"
 *
 * The screen the index exists for. Type what a caller said, and it returns the
 * leads that read like it, with what those actually did.
 *
 * WHAT THIS SCREEN REFUSES TO DO
 *   Imply the system understood anything it did not. When no embedding key is
 *   configured the search still runs and still returns real, relevant leads —
 *   by keyword — and the banner says exactly that rather than letting a word
 *   overlap pass for resemblance. Same posture as the enquiry form falling
 *   back to a mailto: work without the key, be loud about what is missing,
 *   never quietly serve a worse answer as though it were the real one.
 *
 *   And it declines to conclude. Below the evidence floor there is no verdict
 *   line at all — the counts are shown, the sentence is withheld.
 */

export const dynamic = "force-dynamic";

export default async function RecallPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const { client } = await requireClient();
  const query = (searchParams.q ?? "").trim();
  const p = provider();

  let indexed = 0;
  let result: Awaited<ReturnType<typeof recallSimilarLeads>> | null = null;
  let error: string | null = null;

  try {
    indexed = await prisma.embedding.count({ where: { clientId: client.id } });
    if (query) result = await recallSimilarLeads(client.id, query, { limit: 6 });
  } catch {
    error =
      "The index is not reachable. Nothing is lost — it is built from your leads and rebuilds " +
      "from them. Check /api/health for whether the database or the schema is the problem.";
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
          <Brain className="h-5 w-5 text-violet" />
          Recall
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          Paste what a caller said. This finds the leads that read like it and tells you what
          those ones actually did.
        </p>
      </header>

      {/* The honesty banner. Shown whenever the results are not semantic. */}
      {!p.semantic && (
        <Card className="border-gold/35 bg-gold/[0.04] p-5">
          <CardTitle className="flex items-center gap-2 text-base">
            <CircleAlert className="h-4 w-4 text-gold" />
            Keyword search only
          </CardTitle>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            No embedding key is configured, so this is matching words rather than meaning. It will
            find a lead that used the same terms and miss one that said the same thing differently.
            Set <code className="font-mono text-xs text-foreground">VOYAGE_API_KEY</code> to turn on
            semantic recall — Anthropic does not offer an embeddings API, so this uses Voyage.
          </p>
        </Card>
      )}

      <form className="flex flex-wrap gap-3" action="/app/recall">
        <Input
          name="q"
          defaultValue={query}
          placeholder="e.g. furnace stopped overnight, wants it done before the weekend, asked about financing"
          className="min-w-0 flex-1"
        />
        <Button type="submit">
          <Search className="mr-1.5 h-4 w-4" />
          Recall
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.72rem] text-muted-foreground">
        <span>
          <span className="font-mono tabular-nums text-foreground">{indexed}</span> chunks indexed
        </span>
        <span>
          model <span className="font-mono text-foreground">{p.model}</span>
        </span>
        <span>
          <span className="font-mono tabular-nums">{EMBEDDING_DIM}</span> dimensions
        </span>
        <span className={p.semantic ? "text-signal" : "text-gold"}>
          {p.semantic ? "semantic + keyword" : "keyword only"}
        </span>
      </div>

      {error && (
        <Card className="border-magenta/40 p-6">
          <CardTitle className="flex items-center gap-2">
            <CircleAlert className="h-4 w-4 text-magenta" />
            The index is unavailable
          </CardTitle>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{error}</p>
        </Card>
      )}

      {!error && query && result && (
        <>
          {/* The verdict, or its deliberate absence. */}
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="muted" className="border-signal/40 text-signal">
                {result.won} won
              </Badge>
              <Badge variant="muted" className="border-magenta/40 text-magenta">
                {result.lost} lost
              </Badge>
              <Badge variant="muted">{result.open} still open</Badge>
              {result.averageWonCents !== null && (
                <span className="font-mono text-sm tabular-nums text-muted-foreground">
                  avg won {formatCurrency(result.averageWonCents)}
                </span>
              )}
            </div>
            <p className="mt-3 text-[0.92rem] leading-relaxed">
              {result.verdict ?? (
                <span className="text-muted-foreground">
                  Not enough closed matches to draw a conclusion from. The list below is what was
                  found; the pattern is not yet a pattern.
                </span>
              )}
            </p>
          </Card>

          {result.precedents.length === 0 ? (
            <Card className="p-8">
              <CardTitle>Nothing like it yet</CardTitle>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                No indexed lead resembles this. That is the honest answer for a young index — it
                gets better every time a lead is scored and every time a deal closes.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {result.precedents.map((pr) => {
                const Icon =
                  pr.outcome === "WON" ? TrendingUp : pr.outcome === "LOST" ? TrendingDown : Circle;
                return (
                  <Card
                    key={pr.leadId}
                    className={cn(
                      "p-5",
                      pr.outcome === "WON" && "border-signal/25",
                      pr.outcome === "LOST" && "border-magenta/25",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Icon
                            className={cn(
                              "h-3.5 w-3.5",
                              pr.outcome === "WON" && "text-signal",
                              pr.outcome === "LOST" && "text-magenta",
                              pr.outcome === "OPEN" && "text-muted-foreground",
                            )}
                          />
                          <span className="font-semibold">
                            {pr.company ?? pr.name ?? "Unnamed lead"}
                          </span>
                          <span className="text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">
                            {pr.outcome}
                          </span>
                          {pr.valueCents ? (
                            <span className="font-mono text-[0.72rem] tabular-nums text-muted-foreground">
                              {formatCurrency(pr.valueCents)}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-[0.85rem] leading-relaxed text-muted-foreground">
                          {pr.content.slice(0, 400)}
                        </p>
                      </div>
                      {/* Why this was returned. A ranking a person cannot
                          interrogate is one they are right not to trust. */}
                      <div className="shrink-0 text-right">
                        <div className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">
                          {pr.score.toFixed(4)}
                        </div>
                        <div className="mt-1 flex flex-wrap justify-end gap-1">
                          {pr.via.map((v) => (
                            <Badge key={v} variant="muted" className="text-[0.6rem]">
                              {v}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {!error && !query && (
        <Card className="p-8">
          <CardTitle>Ask it something</CardTitle>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {indexed === 0
              ? "Nothing is indexed yet. Leads are indexed as they arrive and as they are scored — this fills up on its own."
              : "Describe a job, an objection, or what somebody said on the phone. The closer it is to how a real lead was written, the better this works."}
          </p>
        </Card>
      )}
    </div>
  );
}
