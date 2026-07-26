export function HudLoader({ label = "Loading systems" }: { label?: string }) {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-cyan" />
          <div className="absolute inset-1.5 animate-spin rounded-full border-2 border-transparent border-b-secondary [animation-direction:reverse] [animation-duration:1.4s]" />
          <div className="absolute inset-0 grid place-items-center text-cyan">◈</div>
        </div>
        <span className="hud-label animate-pulse-glow">{label}…</span>
      </div>
    </div>
  );
}
