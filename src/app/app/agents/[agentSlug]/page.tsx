import { notFound, redirect } from "next/navigation";
import { requireClient } from "@/lib/tenancy";
import { getActiveSubscription, resolveLimits } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import { agentBySlug } from "@/lib/agents";
import { playbooksForAgent } from "@/lib/systems";
import { startOfMonthUTC } from "@/lib/utils";
import { RobotAvatar } from "@/components/robot-avatar";
import { AgentChat } from "@/components/agent-chat";
import { Badge } from "@/components/ui/badge";
import type { AgentAccent } from "@/lib/agents";

export default async function AgentWorkspacePage({ params }: { params: { agentSlug: string } }) {
  const agent = agentBySlug(params.agentSlug);
  if (!agent) notFound();

  const { client } = await requireClient();
  const sub = await getActiveSubscription(client.id, "AI_AGENTS");
  // Gate on resolved limits so a granted "Additional Agent" actually opens the
  // door — this check used to read the plan row and ignore the add-on.
  const resolved = await resolveLimits(client.id, "AI_AGENTS");
  const unlocked = resolved?.limits.unlockedAgents.includes(agent.slug);
  if (!unlocked) redirect("/app/billing");

  const [convo, used] = await Promise.all([
    prisma.agentConversation.findFirst({
      where: { clientId: client.id, agent: { slug: agent.slug } },
      orderBy: { updatedAt: "desc" },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.usageRecord.count({
      where: { clientId: client.id, lineKey: "AI_AGENTS", periodStart: sub?.currentPeriodStart ?? startOfMonthUTC() },
    }),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 shrink-0">
          <RobotAvatar variant={agent.avatar} accent={agent.accent as AgentAccent} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground">{agent.persona}</span>
            <Badge variant="success">Online</Badge>
          </div>
          <h1 className="font-heading text-2xl font-bold">{agent.name}</h1>
          <p className="text-sm text-muted-foreground">{agent.tagline}</p>
        </div>
      </div>

      <AgentChat
        agentSlug={agent.slug}
        agentName={agent.name}
        inputHint={agent.inputHint}
        initialConversationId={convo?.id}
        initialMessages={(convo?.messages ?? []).map((m) => ({
          id: m.id,
          role: m.role === "USER" ? "USER" : "ASSISTANT",
          content: m.content,
        }))}
        used={used}
        limit={resolved?.limits.maxAgentRunsMonthly ?? null}
        playbooks={playbooksForAgent(sub?.planKey ?? "", agent.slug).map((p) => ({
          name: p.name,
          description: p.description,
          prompt: p.prompt ?? "",
        }))}
      />
    </div>
  );
}
