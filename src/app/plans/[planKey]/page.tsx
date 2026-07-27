import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  BookOpen,
  Plug,
  FileText,
  CalendarClock,
  Check,
  Zap,
  Wrench,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { planByKey } from "@/lib/catalog";
import { blueprintFor, modulesByDelivery, type ModuleKind, type SystemModule } from "@/lib/systems";
import { agentBySlug } from "@/lib/agents";
import { formatCurrency } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import { RobotAvatar } from "@/components/robot-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckoutButton } from "@/components/billing-actions";
import type { AgentAccent } from "@/lib/agents";

/**
 * One page per tier. Before purchase it is the clearest possible statement of
 * what you are buying; after purchase the same page becomes the delivery
 * receipt, showing each module live with a link into the workspace.
 */

export function generateStaticParams() {
  return [{ planKey: "launch" }, { planKey: "scale" }, { planKey: "command" }];
}

const KIND_META: Record<ModuleKind, { label: string; icon: typeof Bot; blurb: string }> = {
  AGENT: { label: "Agents deployed", icon: Bot, blurb: "Specialists switched on in your workspace." },
  PLAYBOOK: { label: "Playbooks loaded", icon: BookOpen, blurb: "One-click starters, ready in each agent." },
  INTEGRATION: { label: "Integrations wired", icon: Plug, blurb: "Endpoints your stack can talk to." },
  ASSET: { label: "Assets delivered", icon: FileText, blurb: "Documents your team owns and edits." },
  MILESTONE: { label: "Build schedule", icon: CalendarClock, blurb: "Human work during your onboarding." },
};

const KIND_ORDER: ModuleKind[] = ["AGENT", "PLAYBOOK", "INTEGRATION", "ASSET", "MILESTONE"];

