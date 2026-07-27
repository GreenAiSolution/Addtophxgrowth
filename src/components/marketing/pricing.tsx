"use client";

import * as React from "react";
import { Check, Loader2, Wrench } from "lucide-react";
import { PLANS, PRODUCT_LINES, type ProductLineKey } from "@/lib/catalog";
import { formatCurrency, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const LINE_ORDER: ProductLineKey[] = ["AI_AGENTS", "AD_OPS"];

export function Pricing() {
  const [loading, setLoading] = React.useState<string | null>(null);

  async function choose(planKey: string) {
    setLoading(planKey);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planKey }),
      });
      if (res.status === 401) {
        window.location.href = `/login?plan=${planKey}`;
        return;
      }
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) window.location.href = data.url;
      else alert(data.error ?? "Could not start checkout. Configure Stripe keys first.");
    } catch {
      window.location.href = `/login?plan=${planKey}`;
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-16">
      {LINE_ORDER.map((line) => (
        <div key={line}>
          <div className="mb-8 text-center">
            <Badge variant={line === "AI_AGENTS" ? "default" : "violet"}>
              {line === "AI_AGENTS" ? "Product Line 01" : "Product Line 02"}
            </Badge>
            <h3 className="mt-3 font-heading text-2xl font-bold">{PRODUCT_LINES[line].name}</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
              {PRODUCT_LINES[line].blurb}
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {PLANS.filter((p) => p.line === line).map((plan) => (
              <div
                key={plan.key}
                className={cn(
                  "hud-panel hud-corners flex flex-col p-6",
                  plan.highlight && "ring-1 ring-cyan/40 shadow-hud",
                )}
              >
                {plan.highlight && (
                  <div className="mb-3">
                    <Badge>Most popular</Badge>
                  </div>
                )}
                <h4 className="font-heading text-xl font-bold">{plan.name}</h4>
                <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="hud-value text-3xl font-bold">
                    {formatCurrency(plan.priceMonthly)}
                  </span>
                  <span className="text-sm text-muted-foreground">/mo</span>
                </div>
                {plan.setupFee ? (
                  <div className="mt-2 flex items-center gap-1.5 rounded-md border border-violet/30 bg-secondary/10 px-2.5 py-1.5">
                    <Wrench className="h-3.5 w-3.5 shrink-0 text-secondary" />
                    <span className="font-mono text-[0.68rem] leading-tight text-secondary">
                      + {formatCurrency(plan.setupFee)} one-time build
                    </span>
                  </div>
                ) : null}
                <ul className="mt-5 flex-1 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-6 w-full"
                  variant={plan.highlight ? "default" : "outline"}
                  onClick={() => choose(plan.key)}
                  disabled={loading === plan.key}
                >
                  {loading === plan.key ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Choose " + plan.name
                  )}
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
