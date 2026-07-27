import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Check, FileText, ShieldQuestion, Target, Zap } from "lucide-react";
import { VERTICAL_PACKS, verticalByKey } from "@/lib/verticals";
import { blueprintFor } from "@/lib/systems";
import { PLANS, planByKey } from "@/lib/catalog";
import { agentBySlug } from "@/lib/agents";
import { formatCurrency } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import { RobotAvatar } from "@/components/robot-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AgentAccent } from "@/lib/agents";

/**
 * One page per trade. Same system, same price — but a roofer lands on a page
 * that already knows what a claim job is, which is the entire point of the
 * vertical packs. These are static, so they're cheap to serve and rank.
 */

export function generateStaticParams() {
  return VERTICAL_PACKS.map((v) => ({ verticalKey: v.key }));
}

export function generateMetadata({
  params,
}: {
  params: { verticalKey: string };
}): Metadata {
  const pack = verticalByKey(params.verticalKey);
  if (!pack) return { title: "Not found" };
  return {
    title: `${pack.name} — ${BRAND.name}`,
    description: pack.promise,
    openGraph: { title: pack.name, description: pack.promise },
  };
}

const ASSET_LABELS: Record<string, string> = {
  "asset-voice-profile": "Brand Voice Profile",
  "asset-qualification-rubric": "Qualification Rubric",
  "asset-escalation-matrix": "Escalation Matrix",
};