export default async function PlanPage({ params }: { params: { planKey: string } }) {
  const plan = planByKey(params.planKey);
  const blueprint = blueprintFor(params.planKey);
  if (!plan || !blueprint) notFound();

  // If the visitor already owns this tier, show what was actually delivered.
  const session = await auth();
  let owned = false;
  let delivered: { moduleKey: string; status: string }[] = [];
  if (session?.user?.id) {
    const client = await prisma.clientProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (client) {
      const sub = await prisma.subscription.findUnique({
        where: { clientId_lineKey: { clientId: client.id, lineKey: plan.line } },
        select: { planKey: true, status: true },
      });
      owned =
        sub?.planKey === plan.key && (sub.status === "ACTIVE" || sub.status === "TRIALING");
      if (owned) {
        delivered = await prisma.provisionedItem.findMany({
          where: { clientId: client.id },
          select: { moduleKey: true, status: true },
        });
      }
    }
  }
  const deliveredMap = new Map(delivered.map((d) => [d.moduleKey, d.status]));

  const instant = modulesByDelivery(blueprint, "INSTANT");
  const build = modulesByDelivery(blueprint, "BUILD");
  const agentModules = blueprint.modules.filter((m) => m.kind === "AGENT");

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 whitespace-nowrap font-heading text-base font-bold">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary/15 text-cyan shadow-hud">◈</span>
            {BRAND.wordmarkLead}<span className="text-gradient">{BRAND.wordmarkAccent}</span>
          </Link>
          <Button asChild variant="ghost" size="sm">
            <Link href="/#pricing"><ArrowLeft className="h-4 w-4" /> All plans</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="container py-14 text-center">
        <Badge variant={owned ? "success" : "default"}>
          {owned ? "Active — delivered to your console" : `${plan.name} tier`}
        </Badge>
        <h1 className="mx-auto mt-5 max-w-3xl font-heading text-4xl font-bold leading-[1.05] md:text-5xl">
          {blueprint.systemName}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">{blueprint.promise}</p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-6">
          <div className="text-left">
            <div className="hud-value text-3xl font-bold">
              {formatCurrency(plan.priceMonthly)}
              <span className="text-base font-normal text-muted-foreground">/mo</span>
            </div>
            {plan.setupFee ? (
              <div className="font-mono text-xs text-secondary">
                + {formatCurrency(plan.setupFee)} one-time build
              </div>
            ) : null}
          </div>
          {owned ? (
            <Button asChild size="lg">
              <Link href="/app/agents">Open your workspace →</Link>
            </Button>
          ) : session?.user ? (
            <div className="w-56">
              <CheckoutButton planKey={plan.key} label={`Activate ${plan.name}`} highlight />
            </div>
          ) : (
            <Button asChild size="lg">
              <Link href={`/login?plan=${plan.key}`}>Activate {plan.name} →</Link>
            </Button>
          )}
        </div>
      </section>

      {/* The crew you get */}
      <section className="container pb-10">
        <div className="flex flex-wrap justify-center gap-6">
          {agentModules.map((m) => {
            const agent = m.agentSlug ? agentBySlug(m.agentSlug) : undefined;
            if (!agent) return null;
            return (
              <div key={m.key} className="hud-panel hud-corners flex w-40 flex-col items-center p-4 text-center">
                <div className="h-20 w-20">
                  <RobotAvatar variant={agent.avatar} accent={agent.accent as AgentAccent} />
                </div>
                <span className="mt-2 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground">
                  {agent.persona}
                </span>
                <span className="font-heading text-sm font-semibold">{agent.name}</span>
                {owned && (
                  <span className="mt-1 font-mono text-[0.55rem] uppercase tracking-widest text-emerald-400">
                    live
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* What happens the moment you pay */}
      <section className="container py-12">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="hud-panel p-6">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-cyan" />
              <h2 className="font-heading text-xl font-bold">
                {owned ? "Deployed automatically" : "The moment you pay"}
              </h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {instant.length} modules provisioned by the platform — no waiting, no ticket.
            </p>
            <ul className="mt-4 space-y-2">
              {instant.map((m) => (
                <li key={m.key} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan" />
                  <span>
                    <span className="font-medium">{m.name}</span>
                    {owned && deliveredMap.has(m.key) && (
                      <span className="ml-2 font-mono text-[0.55rem] uppercase tracking-widest text-emerald-400">
                        ready
                      </span>
                    )}
                    <span className="block text-xs text-muted-foreground">{m.description}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="hud-panel p-6">
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-secondary" />
              <h2 className="font-heading text-xl font-bold">Then we build with you</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Covered by the one-time build fee. Scheduled the day you activate.
            </p>
            <ul className="mt-4 space-y-2">
              {build.map((m) => (
                <li key={m.key} className="flex items-start gap-2 text-sm">
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
                  <span>
                    <span className="font-medium">{m.name}</span>
                    {owned && deliveredMap.get(m.key) === "SCHEDULED" && (
                      <span className="ml-2 font-mono text-[0.55rem] uppercase tracking-widest text-amber-400">
                        scheduled
                      </span>
                    )}
                    <span className="block text-xs text-muted-foreground">{m.description}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Full manifest by kind */}
      <section className="container py-12">
        <h2 className="mb-6 text-center font-heading text-2xl font-bold">
          Everything in {blueprint.systemName}
        </h2>
        <div className="mx-auto max-w-3xl space-y-8">
          {KIND_ORDER.map((kind) => {
            const items = blueprint.modules.filter((m) => m.kind === kind);
            if (items.length === 0) return null;
            const meta = KIND_META[kind];
            const Icon = meta.icon;
            return (
              <div key={kind}>
                <div className="mb-2 flex items-baseline justify-between border-b border-cyan/20 pb-2">
                  <span className="flex items-center gap-2 font-heading font-bold">
                    <Icon className="h-4 w-4 text-cyan" /> {meta.label}
                    <span className="hud-value text-xs text-muted-foreground">({items.length})</span>
                  </span>
                  <span className="hud-label">{meta.blurb}</span>
                </div>
                <ul className="divide-y divide-border/40">
                  {items.map((m: SystemModule) => (
                    <li key={m.key} className="flex items-start justify-between gap-4 py-3">
                      <div>
                        <div className="text-sm font-medium">{m.name}</div>
                        <div className="text-xs text-muted-foreground">{m.description}</div>
                      </div>
                      <span
                        className={`shrink-0 font-mono text-[0.55rem] uppercase tracking-widest ${
                          m.delivery === "INSTANT" ? "text-cyan" : "text-secondary"
                        }`}
                      >
                        {m.delivery === "INSTANT" ? "instant" : "build"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* Outcomes + CTA */}
      <section className="container pb-20">
        <div className="hud-panel hud-corners mx-auto max-w-3xl p-8 text-center">
          <h2 className="font-heading text-2xl font-bold">What changes in your business</h2>
          <ul className="mt-5 space-y-2">
            {blueprint.outcomes.map((o) => (
              <li key={o} className="text-muted-foreground">
                {o}
              </li>
            ))}
          </ul>
          <div className="mt-7">
            {owned ? (
              <Button asChild size="lg">
                <Link href="/app">Go to your cockpit →</Link>
              </Button>
            ) : (
              <Button asChild size="lg">
                <Link href={session?.user ? "/app/billing" : `/login?plan=${plan.key}`}>
                  Activate {plan.name} →
                </Link>
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
