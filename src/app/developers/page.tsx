import type { Metadata } from "next";
import Link from "next/link";
import { Plug, ShieldCheck, RefreshCw, EyeOff } from "lucide-react";
import {
  EVENT_CATALOGUE,
  EVENT_VERSION,
  MAX_ATTEMPTS,
  backoffSchedule,
  retryWindowHours,
} from "@/lib/events";
import { CONNECTORS } from "@/lib/connectors";
import { VERIFY_NODE, VERIFY_PY, sampleEnvelope } from "@/lib/event-docs";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BRAND } from "@/lib/brand";

/**
 * THE PUBLIC EVENT REFERENCE.
 *
 * Written for the person a client forwards this URL to — their developer, their
 * agency, whoever maintains the system that has to receive this. That is the
 * whole reason it is public and crawlable rather than living behind the console
 * login: an integration reference nobody can open without an account is one that
 * gets replaced by a support email.
 *
 * The catalogue and the retry schedule are read from the same modules the
 * delivery code uses, so this page cannot drift from what actually gets sent.
 * A docs page that lies is worse than no docs page — somebody builds against it.
 */

export const metadata: Metadata = {
  title: `Event reference — ${BRAND.name}`,
  description:
    "Every event the phone operator emits, the signature scheme, the retry schedule, and how to verify a request. Public reference for anybody building a receiver.",
  alternates: { canonical: "/developers" },
};

export default function DevelopersPage() {
  return (
    <div className="container max-w-4xl space-y-8 py-14">
      <header>
        <Badge className="border-cyan/40 text-cyan">Public reference · v{EVENT_VERSION}</Badge>
        <h1 className="mt-3 flex items-center gap-2.5 text-3xl font-bold tracking-tight">
          <Plug className="h-6 w-6 text-cyan" />
          Events
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Everything the phone operator does — calls it finishes, estimates a human releases,
          visits it books — is published as a signed event stream. If you can receive an HTTP POST,
          you can build against this. Nothing here needs an account to read.
        </p>
      </header>

      {/* ------------------------------------------------------------------ */}
      <Card className="p-6">
        <CardTitle className="text-lg">The envelope</CardTitle>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Every event has the same five fields around a <code className="text-foreground">data</code>{" "}
          object whose shape depends on <code className="text-foreground">type</code>. We add fields;
          we do not remove them. Anything you build against this keeps working — the{" "}
          <code className="text-foreground">version</code> only moves for a breaking change.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-background/60 p-4 font-mono text-xs leading-relaxed">
          {sampleEnvelope(EVENT_VERSION)}
        </pre>
      </Card>

      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <ShieldCheck className="h-5 w-5 text-cyan" />
          <CardTitle className="mt-2.5 text-base">Signed</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            <code className="text-foreground">X-Phx-Signature</code> carries{" "}
            <code className="text-foreground">t=&lt;unix&gt;,v1=&lt;hmac&gt;</code> — HMAC-SHA256
            over <code className="text-foreground">{"`${t}.${rawBody}`"}</code>. Same scheme as
            Stripe, so you have almost certainly written this function before.
          </p>
        </Card>
        <Card className="p-5">
          <RefreshCw className="h-5 w-5 text-cyan" />
          <CardTitle className="mt-2.5 text-base">Retried</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {MAX_ATTEMPTS} attempts over about {retryWindowHours()} hours:{" "}
            {backoffSchedule()[0]}, then {backoffSchedule().slice(1).join(", ")}. Any 2xx means delivered. A 4xx other than 408 or
            429 is taken as a refusal and never retried.
          </p>
        </Card>
        <Card className="p-5">
          <EyeOff className="h-5 w-5 text-cyan" />
          <CardTitle className="mt-2.5 text-base">Scrubbed</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Card and bank numbers, government ids and anything key-named like a secret are stripped
            before the request leaves — including out of what a caller said on the phone. Call
            transcripts are never sent at all.
          </p>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      <Card className="p-6">
        <CardTitle className="text-lg">Verifying a request</CardTitle>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Sign the <em>raw</em> body, before any JSON parsing — re-serialising changes the bytes and
          the signature will not match. Compare in constant time, and reject anything with a
          timestamp more than five minutes old.
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Node
            </p>
            <pre className="overflow-x-auto rounded-lg border border-border bg-background/60 p-4 font-mono text-xs leading-relaxed">
              {VERIFY_NODE}
            </pre>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Python
            </p>
            <pre className="overflow-x-auto rounded-lg border border-border bg-background/60 p-4 font-mono text-xs leading-relaxed">
              {VERIFY_PY}
            </pre>
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      <Card className="p-6">
        <CardTitle className="text-lg">Handling duplicates</CardTitle>
        <p className="mt-1.5 text-sm text-muted-foreground">
          You will receive the same event twice eventually — that is what retries mean, and a
          receiver that answered slowly may have answered after we gave up waiting. Every event
          carries a stable <code className="text-foreground">id</code>: the same real occurrence
          always produces the same one, forever. Store it, and drop anything you have already seen.
          It is also on the <code className="text-foreground">X-Phx-Event-Id</code> header, so you
          can deduplicate before parsing a body.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Answer fast — under a few seconds. Queue the work on your side rather than doing it inline;
          we time out at eight seconds and treat that as a failure worth retrying.
        </p>
      </Card>

      {/* ------------------------------------------------------------------ */}
      <Card className="p-6">
        <CardTitle className="text-lg">The catalogue</CardTitle>
        <p className="mt-1.5 text-sm text-muted-foreground">
          A client chooses which of these they send you. These are the fields you can rely on inside{" "}
          <code className="text-foreground">data</code>.
        </p>
        <div className="mt-4 space-y-4">
          {EVENT_CATALOGUE.map((e) => (
            <div key={e.type} className="border-t border-border pt-4 first:border-0 first:pt-0">
              <div className="flex flex-wrap items-baseline gap-2.5">
                <code className="font-mono text-sm text-cyan">{e.type}</code>
                <span className="text-sm font-medium">{e.label}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{e.when}</p>
              <p className="mt-1.5 font-mono text-xs text-muted-foreground">{e.fields.join(" · ")}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      <Card className="p-6">
        <CardTitle className="text-lg">If you would rather not write code</CardTitle>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Most businesses do not need to. The same stream drives these, and they are set up from the
          Connections screen in a couple of minutes.
        </p>
        <div className="mt-4 space-y-3">
          {CONNECTORS.filter((c) => c.id !== "webhook").map((c) => (
            <div key={c.id} className="border-t border-border pt-3 first:border-0 first:pt-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-medium">{c.name}</span>
                {!c.verified && <Badge className="border-gold/40 text-gold">Unverified</Badge>}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{c.tagline}</p>
              {!c.verified && c.unverifiedNote && (
                <p className="mt-1 text-xs text-gold">{c.unverifiedNote}</p>
              )}
            </div>
          ))}
        </div>
      </Card>

      <p className="text-sm text-muted-foreground">
        Connect one from the{" "}
        <Link href="/app/connections" className="text-cyan hover:underline">
          Connections screen
        </Link>
        . Your signing secret is shown once, when you create the connection.
      </p>
    </div>
  );
}
