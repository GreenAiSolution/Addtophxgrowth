"use client";

import * as React from "react";
import { Loader2, Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function LeadForm() {
  const [state, setState] = React.useState<"idle" | "loading" | "done" | "error">("idle");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("loading");
    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="hud-panel flex flex-col items-center gap-3 p-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-cyan" />
        <h3 className="font-heading text-xl font-semibold">Transmission received.</h3>
        <p className="text-sm text-muted-foreground">
          Our team will reach out within one business day with a tailored growth plan.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="hud-panel space-y-4 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required placeholder="Alex Rivera" />
        </div>
        <div>
          <Label htmlFor="email">Work email</Label>
          <Input id="email" name="email" type="email" required placeholder="alex@company.com" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="company">Company</Label>
          <Input id="company" name="company" placeholder="Company, Inc." />
        </div>
        <div>
          <Label htmlFor="monthlyAdSpend">Monthly ad spend</Label>
          <Input id="monthlyAdSpend" name="monthlyAdSpend" placeholder="$10k–$50k" />
        </div>
      </div>
      <div>
        <Label htmlFor="message">What are you trying to grow?</Label>
        <Textarea id="message" name="message" placeholder="Tell us about your funnel and goals…" />
      </div>
      {state === "error" && (
        <p className="text-sm text-destructive">Something went wrong. Please try again.</p>
      )}
      <Button type="submit" className="w-full" disabled={state === "loading"}>
        {state === "loading" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            Request growth plan <Send className="h-4 w-4" />
          </>
        )}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        No spam. We pipe this straight to our team via Zapier + HubSpot.
      </p>
    </form>
  );
}
