import { ArrowUpRight, Store, Building2 } from "lucide-react";
import { HOUSE, HOUSE_THESIS, divisionsFor, type HouseSide } from "@/lib/house";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * Two doors, side by side.
 *
 * The single most confusing thing a visitor can encounter is two websites from
 * the same company that appear to sell the same thing. This section answers it
 * before it's asked — and answers it with a division of actual jobs rather than
 * a slogan, because "we're the premium tier" tells nobody what to do.
 *
 * The allocation comes from `house.ts`, where one job has exactly one owner by
 * construction. Nothing here can claim a job the other side already owns.
 */

const SIDE_META: Record<HouseSide, { icon: typeof Store; accent: string; ring: string }> = {
  PARENT: { icon: Building2, accent: "text-violet", ring: "border-violet/30" },
  PLUS: { icon: Store, accent: "text-cyan", ring: "border-cyan/50" },
};

function Column({ side }: { side: HouseSide }) {
  const role = HOUSE[side];
  const meta = SIDE_META[side];
  const Icon = meta.icon;
  const isHere = role.url === null;

  return (
    <div className={cn("hud-panel flex flex-col p-7", meta.ring, isHere && "shadow-hud")}>
      <div className="flex items-center justify-between gap-3">
        <Icon className={cn("h-7 w-7", meta.accent)} />
        {isHere ? <Badge>You are here</Badge> : <Badge variant="violet">The front door</Badge>}
      </div>

      <span className="hud-label mt-5">{role.role}</span>
      <h3 className="mt-1 font-heading text-2xl font-bold">{role.name}</h3>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{role.purpose}</p>

      <div className="mt-6 border-t border-border/50 pt-5">
        <span className="hud-label">Come here to</span>
        <ul className="mt-3 space-y-3">
          {divisionsFor(side).map((d) => (
            <li key={d.job}>
              <span className="flex items-start gap-2 text-sm font-medium text-foreground/90">
                <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", isHere ? "bg-cyan" : "bg-violet")} />
                {d.job}
              </span>
              <span className="mt-1 block pl-3.5 text-[0.72rem] leading-relaxed text-muted-foreground">
                {d.because}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {role.url && (
        <a
          href={role.url}
          className="mt-6 inline-flex items-center gap-1.5 font-mono text-[0.68rem] uppercase tracking-widest text-violet transition-colors hover:text-foreground"
        >
          Go to {role.name} <ArrowUpRight className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

export function HouseDivision() {
  return (
    <div className="space-y-8">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-heading text-3xl font-bold md:text-4xl">{HOUSE_THESIS.headline}</h2>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{HOUSE_THESIS.body}</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Column side="PARENT" />
        <Column side="PLUS" />
      </div>
    </div>
  );
}
