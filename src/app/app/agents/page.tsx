import Link from "next/link";
import { Lock } from "lucide-react";
import { requireClient } from "@/lib/tenancy";
import { getActiveSubscription } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import { AGENTS } from "@/lib/agents";
import { RobotAvatar } from "@/components/robot-avatar";
import { UsageMeter } from "@/components/usage-meter";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { startOfMonthUTC } from "@/lib/utils";
import type { AgentAccent } from "@/lib/agents";

export default async function AgentsPage() {
  const { client } = await requireClient();
  const sub = await getActiveSubscription(client.id, "AI_AGENTS");
  const unlocked = new Set(sub?.plan.unlockedAgents ?? []);
  const used = await prisma.usageRecord.count({
    where: { clientId: client.id, lineKey: "AI_AGENTS", periodStart: sub?.currentPeriodStart ?? startOfMonthUTC() },
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="hud-label">Agent Workspace</div>
          <h1 className="mt-1 font-heading text-3xl font-bold">Your AI crew</h1>
        </div>
        {sub && (
          <div className="w-56">
            <UsageMeter used={used} limit={sub.plan.maxAgentRunsMonthly} />
          </div>
        )}
      </div>

      {!sub && (
        <Card className="border-amber-500/30">
          <p className="text-sm">
            You don&apos;t have an active Agents subscription.{" "}
            <Link href="/app/billing" className="text-cyan">Choose a plan →</Link>
          </p>
        </Card>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {AGENTS.map((agent) => {
          const isUnlocked = unlocked.has(agent.slug);
          const inner = (
            <Card className="group h-full transition-transform hover:-translate-y-1">
              <div className="flex items-start gap-4">
                <div className="h-16 w-16 shrink-0">
                  <RobotAvatar variant={agent.avatar} accent={agent.accent as AgentAccent} glow={isUnlocked} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground">
                      {agent.persona}
                    </span>
                    {isUnlocked ? (
                      <Badge variant="success">Online</Badge>
                    ) : (
                      <Badge variant="muted"><Lock className="mr-1 h-3 w-3" /> Locked</Badge>
                    )}
                  </div>
                  <h3 className="mt-1 font-heading text-lg font-semibold">{agent.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{agent.tagline}</p>
                </div>
              </div>
            </Card>
          );
          return isUnlocked ? (
            <Link key={agent.slug} href={`/app/agents/${agent.slug}`}>{inner}</Link>
          ) : (
            <Link key={agent.slug} href="/app/billing" className="opacity-70">{inner}</Link>
          );
        })}
      </div>
    </div>
  );
}
