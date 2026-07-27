/**
 * The Creative Engine.
 *
 * DIRECTION
 *   This platform has been selling operations — meters, checks, arithmetic —
 *   and burying the creative work under it. That is backwards for a growth
 *   business. Media buying has a floor you eventually hit: there is only so
 *   much waste to remove from a budget. Creative has no ceiling. A better ad
 *   costs exactly the same to run as a worse one and can return several times
 *   more, which makes it the only lever with genuinely unlimited upside.
 *
 *   So creative gets promoted to a first-class pillar, and it is told as a
 *   loop rather than a service: write, test, watch, refresh, produce. Each
 *   stage already exists in the product — this file is the story that connects
 *   them, not new functionality pretending to be new functionality.
 *
 * BLUEPRINTS
 *   Every stage names the real module, agent or add-on that performs it, and
 *   `creative.test.ts` asserts each of those actually exists. If a module is
 *   renamed or dropped, the marketing claim breaks loudly rather than becoming
 *   a quiet lie on the landing page.
 */

import { blueprintFor } from "@/lib/systems";
import { agentBySlug } from "@/lib/agents";
import { addonByKey } from "@/lib/addons";

export type CreativeSource =
  | { kind: "AGENT"; slug: string }
  | { kind: "MODULE"; key: string }
  | { kind: "ADDON"; key: string };

export interface CreativeStage {
  key: string;
  /** Verb-first: what actually happens at this stage. */
  name: string;
  /** The one-line claim, written for a business owner. */
  promise: string;
  /** Why this stage exists, in the language of money rather than craft. */
  rationale: string;
  /** What in the product does it. Verified by tests. */
  source: CreativeSource;
  /** Which tier turns this stage on. */
  availableFrom: string;
}

export const CREATIVE_STAGES: CreativeStage[] = [
  {
    key: "write",
    name: "Write",
    promise: "Three angles on every offer, sized for the platform, in your voice.",
    rationale:
      "Most accounts run one idea in four sizes. Three genuinely different angles — pain, aspiration, proof — is how you find out which story your market actually responds to instead of guessing once and living with it.",
    source: { kind: "AGENT", slug: "ad-copy-copilot" },
    availableFrom: "scale",
  },
  {
    key: "test",
    name: "Test",
    promise: "One variable at a time, with the kill rule written down in advance.",
    rationale:
      "A test without a stated threshold is an opinion with a spreadsheet. Your framework fixes the minimum spend, the minimum run time, what counts as a winner and when to kill — before a dollar goes out, so nobody argues about it after.",
    source: { kind: "MODULE", key: "adops-asset-testing-framework" },
    availableFrom: "operate",
  },
  {
    key: "watch",
    name: "Watch",
    promise: "Click-through decay caught before your cost per lead ever moves.",
    rationale:
      "Fatigue shows up in click-through a week or two before it shows up in cost per lead. Catching it at the early signal means refreshing while performance is still normal — waiting until CPL climbs means paying for the lesson twice.",
    source: { kind: "MODULE", key: "adops-monitor-creative-fatigue" },
    availableFrom: "operate",
  },
  {
    key: "refresh",
    name: "Refresh",
    promise: "Rewrite the tired ad, keeping the part that still works.",
    rationale:
      "Fatigued creative is rarely wrong from top to bottom — usually the hook has worn out and the offer is fine. Rebuilding from scratch throws away the half you already proved.",
    source: { kind: "MODULE", key: "playbook-fatigue-refresh" },
    availableFrom: "scale",
  },
  {
    key: "produce",
    name: "Produce",
    promise: "A standing queue of fresh concepts, so there is always a next ad.",
    rationale:
      "The reason accounts stall is not bad strategy, it is an empty pipeline — nothing new is ready on the day the current ad dies. A monthly production cadence means the replacement is already waiting.",
    source: { kind: "ADDON", key: "creative-studio" },
    availableFrom: "operate",
  },
];

/** The claim the section leads with. Kept here so the page and tests agree. */
export const CREATIVE_THESIS = {
  headline: "Media buying has a floor. Creative doesn't.",
  body:
    "You can only squeeze so much waste out of a budget — at some point the account is as tight as it gets. But a better ad costs exactly the same to run as a worse one, and can return several times more. That is why creative is the one lever we treat as a permanent system rather than a project, and why it is the part of this tier we would not sell without.",
} as const;

/** Resolve a stage's source to a display label. Returns null if it has vanished. */
export function stageSourceLabel(stage: CreativeStage): string | null {
  const { source } = stage;
  if (source.kind === "AGENT") {
    const agent = agentBySlug(source.slug);
    return agent ? `${agent.name} (${agent.persona})` : null;
  }
  if (source.kind === "ADDON") {
    return addonByKey(source.key)?.name ?? null;
  }
  // Modules live on the widest blueprint of each line; check both.
  for (const planKey of ["command", "dominate"]) {
    const found = blueprintFor(planKey)?.modules.find((m) => m.key === source.key);
    if (found) return found.name;
  }
  return null;
}
