import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft } from "lucide-react";
import { requireClient } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CommentThread } from "@/components/comment-thread";
import type { RequestStatus } from "@prisma/client";

const STATUS_VARIANT: Record<RequestStatus, "default" | "warning" | "success"> = {
  OPEN: "default",
  IN_PROGRESS: "warning",
  DELIVERED: "success",
};

export default async function RequestDetailPage({ params }: { params: { id: string } }) {
  const { client } = await requireClient();

  // Tenant-scoped lookup — a client can never load another tenant's request.
  const request = await prisma.request.findFirst({
    where: { id: params.id, clientId: client.id },
    include: { comments: { orderBy: { createdAt: "asc" } } },
  });
  if (!request) notFound();

  async function addComment(formData: FormData) {
    "use server";
    const { client: c, actor: a } = await requireClient();
    const body = String(formData.get("body") || "").trim().slice(0, 4000);
    if (!body) return;

    const target = await prisma.request.findFirst({ where: { id: params.id, clientId: c.id } });
    if (!target) return;

    const user = await prisma.user.findUnique({ where: { id: a.userId }, select: { name: true } });
    await prisma.requestComment.create({
      data: {
        requestId: target.id,
        authorId: a.userId,
        authorName: user?.name ?? c.businessName,
        authorRole: "CLIENT",
        body,
      },
    });
    // Email notification stub (wire Resend later).
    console.info(`[notify] New client comment on request ${target.id}`);
    revalidatePath(`/app/requests/${target.id}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/app/requests" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-cyan">
        <ArrowLeft className="h-4 w-4" /> All requests
      </Link>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-2xl font-bold">{request.title}</h1>
          <Badge variant={STATUS_VARIANT[request.status]}>{request.status.replace("_", " ")}</Badge>
        </div>
        <div className="mt-1 font-mono text-xs text-muted-foreground">
          {request.kind.replace("_", " ")} · opened {request.createdAt.toISOString().slice(0, 10)}
        </div>
        <p className="mt-4 whitespace-pre-wrap text-sm text-foreground/90">{request.body}</p>
      </Card>

      <div>
        <h2 className="mb-3 font-heading text-lg font-semibold">Thread</h2>
        <CommentThread comments={request.comments} />
      </div>

      <Card>
        <form action={addComment} className="space-y-3">
          <Textarea name="body" required placeholder="Reply to your ad-ops team…" />
          <div className="flex justify-end">
            <Button type="submit" size="sm">Post comment</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
