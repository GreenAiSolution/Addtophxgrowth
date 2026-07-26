import { requireAdmin } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { RobotAvatar } from "@/components/robot-avatar";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { RobotVariant } from "@/components/robot-avatar";
import type { AgentAccent } from "@/lib/agents";

async function updatePrompt(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = String(formData.get("id"));
  const baseSystemPrompt = String(formData.get("prompt") || "").slice(0, 8000);
  if (!baseSystemPrompt) return;
  await prisma.agentDefinition.update({ where: { id }, data: { baseSystemPrompt } });
  revalidatePath("/admin/agents");
}

export default async function AdminAgentsPage() {
  await requireAdmin();
  const agents = await prisma.agentDefinition.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="space-y-6">
      <div>
        <div className="hud-label">Admin</div>
        <h1 className="mt-1 font-heading text-3xl font-bold">Agent prompt editor</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Base system prompts live in the DB — never hardcoded. Per-client overrides take precedence at run time.
        </p>
      </div>

      <div className="space-y-4">
        {agents.map((a) => (
          <Card key={a.id}>
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 shrink-0">
                <RobotAvatar variant={a.avatar as RobotVariant} accent={a.accent as AgentAccent} glow={false} />
              </div>
              <form action={updatePrompt} className="flex-1">
                <input type="hidden" name="id" value={a.id} />
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground">{a.persona}</span>
                  <span className="font-heading font-semibold">{a.name}</span>
                </div>
                <Textarea name="prompt" defaultValue={a.baseSystemPrompt} className="mt-3 min-h-[120px] font-mono text-xs" />
                <div className="mt-3">
                  <Button size="sm" variant="outline" type="submit">Save prompt</Button>
                </div>
              </form>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
