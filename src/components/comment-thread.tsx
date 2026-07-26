import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import type { RequestComment } from "@prisma/client";

/** Read-only rendering of a request's comment thread (forms live in the pages). */
export function CommentThread({ comments }: { comments: RequestComment[] }) {
  if (comments.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
        No comments yet. Start the conversation below.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {comments.map((c) => (
        <div
          key={c.id}
          className={cn(
            "rounded-lg border p-4",
            c.authorRole === "ADMIN"
              ? "border-secondary/30 bg-secondary/5"
              : "border-border bg-card/50",
          )}
        >
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-sm font-medium">{c.authorName}</span>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-widest",
                c.authorRole === "ADMIN"
                  ? "border-secondary/40 text-secondary"
                  : "border-cyan/40 text-cyan",
              )}
            >
              {c.authorRole === "ADMIN" ? BRAND.teamName : "Client"}
            </span>
            <span className="ml-auto font-mono text-[0.6rem] text-muted-foreground">
              {c.createdAt.toISOString().slice(0, 16).replace("T", " ")}
            </span>
          </div>
          <p className="whitespace-pre-wrap text-sm text-foreground/90">{c.body}</p>
        </div>
      ))}
    </div>
  );
}
