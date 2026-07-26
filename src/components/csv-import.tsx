"use client";

import * as React from "react";
import { Loader2, Upload, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface AccountOption {
  id: string;
  label: string;
}

/**
 * CSV upload widget for daily ad metrics. Expected header:
 *   date,spend,impressions,clicks,leads,conversions,revenue
 * (spend/revenue in dollars). Posts raw text to the import route.
 */
export function CsvImport({ accounts }: { accounts: AccountOption[] }) {
  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? "");
  const [file, setFile] = React.useState<File | null>(null);
  const [state, setState] = React.useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = React.useState<{ imported: number; errors: string[] } | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function upload() {
    if (!file || !accountId) return;
    setState("loading");
    setResult(null);
    try {
      const text = await file.text();
      const res = await fetch(`/api/admin/metrics/import?adAccountId=${encodeURIComponent(accountId)}`, {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: text,
      });
      if (!res.ok) {
        setState("error");
        return;
      }
      const data = (await res.json()) as { imported: number; errors: string[] };
      setResult(data);
      setState("done");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      setState("error");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="csv-account">Ad account</Label>
          <select
            id="csv-account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background/60 px-3 text-sm focus-visible:border-cyan/60 focus-visible:outline-none"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="csv-file">CSV file</Label>
          <input
            ref={inputRef}
            id="csv-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block h-10 w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-0.5 file:text-xs file:text-foreground"
          />
        </div>
      </div>

      <p className="font-mono text-[0.65rem] text-muted-foreground">
        header: date,spend,impressions,clicks,leads,conversions,revenue — spend/revenue in dollars
      </p>

      <div className="flex items-center gap-3">
        <Button onClick={upload} disabled={!file || !accountId || state === "loading"} size="sm">
          {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Upload className="h-4 w-4" /> Import CSV</>}
        </Button>

        {state === "done" && result && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> {result.imported} row{result.imported === 1 ? "" : "s"} imported
            {result.errors.length > 0 && `, ${result.errors.length} skipped`}
          </span>
        )}
        {state === "error" && (
          <span className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" /> Import failed
          </span>
        )}
      </div>

      {state === "done" && result && result.errors.length > 0 && (
        <ul className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-amber-500/30 bg-amber-500/5 p-3 font-mono text-xs text-amber-300">
          {result.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
