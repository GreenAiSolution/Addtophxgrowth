import { revalidatePath } from "next/cache";
import { Brain, TrendingUp, ShieldAlert, Coins, Radar } from "lucide-react";
import { requireClient } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { recordOutcome, refreshMemory, CONFIDENCE_FLOOR, MIN_EVIDENCE } from "@/lib/memory";
import { formatCurrency } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * System memory. The client sees everything the desk has concluded about their
 * business, where each conclusion came from, and can silence anything they
 * disagree with. A system that learns in the dark is one nobody trusts.
 */

const KIND_META: Record<string, { label: string; icon: typeof Brain }> = {
  CALIBRATION: { label: "Scoring calibration", icon: TrendingUp },
  OBJECTION: { label: "Why deals are lost", icon: ShieldAlert },
  SOURCE: { label: "Lead source quality", icon: Radar },
  VALUE: { label: "What a customer is worth", icon: Coins },
};

export default async function MemoryPage() {
  const { client } = await requireClient();

  const [entries, outcomes, recentLeads] = await Promise.all([
    prisma.memoryEntry.findMany({
      where: { clientId: client.id },
      orderBy: [{ confidence: "desc" }, { createdAt: "asc" }],
    }),
    prisma.dealOutcome.findMany({
      where: { clientId: client.id },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { lead: { select: { name: true, company: true } } },
    }),
    prisma.lead.findMany({
      where: { clientId: client.id, status: { in: ["SCORED", "WORKING", "NEW"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, name: true, company: true, score: true, tier: true },
    }),
  ]);

  const totalOutcomes = await prisma.dealOutcome.count({ where: { clientId: client.id } });
  const active = entries.filter((e) => !e.muted && e.confidence >= CONFIDENCE_FLOOR);

  async function logOutcome(formData: FormData) {
    "use server";
    const { client: c } = await requireClient();

    const outcome = String(formData.get("outcome") ?? "") === "WON" ? "WON" : "LOST";
    const rawValue = String(formData.get("value") ?? "").replace(/[^0-9.]/g, "");
    const valueCents = rawValue ? Math.round(Number(rawValue) * 100) : 0;
    const leadId = String(formData.get("leadId") ?? "") || null;
    const objection = String(formData.get("objection") ?? "") || null;
    const notes = String(formData.get("notes") ?? "") || null;

    await recordOutcome({
      clientId: c.id,
      leadId,
      outcome,
      valueCents: Number.isFinite(valueCents) ? valueCents : 0,
      objection: outcome === "LOST" ? objection : null,
      notes,
    });

    revalidatePath("/app/memory");
  }

  async function toggleMute(formData: FormData) {
    "use server";
    const { client: c } = await requireClient();
    const id = String(formData.get("id") ?? "");
    // Scoped read first — never mutate by id alone.
    const entry = await prisma.memoryEntry.findFirst({
      where: { id, clientId: c.id },
      select: { id: true, muted: true },
    });
    if (!entry) return;
    await prisma.memoryEntry.update({
      where: { id: entry.id },
      data: { muted: !entry.muted },
    });
    revalidatePath("/app/memory");
  }

  async function rebuild() {
    "use server";
    const { client: c } = await requireClient();
    await refreshMemory(c.id);
    revalidatePath("/app/memory");
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="hud-label">System memory</div>
        <h1 className="mt-1 font-heading text-3xl font-bold">What your desk has learned</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Every deal you close here feeds back into your agents. These aren&apos;t settings — they
          are conclusions drawn from your own results, and every agent reads them before it answers.
          Nothing is stated until at least {MIN_EVIDENCE} closed deals back it up.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="hud-label">Outcomes logged</div>
          <div className="hud-value mt-1 text-3xl font-bold">{totalOutcomes}</div>
        </Card>
        <Card>
          <div className="hud-label">Facts in play</div>
          <div className="hud-value mt-1 text-3xl font-bold text-cyan">{active.length}</div>
        </Card>
        <Card>
          <div className="hud-label">Agents informed</div>
          <div className="hud-value mt-1 text-3xl font-bold">
            {active.length > 0 ? "Every run" : "—"}
          </div>
        </Card>
      </div>

      {/* Learned facts */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-heading text-xl font-bold">
            <Brain className="h-5 w-5 text-cyan" /> Learned facts
          </h2>
          <form action={rebuild}>
            <Button type="submit" variant="ghost" size="sm">
              Rebuild from outcomes
            </Button>
          </form>
        </div>

        {entries.length === 0 ? (
          <Card>
            <p className="text-sm text-muted-foreground">
              Nothing learned yet. Log the outcome of {MIN_EVIDENCE} closed deals below and your
              agents start calibrating to what actually closes for you — not to a generic bar.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {entries.map((e) => {
              const meta = KIND_META[e.kind] ?? { label: e.kind, icon: Brain };
              const Icon = meta.icon;
              const belowFloor = e.confidence < CONFIDENCE_FLOOR;
              return (
                <div
                  key={e.id}
                  className={`hud-panel flex items-start justify-between gap-4 p-4 ${
                    e.muted ? "opacity-50" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-cyan" />
                      <span className="hud-label">{meta.label}</span>
                      {e.muted && <Badge variant="muted">muted</Badge>}
                      {belowFloor && !e.muted && <Badge variant="muted">gathering evidence</Badge>}
                    </div>
                    <p className="mt-1.5 text-sm">{e.content}</p>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="h-1 w-28 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-cyan"
                          style={{ width: `${Math.round(e.confidence * 100)}%` }}
                        />
                      </div>
                      <span className="font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground">
                        {Math.round(e.confidence * 100)}% confidence · {e.evidenceCount} deals
                      </span>
                    </div>
                  </div>
                  <form action={toggleMute} className="shrink-0">
                    <input type="hidden" name="id" value={e.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      {e.muted ? "Unmute" : "Mute"}
                    </Button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Log an outcome */}
      <Card>
        <CardTitle>Log a closed deal</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          This is the only maintenance the system asks of you, and it is what makes the agents
          yours rather than generic.
        </p>
        <form action={logOutcome} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="outcome">Outcome</Label>
            <select
              id="outcome"
              name="outcome"
              className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              defaultValue="WON"
            >
              <option value="WON">Won</option>
              <option value="LOST">Lost</option>
            </select>
          </div>
          <div>
            <Label htmlFor="value">Deal value (USD)</Label>
            <Input id="value" name="value" placeholder="12500" inputMode="decimal" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="leadId">Which lead?</Label>
            <select
              id="leadId"
              name="leadId"
              className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              defaultValue=""
            >
              <option value="">Not linked to a scored lead</option>
              {recentLeads.map((l) => (
                <option key={l.id} value={l.id}>
                  {[l.name, l.company].filter(Boolean).join(" — ") || "Unnamed lead"}
                  {l.score != null ? ` (scored ${l.score}${l.tier ? `, ${l.tier}` : ""})` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Linking a lead is what lets the system check whether its own scoring was right.
            </p>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="objection">If lost — what killed it?</Label>
            <Input id="objection" name="objection" placeholder="Too expensive" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" name="notes" rows={2} placeholder="Anything worth remembering…" />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit">Log outcome</Button>
          </div>
        </form>
      </Card>

      {/* Recent outcomes */}
      {outcomes.length > 0 && (
        <div>
          <h2 className="mb-3 font-heading text-xl font-bold">Recent outcomes</h2>
          <div className="hud-panel divide-y divide-border/40">
            {outcomes.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-4 p-3 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">
                    {[o.lead?.name, o.lead?.company].filter(Boolean).join(" — ") || "Unlinked deal"}
                  </span>
                  {o.objection && (
                    <span className="block text-xs text-muted-foreground">
                      Lost to: {o.objection}
                    </span>
                  )}
                  {o.scoreAtQualification != null && (
                    <span className="block font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground">
                      scored {o.scoreAtQualification} at intake
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {o.valueCents > 0 && (
                    <span className="hud-value text-sm">{formatCurrency(o.valueCents)}</span>
                  )}
                  <Badge variant={o.outcome === "WON" ? "success" : "muted"}>{o.outcome}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
