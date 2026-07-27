import Link from "next/link";
import { requireClient } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { notifyAgency } from "@/lib/notify";
import { revalidatePath } from "next/cache";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { RequestKind, RequestStatus } from "@prisma/client";

const STATUS_VARIANT: Record<RequestStatus, "default" | "warning" | "success"> = {
  OPEN: "default",
  IN_PROGRESS: "warning",
  DELIVERED: "success",
};

async function createRequest(formData: FormData) {
  "use server";
  const { client } = await requireClient();
  const title = String(formData.get("title") || "").slice(0, 160);
  const body = String(formData.get("body") || "").slice(0, 4000);
  const kind = String(formData.get("kind") || "OTHER") as RequestKind;
  if (!title || !body) return;

  const created = await prisma.request.create({
    data: { clientId: client.id, title, body, kind },
  });

  // Tell the agency. Fire-and-forget by construction — a mail failure must not
  // lose the client's request, which is already safely written above.
  await notifyAgency("REQUEST_FILED", {
    businessName: client.businessName,
    title,
    detail: body.slice(0, 500),
    path: `/admin/requests/${created.id}`,
  });

  revalidatePath("/app/requests");
}

export default async function RequestsPage() {
  const { client } = await requireClient();
  const requests = await prisma.request.findMany({
    where: { clientId: client.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { comments: true } } },
  });

  return (
    <div className="space-y-8">
      <div>
        <div className="hud-label">Requests</div>
        <h1 className="mt-1 font-heading text-3xl font-bold">Talk to your ad-ops team</h1>
      </div>

      <Card>
        <CardTitle>New request</CardTitle>
        <form action={createRequest} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required placeholder="Rotate creative on Meta prospecting" />
            </div>
            <div>
              <Label htmlFor="kind">Type</Label>
              <select
                id="kind"
                name="kind"
                className="h-10 rounded-md border border-input bg-background/60 px-3 text-sm focus-visible:border-cyan/60 focus-visible:outline-none"
              >
                <option value="NEW_CREATIVE">New creative</option>
                <option value="CAMPAIGN_CHANGE">Campaign change</option>
                <option value="STRATEGY_QUESTION">Strategy question</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="body">Details</Label>
            <Textarea id="body" name="body" required placeholder="What do you need?" />
          </div>
          <Button type="submit">Submit request</Button>
        </form>
      </Card>

      <div className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">Your requests</h2>
        {requests.length === 0 && (
          <Card className="text-sm text-muted-foreground">No requests yet.</Card>
        )}
        {requests.map((r) => (
          <Link key={r.id} href={`/app/requests/${r.id}`} className="block">
            <Card className="flex items-center justify-between transition-colors hover:border-cyan/50">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.title}</span>
                  <Badge variant={STATUS_VARIANT[r.status]}>{r.status.replace("_", " ")}</Badge>
                </div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">
                  {r.kind.replace("_", " ")} · {r._count.comments} comment{r._count.comments === 1 ? "" : "s"} · {r.createdAt.toISOString().slice(0, 10)}
                </div>
              </div>
              <span className="text-xs text-muted-foreground">Open thread →</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