export default function VerticalPage({ params }: { params: { verticalKey: string } }) {
  const pack = verticalByKey(params.verticalKey);
  if (!pack) notFound();

  const command = blueprintFor("command")!;
  const agents = command.modules.filter((m) => m.kind === "AGENT");
  const scale = planByKey("scale")!;
  const tunedPlaybooks = Object.keys(pack.playbookPrompts)
    .map((key) => command.modules.find((m) => m.key === key))
    .filter((m): m is NonNullable<typeof m> => Boolean(m));

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 whitespace-nowrap font-heading text-base font-bold"
          >
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary/15 text-cyan shadow-hud">
              ◈
            </span>
            {BRAND.wordmarkLead}
            <span className="text-gradient">{BRAND.wordmarkAccent}</span>
          </Link>
          <Button asChild variant="ghost" size="sm">
            <Link href="/verticals">
              <ArrowLeft className="h-4 w-4" /> All trades
            </Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="container py-16 text-center">
        <Badge>Built for {pack.trade.toLowerCase()}</Badge>
        <h1 className="mx-auto mt-5 max-w-4xl font-heading text-4xl font-bold leading-[1.05] md:text-5xl">
          {pack.headline}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">{pack.promise}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/plans/scale">See the {pack.name} →</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/#demo">Test drive it first</Link>
          </Button>
        </div>
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          From {formatCurrency(scale.priceMonthly)}/mo + {formatCurrency(scale.setupFee ?? 0)} one-time
          build
        </p>
      </section>

      {/* What this trade actually loses money on */}
      <section className="container py-12">
        <h2 className="text-center font-heading text-2xl font-bold">
          What this costs {pack.trade.toLowerCase()} every week
        </h2>
        <div className="mx-auto mt-8 grid max-w-4xl gap-4 md:grid-cols-3">
          {pack.painPoints.map((p, i) => (
            <div key={p} className="hud-panel hud-corners p-5">
              <div className="hud-value text-2xl font-bold text-cyan">0{i + 1}</div>
              <p className="mt-2 text-sm text-muted-foreground">{p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* The crew */}
      <section className="container py-12">
        <h2 className="text-center font-heading text-2xl font-bold">The crew you switch on</h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          The same five specialists every client gets — pointed at your trade from day one.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-5">
          {agents.map((m) => {
            const agent = m.agentSlug ? agentBySlug(m.agentSlug) : undefined;
            if (!agent) return null;
            return (
              <div
                key={m.key}
                className="hud-panel hud-corners flex w-40 flex-col items-center p-4 text-center"
              >
                <div className="h-20 w-20">
                  <RobotAvatar variant={agent.avatar} accent={agent.accent as AgentAccent} />
                </div>
                <span className="mt-2 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground">
                  {agent.persona}
                </span>
                <span className="font-heading text-sm font-semibold">{agent.name}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* What arrives pre-tuned */}
      <section className="container py-12">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center font-heading text-2xl font-bold">
            What arrives already written for you
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-muted-foreground">
            Everyone else hands you a blank system and a login. Your setup documents land filled in
            — and every word of them is yours to change.
          </p>

          <div className="mt-8 space-y-4">
            {Object.entries(pack.assetBodies).map(([key, body]) => (
              <div key={key} className="hud-panel p-5">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-cyan" />
                  <span className="font-heading text-sm font-bold">
                    {ASSET_LABELS[key] ?? key}
                  </span>
                  <Badge variant="success">pre-filled</Badge>
                </div>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-[0.7rem] leading-relaxed text-muted-foreground">
                  {body}
                </pre>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tuned playbooks */}
      {tunedPlaybooks.length > 0 && (
        <section className="container py-12">
          <div className="mx-auto max-w-3xl">
            <div className="mb-4 flex items-center justify-center gap-2">
              <Zap className="h-5 w-5 text-cyan" />
              <h2 className="font-heading text-2xl font-bold">One-click jobs, rewritten for you</h2>
            </div>
            <ul className="divide-y divide-border/40">
              {tunedPlaybooks.map((m) => (
                <li key={m.key} className="py-3">
                  <div className="text-sm font-medium">{m.name}</div>
                  <div className="text-xs text-muted-foreground">{m.description}</div>
                  <div className="mt-1.5 rounded-md border border-border/60 bg-muted/20 p-2 font-mono text-[0.65rem] leading-relaxed text-muted-foreground">
                    {pack.playbookPrompts[m.key].trim()}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Objections it already knows */}
      <section className="container py-12">
        <div className="mx-auto max-w-3xl">
          <div className="mb-5 flex items-center justify-center gap-2">
            <ShieldQuestion className="h-5 w-5 text-secondary" />
            <h2 className="font-heading text-2xl font-bold">
              The objections it already has answers for
            </h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {pack.objections.map((o) => (
              <div
                key={o}
                className="flex items-start gap-2 rounded-md border border-border/60 p-3 text-sm"
              >
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan" />
                <span className="italic text-muted-foreground">&ldquo;{o}&rdquo;</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tier pointer */}
      <section className="container py-12">
        <div className="mx-auto max-w-3xl">
          <div className="mb-5 flex items-center justify-center gap-2">
            <Target className="h-5 w-5 text-cyan" />
            <h2 className="font-heading text-2xl font-bold">Pick your tier</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {PLANS.filter((p) => p.line === "AI_AGENTS").map((plan) => (
              <Link
                key={plan.key}
                href={`/plans/${plan.key}`}
                className="hud-panel hud-corners p-5 transition-colors hover:border-cyan/60"
              >
                <div className="font-heading text-lg font-bold">{plan.name}</div>
                <div className="hud-value mt-1 text-xl font-bold">
                  {formatCurrency(plan.priceMonthly)}
                  <span className="text-xs font-normal text-muted-foreground">/mo</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{plan.tagline}</p>
                <span className="mt-3 block font-mono text-[0.65rem] uppercase tracking-widest text-cyan">
                  see the system →
                </span>
              </Link>
            ))}
          </div>
          <p className="mt-5 text-center text-xs text-muted-foreground">
            The {pack.name} is the same system at every tier — the tier decides how much of it
            switches on.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="container pb-20">
        <div className="hud-panel hud-corners mx-auto max-w-3xl p-8 text-center">
          <h2 className="font-heading text-2xl font-bold">
            Stop translating generic software into your trade
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            {pack.promise}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/cockpit">Build your {pack.trade.toLowerCase()} cockpit →</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/#contact">Talk to a strategist</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
