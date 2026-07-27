"use client";

import * as React from "react";
import { Send, Loader2, AlertTriangle, ArrowUpCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
}

export interface Playbook {
  name: string;
  description: string;
  prompt: string;
}

interface AgentChatProps {
  agentSlug: string;
  agentName: string;
  inputHint: string;
  initialMessages: Message[];
  initialConversationId?: string;
  used: number;
  limit: number | null;
  /** Provisioned starter prompts for this agent, from the client's tier. */
  playbooks?: Playbook[];
}

export function AgentChat({
  agentSlug,
  agentName,
  inputHint,
  initialMessages,
  initialConversationId,
  used,
  limit,
  playbooks = [],
}: AgentChatProps) {
  const [messages, setMessages] = React.useState<Message[]>(initialMessages);
  const [conversationId, setConversationId] = React.useState<string | undefined>(initialConversationId);
  const [input, setInput] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [usedCount, setUsedCount] = React.useState(used);
  const [limitHit, setLimitHit] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const atLimit = limit != null && usedCount >= limit;

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || streaming || atLimit) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: "USER", content: text };
    const assistantMsg: Message = { id: `a-${Date.now()}`, role: "ASSISTANT", content: "" };
    setMessages((m) => [...m, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);

    try {
      const res = await fetch(`/api/agents/${agentSlug}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, conversationId }),
      });

      if (res.status === 402) {
        setLimitHit(true);
        setMessages((m) => m.slice(0, -1)); // drop the empty assistant bubble
        setStreaming(false);
        return;
      }
      if (!res.ok || !res.body) {
        setMessages((m) =>
          m.map((msg) => (msg.id === assistantMsg.id ? { ...msg, content: "⚠️ Something went wrong. Please try again." } : msg)),
        );
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      let headerParsed = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        let chunk = decoder.decode(value, { stream: true });

        // First frame carries a JSON header with the conversation id.
        if (!headerParsed) {
          const match = chunk.match(/^\s*(\{.*?\})\s*/);
          if (match) {
            try {
              const meta = JSON.parse(match[1]) as { conversationId?: string };
              if (meta.conversationId) setConversationId(meta.conversationId);
            } catch {
              /* ignore */
            }
            chunk = chunk.slice(match[0].length);
          }
          headerParsed = true;
        }

        acc += chunk;
        setMessages((m) => m.map((msg) => (msg.id === assistantMsg.id ? { ...msg, content: acc } : msg)));
      }

      setUsedCount((c) => c + 1);
    } catch {
      setMessages((m) =>
        m.map((msg) => (msg.id === assistantMsg.id ? { ...msg, content: "⚠️ Connection dropped. Please retry." } : msg)),
      );
    } finally {
      setStreaming(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="flex h-[calc(100vh-13rem)] flex-col">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <div className="hud-panel p-8 text-center text-sm text-muted-foreground">
            <p className="font-heading text-base text-foreground">Start a conversation with {agentName}</p>
            <p className="mt-2">{inputHint}</p>

            {playbooks.length > 0 && (
              <div className="mt-6 border-t border-border/60 pt-5 text-left">
                <div className="hud-label mb-3 text-center">Playbooks from your plan</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {playbooks.map((pb) => (
                    <button
                      key={pb.name}
                      onClick={() => setInput(pb.prompt)}
                      className="rounded-md border border-border p-3 text-left transition-colors hover:border-cyan/60 hover:bg-muted/30"
                    >
                      <span className="block text-xs font-medium text-foreground">{pb.name}</span>
                      <span className="mt-0.5 block text-[0.7rem] text-muted-foreground">
                        {pb.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "USER" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-lg px-4 py-3 text-sm",
                m.role === "USER"
                  ? "bg-primary/15 text-foreground ring-1 ring-cyan/30"
                  : "hud-panel",
              )}
            >
              {m.content || (streaming && <span className="inline-flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> thinking…</span>)}
            </div>
          </div>
        ))}
      </div>

      {(atLimit || limitHit) && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <span className="flex items-center gap-2 text-amber-300">
            <AlertTriangle className="h-4 w-4" /> You&apos;ve reached your monthly run limit.
          </span>
          <Button asChild size="sm">
            <Link href="/app/billing"><ArrowUpCircle className="h-4 w-4" /> Upgrade</Link>
          </Button>
        </div>
      )}

      <div className="hud-panel flex items-end gap-2 p-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={atLimit ? "Limit reached — upgrade to continue" : inputHint}
          disabled={streaming || atLimit}
          className="min-h-[52px] resize-none border-0 bg-transparent focus-visible:ring-0"
        />
        <Button onClick={() => void send()} disabled={streaming || atLimit || !input.trim()} size="icon">
          {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      <p className="mt-1.5 text-center text-[0.65rem] text-muted-foreground">⌘/Ctrl + Enter to send</p>
    </div>
  );
}
