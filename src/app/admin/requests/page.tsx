import Link from "next/link";
import { requireAdmin } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RequestStatus } from "@prisma/client";

const NEXT: Record<RequestStatus, RequestStatus | null> = {
  OPEN: "IN_PROGRESS",
  IN_PROGRESS: "DELIVERED",
  DELIVERED: null,
};

async function advance(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = String(formData.get("id"));
  const next = String(formData.get("next")) as RequestStatus;
  await prisma.request.update({ where: { id }, data: { status: next } });
  console.info(`[notify] Request ${id} → ${next}`);
  revalidatePath("/admin/requests");
}

export default async function AdminRequestsPage() {
  await requireAdmin();
  const requests = await prisma.request.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { client: { select: { businessName: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="hud-label">Admin</div>
        <h1 className="mt-1 font-heading text-3xl font-bold">Request queue</h1>
      </div>

      <div className="space-y-3">
        {requests.length === 0 && <Card className="text-sm text-muted-foreground">Queue is empty.</Card>}
        {requests.map((r) => {
          const next = NEXT[r.status];
          return (
            <Card key={r.id} className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Link href={`/admin/requests/${r.id}`} className="font-medium hover:text-cyan">
                    {r.title}
                  </Link>
                  <Badge variant={r.status === "DELIVERED" ? "success" : r.status === "IN_PROGRESS" ? "warning" : "default"}>
                    {r.status.replace("_", " ")}
                  </Badge>
                </div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">
                  {r.client.businessName} · {r.kind.replace("_", " ")} · {r.createdAt.toISOString().slice(0, 10)}
                </div>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{r.body}</p>
                <Link href={`/admin/requests/${r.id}`} className="mt-2 inline-block text-xs text-cyan hover:underline">
                  Open thread →
                </Link>
              </div>
              {next && (
                <form action={advance}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="next" value={next} />
                  <Button size="sm" variant="outline">Mark {next.replace("_", " ")}</Button>
                </form>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
