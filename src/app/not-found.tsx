import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="hud-panel hud-corners max-w-md p-10 text-center">
        <div className="hud-value text-6xl font-bold text-gradient">404</div>
        <h1 className="mt-4 font-heading text-xl font-bold">Signal lost</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This coordinate doesn&apos;t exist on the flight map. Re-route to a known sector.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/">Home</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/app">Open cockpit</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
