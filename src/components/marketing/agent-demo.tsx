"use client";

import * as React from "react";
import { Play, RotateCcw } from "lucide-react";
import { AGENTS, type AgentAccent } from "@/lib/agents";
import { RobotAvatar } from "@/components/robot-avatar";
import { cn } from "@/lib/utils";

/**
 * "Test-drive the crew" — an interactive, fully client-side demo.
 * Each agent plays a scripted scenario with a typewriter stream, so prospects
 * feel the product instantly: no signup, no API key, no latency, no cost.
 * Real runs (live model, your data, your brand voice) happen inside the app.
 */

interface DemoScript {
  input: string;
  output: string;
}

const DEMO_SCRIPTS: Record<string, DemoScript> = {
  "lead-qualifier": {
    input:
      "Lead: Dana Ruiz, VP Marketing @ Acme SaaS (~200 employees). Filled out the demo form, budget \"flexible\", wants to launch next quarter.",
    output:
      "SCORE: 82/100 — HOT 🔥\n\n› Authority — VP Marketing, decision-influencer ✓\n› Need — actively requested a demo ✓\n› Timeline — next quarter, concrete ✓\n› Budget — \"flexible\" needs confirmation ⚠\n\nNEXT ACTION → Book a discovery call within 24h. Lead with the quarter-launch timeline; confirm budget range on the call.",
  },
  "ad-copy-copilot": {
    input: "Offer: 6-week body transform program. Audience: busy dads 35-50. Platform: Meta.",
    output:
      "VARIANT SET A — pain-led\nHOOK: \"Your kids don't care about your six-pack. They care if you can keep up.\"\nHEADLINE: The 6-Week Dad Rebuild\nCTA: Start Week 1 Free\n\nVARIANT SET B — proof-led\nHOOK: \"217 dads. 6 weeks. Average −14 lbs — without living in a gym.\"\nHEADLINE: Built For Men With 45 Minutes, Not 4 Hours\nCTA: See The Program",
  },
  "follow-up-sequencer": {
    input: "Lead downloaded the pricing guide 3 days ago. No reply since. Offer: free strategy call.",
    output:
      "TOUCH 1 · Day 0 · EMAIL\nSubj: your pricing guide — one thing people miss\n{{first_name}}, most people skip page 4. That's where the ROI math lives…\n\nTOUCH 2 · Day 2 · SMS\n\"Hey {{first_name}} — saw you grabbed the guide. 15-min call this week to map it to your numbers?\"\n\nTOUCH 3 · Day 5 · EMAIL — case study\nTOUCH 4 · Day 9 · SMS — soft deadline\nTOUCH 5 · Day 14 · EMAIL — clean break-up ✂",
  },
  "crm-updater": {
    input:
      "call w/ mike from northstar roofing, wants the pro plan maybe 20 seats, budget approved by cfo, sending contract friday, follow up mon",
    output:
      "SUMMARY: Northstar Roofing → PROPOSAL stage. Contract out Friday.\n\n{\n  \"contact\": { \"name\": \"Mike\", \"company\": \"Northstar Roofing\" },\n  \"deal\": { \"stage\": \"PROPOSAL\", \"value\": 20, \"unit\": \"seats\" },\n  \"nextStep\": { \"action\": \"Follow up on contract\", \"dueDate\": \"Monday\" }\n}\n\n[ ✓ Ready to send to your CRM ]",
  },
  "objection-handler": {
    input: "\"This sounds great but it's too expensive for us right now.\"",
    output:
      "FRAMEWORK 1 — Reframe to cost-of-inaction\n\"Totally fair. Quick question — what's a new customer worth to you? If this brings in 3 a month, the math flips fast.\"\n\nFRAMEWORK 2 — Isolate & resolve\n\"If price weren't a factor, is this something you'd want? Then let's solve the price part together.\"\n\nFRAMEWORK 3 — Feel-Felt-Found\nUse when trust is high. Script included in your workspace →",
  },
};

const ACCENT_TEXT: Record<AgentAccent, string> = {
  cyan: "text-cyan",
  violet: "text-secondary",
  magenta: "text-accent",
  lime: "text-lime-400",
  amber: "text-amber-400",
};

export function AgentDemo() {
  const [selected, setSelected] = React.useState(AGENTS[0]);
  const [phase, setPhase] = React.useState<"idle" | "typing" | "done">("idle");
  const [text, setText] = React.useState("");
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const script = DEMO_SCRIPTS[selected.slug];

  const stop = React.useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  React.useEffect(() => () => stop(), [stop]);

  function pick(slug: string) {
    const agent = AGENTS.find((a) => a.slug === slug);
    if (!agent) return;
    stop();
    setSelected(agent);
    setPhase("idle");
    setText("");
  }

  function run() {
    stop();
    setText("");
    setPhase("typing");
    const out = script.output;
    let i = 0;
    timerRef.current = setInterval(() => {
      i += 3; // chars per tick — fast enough to feel live, slow enough to watch
      setText(out.slice(0, i));
      if (i >= out.length) {
        stop();
        setPhase("done");
      }
    }, 24);
  }

  return (
    <div className="hud-panel hud-corners overflow-hidden p-0">
      {/* Agent picker */}
      <div className="flex gap-1 overflow-x-auto border-b border-border/60 bg-card/60 p-2">
        {AGENTS.map((agent) => (
          <button
            key={agent.slug}
            onClick={() => pick(agent.slug)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors",
              selected.slug === agent.slug
                ? "bg-cyan/10 text-foreground ring-1 ring-cyan/40"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            <span className="h-6 w-6">
              <RobotAvatar variant={agent.avatar} accent={agent.accent} glow={false} />
            </span>
            <span className="hidden sm:inline">{agent.name}</span>
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2">
        {/* Input side */}
        <div className="border-b border-border/60 p-5 md:border-b-0 md:border-r">
          <div className="mb-2 flex items-center justify-between">
            <span className="hud-label">Incoming transmission</span>
            <span className={cn("font-mono text-[0.6rem] uppercase tracking-[0.2em]", ACCENT_TEXT[selected.accent])}>
              {selected.persona}
            </span>
          </div>
          <p className="min-h-[120px] whitespace-pre-wrap rounded-md border border-border/60 bg-background/60 p-4 font-mono text-xs leading-relaxed text-foreground/80">
            {script.input}
          </p>
          <button
            onClick={run}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-hud transition-all hover:brightness-110"
          >
            {phase === "idle" ? (
              <><Play className="h-4 w-4" /> Run {selected.name}</>
            ) : (
              <><RotateCcw className="h-4 w-4" /> Run it again</>
            )}
          </button>
        </div>

        {/* Output side */}
        <div className="relative p-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="hud-label">Agent response</span>
            {phase === "typing" && (
              <span className="flex items-center gap-1.5 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-cyan">
                <span className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-cyan" /> streaming
              </span>
            )}
            {phase === "done" && (
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-emerald-400">complete</span>
            )}
          </div>
          <div className="min-h-[190px] whitespace-pre-wrap rounded-md border border-border/60 bg-background/60 p-4 font-mono text-xs leading-relaxed">
            {phase === "idle" ? (
              <span className="text-muted-foreground">
                Press run. This is a scripted taste — in your cockpit the agents run live on your
                data, in your brand voice.
              </span>
            ) : (
              <>
                {text}
                {phase === "typing" && <span className="animate-pulse text-cyan">▌</span>}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
