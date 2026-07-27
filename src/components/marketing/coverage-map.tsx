import { OPERATORS, MANIFEST, AUTOMATION_LOOPS, UPGRADES } from "@/lib/upgrades";
import { cn } from "@/lib/utils";

/**
 * The coverage map.
 *
 * DIRECTION
 *   The argument of this entire site is one sentence long — "PHX/GROWTH covers
 *   almost everything, and here is the little that's left" — and it was being
 *   made with three text lists and a paragraph. That is a picture's job.
 *
 *   Twenty-six filled cells for what the crew, the Manifest and the loops
 *   already handle, then five lit ones for what nobody does. The ratio is the
 *   point: a visitor should be able to squint and see that we are claiming
 *   very little territory, before reading a single word. It is also the most
 *   honest possible layout, because the covered cells outnumber ours five to
 *   one and the design refuses to hide that.
 *
 * BLUEPRINTS
 *   Every cell is derived from the same data the additive tests read, so the
 *   picture cannot drift from the rules. Pure server component — no JS ships
 *   for any of it.
 */

interface Cell {
  label: string;
  band: "crew" | "desk" | "loops";
}

const COVERED: Cell[] = [
  ...OPERATORS.map((o) => ({ label: o.name, band: "crew" as const })),
  ...MANIFEST.map((m) => ({ label: m.title, band: "desk" as const })),
  ...AUTOMATION_LOOPS.map((l) => ({ label: l.name, band: "loops" as const })),
];

const BAND_STYLE: Record<Cell["band"], string> = {
  crew: "border-violet/20 bg-violet/[0.045]",
  desk: "border-cyan/20 bg-cyan/[0.045]",
  loops: "border-signal/20 bg-signal/[0.045]",
};

const LEGEND: { band: Cell["band"]; label: string; dot: string }[] = [
  { band: "crew", label: "The crew", dot: "bg-violet" },
  { band: "desk", label: "The Manifest", dot: "bg-cyan" },
  { band: "loops", label: "Standing loops", dot: "bg-signal" },
];

export function CoverageMap() {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2">
        {LEGEND.map((l) => (
          <span key={l.band} className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-sm", l.dot, "opacity-40")} />
            <span className="eyebrow text-[0.58rem] text-muted-foreground">{l.label}</span>
          </span>
        ))}
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-sm bg-gold shadow-[0_0_10px_2px_hsl(var(--hud-gold)/0.55)]" />
          <span className="eyebrow text-[0.58rem] text-gold">Nobody&apos;s job</span>
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
        {COVERED.map((c) => (
          <div
            key={`${c.band}-${c.label}`}
            title={c.label}
            className={cn(
              "flex min-h-[3.75rem] items-center rounded-lg border px-2.5 py-2",
              BAND_STYLE[c.band],
            )}
          >
            <span className="line-clamp-3 text-[0.62rem] leading-tight text-muted-foreground/70">
              {c.label}
            </span>
          </div>
        ))}

        {/* The gaps. Same grid, same size — they simply glow, because the
            claim is that they are few, not that they are bigger. */}
        {UPGRADES.map((u) => (
          <div
            key={u.key}
            title={u.name}
            className="flex min-h-[3.75rem] items-center rounded-lg border border-gold/50 bg-gold/[0.09] px-2.5 py-2 shadow-[0_0_22px_-6px_hsl(var(--hud-gold)/0.6)]"
          >
            <span className="line-clamp-3 text-[0.62rem] font-semibold leading-tight text-gold">
              {u.name}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-5 text-sm text-muted-foreground">
        <span className="text-foreground">{COVERED.length} covered.</span>{" "}
        <span className="text-gold">{UPGRADES.length} not.</span> That ratio is the whole pitch —
        and seven more were cut from this page once we read what the crew already does.
      </p>
    </div>
  );
}
