"use client";

import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ReportGenerator() {
  const [loading, setLoading] = React.useState(false);
  const [narrative, setNarrative] = React.useState<string | null>(null);
  const [ai, setAi] = React.useState(false);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/reports/generate", { method: "POST" });
      const data = (await res.json()) as { narrative?: string; ai?: boolean; error?: string };
      setNarrative(data.narrative ?? data.error ?? "No narrative available.");
      setAi(Boolean(data.ai));
    } catch {
      setNarrative("Could not reach the report service.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-cyan" />
          <span className="font-heading font-semibold">Executive narrative</span>
          {narrative && <Badge variant={ai ? "default" : "muted"}>{ai ? "AI-generated" : "Auto summary"}</Badge>}
        </div>
        <Button onClick={generate} disabled={loading} size="sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : narrative ? "Regenerate" : "Generate"}
        </Button>
      </div>
      {narrative ? (
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{narrative}</p>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Generate an AI-written summary of this month&apos;s performance for your stakeholders.
        </p>
      )}
    </Card>
  );
}
