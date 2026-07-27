"use client";

import * as React from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import { UPGRADES, upgradeByKey, type Upgrade } from "@/lib/upgrades";
import { formatCurrency, cn } from "@/lib/utils";
import { pulse } from "@/components/marketing/pulse";

/**
 * The Gap Finder.
 *
 * DIRECTION
 *   The page was asking a visitor to read five arguments and work out for
 *   themselves which applied. That is our job, not theirs. Five yes/no
 *   questions about what already happens in their business is enough to say
 *   precisely which upgrades are relevant — and, just as often, that none are.
 *
 *   It is built to be able to return nothing. A diagnostic that always finds
 *   something wrong is a sales script with a progress bar, and a visitor can
 *   feel the difference immediately. Answer everything the healthy way and it
 *   says so and sends you away.
 *
 * BLUEPRINTS
 *   Each question maps to exactly one upgrade, and the mapping is derived from
 *   the catalogue: an unrecognised key throws at module load rather than
 *   silently rendering a question that recommends nothing.
 */

interface Question {
  /** The upgrade this question is a proxy for. */
  key: string;
  /** Asked about their business, never about our product. */
  ask: string;
  /** The answer that indicates a gap. */
  gapWhen: "yes" | "no";
  /** Shown when they land on the gap side. */
  because: string;
}

const QUESTIONS: Question[] = [
  {
    key: "voice-employee",
    ask: "Do calls ever reach voicemail — evenings, weekends, mid-job?",
    gapWhen: "yes",
    because: "Closer works email, SMS and DM. It cannot pick up a phone.",
  },
  {
    key: "motion-unit",
    ask: "Are you shooting new video every month?",
    gapWhen: "no",
    because: "Prism briefs the creative. Nobody puts a camera in front of anyone.",
  },
  {
    key: "answer-engine",
    ask: "Have you checked what ChatGPT says when asked for your category?",
    gapWhen: "no",
    because: "Herald owns Google. Assistants read somewhere else entirely.",
  },
  {
    key: "citation-authority",
    ask: "Has a publication, podcast or directory mentioned you this quarter?",
    gapWhen: "no",
    because: "Models quote independent sources. You can't write those yourself.",
  },
  {
    key: "tuning-lab",
    ask: "Does anyone grade your AI crew's conversations against closed deals?",
    gapWhen: "no",
    because: "Tower keeps the crew running. That is operations, not coaching.",
  },
];

// Fail loudly at import if a question points at an upgrade we no longer sell —
// the alternative is a live question that quietly recommends nothing.
for (const q of QUESTIONS) {
  if (!upgradeByKey(q.key)) {
    throw new Error(`Gap Finder question references unknown upgrade: ${q.key}`);
  }
}

type Answer = "yes" | "no" | undefined;

export function GapFinder() {
  const [answers, setAnswers] = React.useState<Answer[]>(() => QUESTIONS.map(() => undefined));

  const answered = answers.filter(Boolean).length;
  const complete = answered === QUESTIONS.length;

  const gaps: Upgrade[] = React.useMemo(
    () =>
      QUESTIONS.flatMap((q, i) =>
        answers[i] === q.gapWhen ? [upgradeByKey(q.key)!] : [],
      ),
    [answers],
  );

  const monthly = gaps.filter((u) => u.billing === "monthly").reduce((s, u) => s + u.price, 0);

  function answer(i: number, value: "yes" | "no") {
    setAnswers((prev) => {
      const next = [...prev];
      next[i] = next[i] === value ? undefined : value;
      return next;
    });
  }

  function addAll() {
    for (const u of gaps) {
      window.dispatchEvent(new CustomEvent("phx:toggle-upgrade", { detail: u.key }));
    }
    pulse("gap_finder", `added:${gaps.length}`);
    document.querySelector("#enquiry")?.scrollIntoView({ behavior: "smooth" });
  }

  React.useEffect(() => {
    if (complete) pulse("gap_finder", `found:${gaps.length}`);
  }, [complete, gaps.length]);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem] lg:items-start">
      <div className="space-y-2.5">
        {QUESTIONS.map((q, i) => {
          const chosen = answers[i];
          const isGap = chosen === q.gapWhen;
          return (
            <div
              key={q.key}
              className={cn(
                "phx-card flex flex-col gap-3 p-5 transition-colors sm:flex-row sm:items-center",
                isGap && "border-magenta/40",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[0.95rem] leading-snug text-foreground/90">{q.ask}</p>
                {/* The reason only appears once it's relevant. Showing all five
                    up front would be five more paragraphs to read past. */}
                {isGap && (
                  <p className="mt-1.5 text-xs leading-relaxed text-magenta/80">{q.because}</p>
                )}
              </div>

              <div className="flex shrink-0 gap-2">
                {(["yes", "no"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => answer(i, v)}
                    aria-pressed={chosen === v}
                    className={cn(
                      "w-16 rounded-full border py-2 text-xs font-semibold uppercase tracking-wider transition-colors",
                      chosen === v
                        ? "border-cyan/60 bg-cyan/10 text-cyan"
                        : "border-white/12 text-muted-foreground hover:border-white/30 hover:text-foreground",
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <aside className="phx-card p-6 lg:sticky lg:top-24">
        <div className="eyebrow text-muted-foreground">Your gaps</div>

        {!complete ? (
          <>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold tracking-tight text-muted-foreground/50">
                {answered}
              </span>
              <span className="text-sm text-muted-foreground">/ {QUESTIONS.length} answered</span>
            </div>
            <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan to-magenta transition-all duration-500"
                style={{ width: `${(answered / QUESTIONS.length) * 100}%` }}
              />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Five questions about your business, not about our product. Nothing is sent anywhere.
            </p>
          </>
        ) : gaps.length === 0 ? (
          // The outcome a sales tool is not supposed to have.
          <>
            <p className="mt-3 text-lg font-bold tracking-tight text-signal">
              Nothing here is for you.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Your crew is covering all five. That is genuinely rare and we&apos;re not going to
              invent a sixth gap to keep you on this page.
            </p>
            <button
              type="button"
              onClick={() => setAnswers(QUESTIONS.map(() => undefined))}
              className="mt-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" /> Start over
            </button>
          </>
        ) : (
          <>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tracking-tight text-gradient">{gaps.length}</span>
              <span className="text-sm text-muted-foreground">
                gap{gaps.length === 1 ? "" : "s"} found
              </span>
            </div>

            <ul className="mt-4 space-y-2 border-t border-white/[0.07] pt-4">
              {gaps.map((u) => (
                <li key={u.key} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{u.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatCurrency(u.price)}
                    {u.billing === "monthly" ? "/mo" : ""}
                  </span>
                </li>
              ))}
            </ul>

            {monthly > 0 && (
              <div className="mt-4 flex items-baseline justify-between border-t border-white/[0.07] pt-4">
                <span className="eyebrow text-[0.6rem] text-muted-foreground">Monthly</span>
                <span className="text-lg font-bold tracking-tight">{formatCurrency(monthly)}</span>
              </div>
            )}

            <button type="button" onClick={addAll} className="pill-primary mt-5 w-full text-sm">
              Add these <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setAnswers(QUESTIONS.map(() => undefined))}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" /> Start over
            </button>
          </>
        )}
      </aside>
    </div>
  );
}
