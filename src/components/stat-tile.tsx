import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  sub,
  accent = "cyan",
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "cyan" | "violet" | "magenta";
}) {
  const ring =
    accent === "violet" ? "before:bg-secondary" : accent === "magenta" ? "before:bg-accent" : "before:bg-cyan";
  return (
    <div className={cn("hud-panel relative overflow-hidden p-5", "before:absolute before:left-0 before:top-0 before:h-full before:w-1", ring)}>
      <div className="hud-label">{label}</div>
      <div className="hud-value mt-2 text-3xl font-bold">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
