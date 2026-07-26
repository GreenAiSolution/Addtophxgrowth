"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="grid min-h-[70vh] place-items-center px-4">
      <div className="hud-panel hud-corners max-w-md p-10 text-center">
        <div className="hud-label text-destructive">System fault</div>
        <h1 className="mt-3 font-heading text-xl font-bold">Something tripped a breaker</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The error has been logged{error.digest ? ` (ref ${error.digest})` : ""}. Try again — if it
          persists, file a request and the crew will look into it.
        </p>
        <div className="mt-6">
          <Button onClick={reset} size="sm">Retry</Button>
        </div>
      </div>
    </div>
  );
}
