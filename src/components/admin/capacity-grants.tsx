import { revalidatePath } from "next/cache";
import { Gauge, Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/tenancy";
import { ADDONS } from "@/lib/addons";
import { AGENTS } from "@/lib/agents";
import { CAPACITY_KEYS, describeGrant } from "@/lib/capacity";
import { formatCurrency } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Granting a capacity add-on.
 *
 * Add-ons are requested in the console and scoped in a conversation rather than
 * charged at a button — so the last mile has always been an agency action. This
 * is that action: once the add-on is agreed and billed, an admin grants it here
 * and the client's meter moves immediately.
 *
 * Every write re-reads the target row scoped to the client id it was handed;
 * an admin form is still a form, and ids in hidden fields are still untrusted.
 */

const CAPACITY_ADDONS = ADDONS.filter((a) => CAPACITY_KEYS.includes(a.key));

export async function CapacityGrants({ clientId }: { clientId: string }) {
  const grants = await prisma.clientEntitlement.findMany({
    where: { clientId },
    orderBy: { grantedAt: "desc" },
  });

  async function grantCapacity(formData: FormData) {
    "use server";
    const actor = await requireAdmin();

    const addonKey = String(formData.get("addonKey") ?? "");
    if (!CAPACITY_KEYS.includes(addonKey)) return;

    const targetId = String(formData.get("clientId") ?? "");
    const client = await prisma.clientProfile.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (!client) return;

    const quantity = Math.max(1, Math.min(50, Number(formData.get("quantity") ?? 1) || 1));
    const rawSlug = String(formData.get("agentSlug") ?? "");
    const agentSlug =
      addonKey === "extra-agent" && AGENTS.some((a) => a.slug === rawSlug) ? rawSlug : null;
    const note = String(formData.get("note") ?? "").trim() || null;

    await prisma.clientEntitlement.create({
      data: { clientId: client.id, addonKey, quantity, agentSlug, note, grantedBy: actor.userId },
    });

    revalidatePath(`/admin/clients/${client.id}`);
  }

  async function revokeCapacity(formData: FormData) {
    "use server";
    await requireAdmin();
    const id = String(formData.get("id") ?? "");
    const targetId = String(formData.get("clientId") ?? "");
    const row = await prisma.clientEntitlement.findFirst({
      where: { id, clientId: targetId },
      select: { id: true, clientId: true },
    });
    if (!row) return;
    await prisma.clientEntitlement.delete({ where: { id: row.id } });
    revalidatePath(`/admin/clients/${row.clientId}`);
  }

  return (
    <Card>
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-cyan" />
        <CardTitle>Capacity add-ons</CardTitle>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Granting one here moves this client&apos;s meter immediately. Grant it after the add-on has
        been agreed and billed — nothing on this page charges a card.
      </p>

      {grants.length > 0 ? (
        <ul className="mt-4 divide-y divide-border/40">
          {grants.map((g) => (
            <li key={g.id} className="flex items-start justify-between gap-4 py-2.5">
              <div className="min-w-0">
                <div className="text-sm">{describeGrant(g)}</div>
                <div className="hud-label mt-0.5">
                  granted {g.grantedAt.toISOString().slice(0, 10)}
                  {g.expiresAt ? ` · expires ${g.expiresAt.toISOString().slice(0, 10)}` : ""}
                </div>
                {g.note && <div className="mt-0.5 text-xs text-muted-foreground">{g.note}</div>}
              </div>
              <form action={revokeCapacity} className="shrink-0">
                <input type="hidden" name="id" value={g.id} />
                <input type="hidden" name="clientId" value={clientId} />
                <Button type="submit" variant="ghost" size="sm">
                  <Trash2 className="h-3.5 w-3.5" /> Revoke
                </Button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
          No capacity add-ons granted. This client is on their plan&apos;s limits exactly.
        </p>
      )}

      <form action={grantCapacity} className="mt-5 grid gap-3 border-t border-border/50 pt-4 sm:grid-cols-2">
        <input type="hidden" name="clientId" value={clientId} />
        <div>
          <Label htmlFor="addonKey">Add-on</Label>
          <select
            id="addonKey"
            name="addonKey"
            className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
            defaultValue={CAPACITY_ADDONS[0]?.key}
          >
            {CAPACITY_ADDONS.map((a) => (
              <option key={a.key} value={a.key}>
                {a.name} — {formatCurrency(a.price)}/mo
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="quantity">Quantity</Label>
          <Input id="quantity" name="quantity" type="number" min={1} max={50} defaultValue={1} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="agentSlug">Which agent (Additional Agent only)</Label>
          <select
            id="agentSlug"
            name="agentSlug"
            className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
            defaultValue=""
          >
            <option value="">Not applicable / decide later</option>
            {AGENTS.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.name} ({a.persona})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            An Additional Agent grant with no agent named raises the seat count but unlocks nobody —
            the client will still hit a locked agent.
          </p>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="note">Note (invoice ref, who agreed it)</Label>
          <Input id="note" name="note" placeholder="Agreed on 12 Aug call — inv #1043" />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm">
            Grant capacity
          </Button>
        </div>
      </form>

      {grants.length > 0 && (
        <div className="mt-4">
          <Badge variant="success">Meter updated live</Badge>
        </div>
      )}
    </Card>
  );
}
