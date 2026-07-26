"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ManageBillingButton() {
  const [loading, setLoading] = React.useState(false);
  async function open() {
    setLoading(true);
    try {
      const res = await fetch("/api/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) window.location.href = data.url;
      else alert(data.error ?? "Unable to open billing portal.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <Button onClick={open} disabled={loading} variant="outline">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Manage billing"}
    </Button>
  );
}

export function CheckoutButton({ planKey, label, highlight }: { planKey: string; label: string; highlight?: boolean }) {
  const [loading, setLoading] = React.useState(false);
  async function go() {
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planKey }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) window.location.href = data.url;
      else alert(data.error ?? "Could not start checkout. Configure Stripe first.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <Button onClick={go} disabled={loading} size="sm" variant={highlight ? "default" : "outline"} className="w-full">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : label}
    </Button>
  );
}
