/**
 * Running the drills.
 *
 * A drill is a scripted caller. `runDrill` walks its lines through the real
 * `runTurn` — the same three stages a live call goes through — and reports what
 * the operator did.
 *
 * WHY THERE IS A STAND-IN OPERATOR
 *   Without an Anthropic key, every turn that needs phrasing falls into the
 *   handover path, and every drill would "fail" for a reason that has nothing to
 *   do with the playbook. That is useless feedback. So a deterministic stand-in
 *   phrases the turns instead, and the result is labelled `phrasing: "stand-in"`
 *   wherever it is shown.
 *
 *   The stand-in is deliberately not clever. It reads the verdict the state
 *   machine already reached and says the obvious thing — which means a drill
 *   result is a statement about the *rules*, not about the model's wording. The
 *   rules are what an owner is editing on that screen.
 */

import { runTurn, type TurnOutput } from "@/lib/voice-runtime";
import { decideNext, type CallState, type Playbook, type Turn } from "@/lib/voice";
import type { PriceBook } from "@/lib/estimates";
import { looksLikeCardRead, type CallOutcome } from "@/lib/voice";
import type { Drill, DrillObservation } from "@/lib/training";

export interface DrillResult {
  drill: Drill;
  passed: boolean;
  observation: DrillObservation;
  transcript: Turn[];
  /** Every event the run produced, in order. */
  events: string[];
  phrasing: "model" | "stand-in";
}

/**
 * The stand-in. Says what the verdict implies and never invents a number — the
 * one thing it must not do, since the sanitiser it would otherwise trip is part
 * of what these drills are proving.
 */
function standIn(pb: Playbook, state: CallState) {
  return async (): Promise<{ say: string; captured?: Record<string, string> }> => {
    const verdict = decideNext(pb, state);
    switch (verdict.do) {
      case "ask":
        return { say: verdict.prompt, captured: { [verdict.slot]: "noted" } };
      case "quote":
        return { say: "Let me get you a number for that." };
      case "book":
        return { say: "I can get somebody out to you — does Thursday morning work?" };
      default:
        return { say: "Thanks — that's everything I need." };
    }
  };
}

export async function runDrill(
  playbook: Playbook,
  priceBook: PriceBook,
  drill: Drill,
  opts: { useModel?: boolean } = {},
): Promise<DrillResult> {
  let state: CallState = { turns: 0, captured: {} };
  let transcript: Turn[] = [];
  const events: string[] = [];
  let last: TurnOutput | undefined;

  for (const said of drill.says) {
    const speak = standIn(playbook, state);
    const out = await runTurn(
      {
        playbook,
        priceBook,
        state,
        transcript,
        callerSaid: said,
        context: { direction: "INBOUND", purpose: "answer" },
      },
      opts.useModel ? {} : { callModel: async () => speak().then((r) => ({ ...r })) },
    );
    state = out.state;
    transcript = out.transcript;
    events.push(...out.events);
    last = out;
    if (out.endCall) break;
  }

  const outcome: CallOutcome =
    last?.outcome ?? (state.escalated ? "HANDED_OFF" : state.booked ? "BOOKED" : "QUALIFIED");

  const observation: DrillObservation = {
    outcome,
    handedOff: outcome === "HANDED_OFF" || outcome === "MESSAGE_TAKEN",
    quoted: Boolean(state.quoted),
    optedOutRecorded: Boolean(state.optedOut),
    transcriptHasCardDigits: transcript.some((t) => looksLikeCardRead(t.text)),
    saidForbidden: transcript.some(
      (t) =>
        t.role === "operator" &&
        playbook.neverSay.some((p) => p.trim() && t.text.toLowerCase().includes(p.toLowerCase())),
    ),
  };

  return {
    drill,
    passed: drill.expect(observation),
    observation,
    transcript,
    events,
    phrasing: opts.useModel ? "model" : "stand-in",
  };
}

export async function runDrills(
  playbook: Playbook,
  priceBook: PriceBook,
  drills: Drill[],
  opts: { useModel?: boolean } = {},
): Promise<DrillResult[]> {
  const out: DrillResult[] = [];
  for (const d of drills) out.push(await runDrill(playbook, priceBook, d, opts));
  return out;
}
