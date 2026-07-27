import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { sendNotification } from "@/lib/notify";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CommentThread } from "@/components/comment-thread";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import type { RequestStatus } from "@prisma/client";

const STATUSES: RequestStatus[] = ["OPEN", "IN_PROGRESS", "DELIVERED"];

export default async function AdminRequestDetailPage({ params }: { params: { id: string } }) {
  await requireAdmin();

  const request = await prisma.request.findUnique({
    where: { id: params.id },
    include: {
      client: { select: { businessName: true } },
      comments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!request) notFound();

  async function setStatus(formData: FormData) {
    "use server";
    await requireAdmin();
    const status = String(formData.get("status")) as RequestStatus;
    if (!STATUSES.includes(status)) return;
    await prisma.request.update({ where: { id: params.id }, data: { status } });
    console.info(`[notify] Request ${params.id} → ${status}`);
    revalidatePath(`/admin/requests/${params.id}`);
    revalidatePath("/admin/requests");
  }

  async function addComment(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const body = String(formData.get("body") || "").trim().slice(0, 4000);
    if (!body) return;

    const user = await prisma.user.findUnique({ where: { id: admin.userId }, select: { name: true } });
    await prisma.requestComment.create({
      data: {
        requestId: params.id,
        authorId: admin.userId,
        authorName: user?.name ?? BRAND.teamName,
        authorRole: "ADMIN",
        body,
      },
    });
    // Tell the client somebody answered. The reply is already saved, so a mail
    // failure costs a notification and never the message itself.
    const target = await prisma.request.findUnique({
      where: { id: params.id },
      select: {
        title: true,
        client: { select: { businessName: true, user: { select: { email: true } } } },
      },
    });
    if (target) {
      await sendNotification({
        kind: "REQUEST_REPLY_TO_CLIENT",
        to: target.client.user.email,
        payload: {
          businessName: target.client.businessName,
          title: target.title,
          detail: body.slice(0, 500),
          path: `/app/requests/${params.id}`,
        },
      });
    }

    revalidatePath(`/admin/requests/${params.id}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/admin/requests" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-cyan">
        <ArrowLeft className="h-4 w-4" /> Request queue
      </Link>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-2xl font-bold">{request.title}</h1>
          <Badge variant={request.status === "DELIVERED" ? "success" : request.status === "IN_PROGRESS" ? "warning" : "default"}>
            {request.status.replace("_", " ")}
          </Badge>
        </div>
        <div className="mt-1 font-mono text-xs text-muted-foreground">
          {request.client.businessName} · {request.kind.replace("_", " ")} · opened {request.createdAt.toISOString().slice(0, 10)}
        </div>
        <p className="mt-4 whitespace-pre-wrap text-sm text-foreground/90">{request.body}</p>

        {/* Status pipeline control */}
        <div className="mt-5 flex flex-wrap gap-2 border-t border-border/60 pt-4">
          {STATUSES.map((s) => (
            <form key={s} action={setStatus}>
              <input type="hidden" name="status" value={s} />
              <button
                type="submit"
                disabled={s === request.status}
                className={cn(
                  "rounded-md border px-3 py-1.5 font-mono text-xs uppercase tracking-widest transition-colors",
                  s === request.status
                    ? "border-cyan/60 bg-cyan/10 text-cyan"
                    : "border-border text-muted-foreground hover:border-cyan/40 hover:text-foreground",
                )}
              >
                {s.replace("_", " ")}
              </button>
            </form>
          ))}
        </div>
      </Card>

      <div>
        <h2 className="mb-3 font-heading text-lg font-semibold">Thread</h2>
        <CommentThread comments={request.comments} />
      </div>

      <Card>
        <form action={addComment} className="space-y-3">
          <Textarea name="body" required placeholder={`Reply as the ${BRAND.teamName}…`} />
          <div className="flex justify-end">
            <Button type="submit" size="sm" variant="violet">Post reply</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
