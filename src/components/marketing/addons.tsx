import Link from "next/link";
import { Plus, Sparkles, ArrowUpRight } from "lucide-react";
import {
  ADDONS,
  ADDON_BUNDLE,
  ADDON_GROUPS,
  ADDON_GROUP_ORDER,
  addonsByGroup,
  bundleListPrice,
  type AddonDef,
} from "@/lib/addons";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * Menu-style add-on list. Rendered entirely server-side — the disclosures are
 * native <details>, so the whole section ships zero JavaScript.
 */

function priceLabel(addon: AddonDef) {
  return addon.billing === "monthly" ? (
    <>
      {formatCurrency(addon.price)}
      <span className="text-xs font-normal text-muted-foreground">/mo</span>
    </>
  ) : (
    <>
      {formatCurrency(addon.price)}
      <span className="text-xs font-normal text-muted-foreground"> once</span>
    </>
  );
}

function AddonRow({ addon }: { addon: AddonDef }) {
  return (
    <details className="group border-b border-border/40 last:border-0 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-start gap-4 px-1 py-5 transition-colors hover:bg-muted/20">
        <Plus className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-45 group-hover:text-cyan" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-heading text-base font-semibold">{addon.name}</span>
            {addon.mostPaired && <Badge variant="violet">Most paired</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{addon.blurb}</p>
        </div>
        <div className="hud-value shrink-0 pt-0.5 text-right text-base font-bold">
          {priceLabel(addon)}
        </div>
      </summary>
      <div className="pb-5 pl-9 pr-1">
        <ul className="space-y-1.5">
          {addon.includes.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-foreground/80">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-cyan" />
              {item}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="hud-label">Pairs with {addon.pairsWith}</p>
          <Link
            href={`/showroom/${addon.key}`}
            className="inline-flex items-center gap-1 font-mono text-[0.62rem] uppercase tracking-widest text-cyan hover:underline"
          >
            Full spec <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </details>
  );
}

export function Addons() {
  const listPrice = bundleListPrice();
  const saving = listPrice - ADDON_BUNDLE.price;
  const bundleParts = ADDON_BUNDLE.includes
    .map((key) => ADDONS.find((a) => a.key === key)?.name)
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto max-w-3xl">
      {ADDON_GROUP_ORDER.map((group) => (
        <div key={group} className="mb-12 last:mb-0">
          <div className="mb-1 flex items-baseline justify-between border-b border-cyan/20 pb-2">
            <h3 className="font-heading text-lg font-bold tracking-tight">
              {ADDON_GROUPS[group].label}
            </h3>
            <span className="hud-label">{ADDON_GROUPS[group].note}</span>
          </div>

          <div>
            {addonsByGroup(group).map((addon) => (
              <AddonRow key={addon.key} addon={addon} />
            ))}
          </div>

          {/* Bundle sits with the foundations it bundles. */}
          {group === "foundations" && (
            <Link
              href={`/showroom/${ADDON_BUNDLE.key}`}
              className="hud-panel lift mt-5 flex flex-wrap items-center justify-between gap-4 border-violet/30 bg-secondary/5 p-5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-secondary" />
                  <span className="font-heading text-base font-semibold">
                    {ADDON_BUNDLE.name}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{ADDON_BUNDLE.blurb}</p>
                <p className="hud-label mt-2">{bundleParts}</p>
              </div>
              <div className="text-right">
                <div className="hud-value text-2xl font-bold text-gradient">
                  {formatCurrency(ADDON_BUNDLE.price)}
                </div>
                <div className="font-mono text-[0.65rem] uppercase tracking-widest text-emerald-400">
                  save {formatCurrency(saving)}
                </div>
              </div>
            </Link>
          )}
        </div>
      ))}

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Add any of these from your console and your ad-ops lead folds it into the plan — no new
        contract, no new onboarding.
      </p>
    </div>
  );
}
