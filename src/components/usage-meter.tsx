import { cn, formatNumber } from "@/lib/utils";

export function UsageMeter({
  used,
  limit,
  label = "Agent runs",
}: {
  used: number;
  limit: number | null;
  label?: string;
}) {
  const pct = limit == null ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const danger = limit != null && pct >= 90;
  const warn = limit != null && pct >= 70 && pct < 90;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="hud-label">{label}</span>
        <span className="hud-value text-sm">
          {formatNumber(used)}
          <span className="text-muted-foreground"> / {limit == null ? "∞" : formatNumber(limit)}</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            danger ? "bg-destructive" : warn ? "bg-amber-400" : "bg-gradient-to-r from-cyan to-violet",
          )}
          style={{ width: `${limit == null ? 8 : pct}%` }}
        />
      </div>
    </div>
  );
}
