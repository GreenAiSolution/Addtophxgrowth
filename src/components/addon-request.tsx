import { revalidatePath } from "next/cache";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/tenancy";
import { ADDONS, ADDON_GROUPS, addonsByGroup, type AddonGroupKey } from "@/lib/addons";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * In-console add-on menu. Requesting one files a Request into the agency's
 * queue rather than charging a card — for five-figure engagements a
 * conversation converts better than a checkout button, and it lets the ad-ops
 * lead scope the work before anyone is billed.
 */

const GROUP_ORDER: AddonGroupKey[] = ["foundations", "growth", "capacity"];

async function requestAddon(formData: FormData) {
  "use server";
  const { client } = await requireClient();
  const key = String(formData.get("addonKey") ?? "");
  const addon = ADDONS.find((a) => a.key === key);
  if (!addon) return;

  const price =
    addon.billing === "monthly"
      ? `${formatCurrency(addon.price)}/mo`
      : `${formatCurrency(addon.price)} one-time`;

  await prisma.request.create({
    data: {
      clientId: client.id,
      kind: "OTHER",
      title: `Add-on request: ${addon.name}`,
      body: [
        `${client.businessName} would like to add ${addon.name} (${price}).`,
        "",
        addon.blurb,
        "",
        "Includes:",
        ...addon.includes.map((i) => `• ${i}`),
      ].join("\n"),
    },
  });

  console.info(`[notify] Add-on request: ${addon.name} from client ${client.id}`);
  revalidatePath("/app/billing");
  revalidatePath("/app/requests");
}

export async function AddonMenu() {
  const { client } = await requireClient();

  // Don't re-offer something already in flight.
  const pending = await prisma.request.findMany({
    where: {
      clientId: client.id,
      status: { not: "DELIVERED" },
      title: { startsWith: "Add-on request:" },
    },
    select: { title: true },
  });
  const pendingNames = new Set(pending.map((r) => r.title.replace("Add-on request: ", "")));

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-heading text-lg font-semibold">Pairings</h2>
        <p className="text-sm text-muted-foreground">
          Add a service to your membership. Your ad-ops lead scopes it and confirms before anything
          is billed.
        </p>
      </div>

      <div className="space-y-6">
        {GROUP_ORDER.map((group) => (
          <div key={group}>
            <div className="hud-label mb-2 border-b border-border/60 pb-1.5">
              {ADDON_GROUPS[group].label}
            </div>
            <div className="space-y-2">
              {addonsByGroup(group).map((addon) => {
                const requested = pendingNames.has(addon.name);
                return (
                  <div
                    key={addon.key}
                    className="hud-panel flex flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{addon.name}</span>
                        {addon.mostPaired && <Badge variant="violet">Most paired</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{addon.blurb}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="hud-value whitespace-nowrap text-sm font-bold">
                        {formatCurrency(addon.price)}
                        <span className="font-normal text-muted-foreground">
                          {addon.billing === "monthly" ? "/mo" : " once"}
                        </span>
                      </span>
                      {requested ? (
                        <span className="whitespace-nowrap font-mono text-[0.6rem] uppercase tracking-widest text-amber-400">
                          Requested
                        </span>
                      ) : (
                        <form action={requestAddon}>
                          <input type="hidden" name="addonKey" value={addon.key} />
                          <button
                            type="submit"
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:border-cyan/60 hover:text-cyan"
                          >
                            <Plus className="h-3 w-3" /> Add
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
