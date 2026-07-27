import { PenLine, FlaskConical, Radar, RefreshCw, Factory, ArrowRight } from "lucide-react";
import { CREATIVE_STAGES, CREATIVE_THESIS, stageSourceLabel } from "@/lib/creative";
import { planByKey } from "@/lib/catalog";
import { Badge } from "@/components/ui/badge";

/**
 * The creative loop, rendered as a loop.
 *
 * Deliberately not a feature grid. Each stage hands to the next and the last
 * feeds the first — that circularity *is* the pitch, because it's what
 * separates "we'll make you some ads" from "you will never again be caught
 * without a fresh one". Server component; this is all static.
 */

const STAGE_ICONS = [PenLine, FlaskConical, Radar, RefreshCw, Factory];

export function CreativeEngine() {
  return (
    <div className="space-y-10">
      {/* The argument */}
      <div className="hud-panel hud-corners mx-auto max-w-3xl p-7 text-center">
        <h3 className="font-heading text-2xl font-bold md:text-3xl">
          {CREATIVE_THESIS.headline}
        </h3>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {CREATIVE_THESIS.body}
        </p>
      </div>

      {/* The loop */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        {CREATIVE_STAGES.map((stage, i) => {
          const Icon = STAGE_ICONS[i] ?? PenLine;
          const label = stageSourceLabel(stage);
          const plan = planByKey(stage.availableFrom);
          const isLast = i === CREATIVE_STAGES.length - 1;

          return (
            <div key={stage.key} className="hud-panel relative flex flex-col p-5">
              <div className="flex items-center justify-between">
                <span className="hud-value text-xs text-cyan/60">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Icon className="h-4 w-4 text-cyan" />
              </div>

              <h4 className="mt-2 font-heading text-lg font-bold">{stage.name}</h4>
              <p className="mt-1.5 text-xs leading-relaxed text-foreground/90">{stage.promise}</p>
              <p className="mt-2.5 flex-1 text-[0.7rem] leading-relaxed text-muted-foreground">
                {stage.rationale}
              </p>

              <div className="mt-4 border-t border-border/50 pt-3">
                {label && <div className="hud-label">{label}</div>}
                {plan && (
                  <div className="mt-1 font-mono text-[0.6rem] uppercase tracking-widest text-secondary">
                    from {plan.name}
                  </div>
                )}
              </div>

              {/* The connector that makes it read as a loop, not a list. */}
              {!isLast && (
                <ArrowRight
                  aria-hidden
                  className="absolute -right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-cyan/40 lg:block"
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mx-auto max-w-2xl text-center">
        <Badge variant="magenta">And then it starts again</Badge>
        <p className="mt-3 text-sm text-muted-foreground">
          The queue refills while the current ad is still working, so the day it dies the
          replacement is already written, already tested, already approved. Most accounts stall
          because nothing was ready — not because nobody had ideas.
        </p>
      </div>
    </div>
  );
}
