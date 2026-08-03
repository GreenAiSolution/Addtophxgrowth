/**
 * THE EVAL HARNESS — live mode.
 *
 *   pnpm evals:live
 *
 * WHAT THIS IS FOR
 *   The suites in `src/lib/evals` run in CI against fixtures, which measures
 *   this repository's own parsing and scoring code and explicitly does not
 *   measure the model. This script is the other half: it calls the real model
 *   on the real prompts and grades what actually comes back.
 *
 * WHY IT IS A SCRIPT AND NOT A TEST
 *   It needs `ANTHROPIC_API_KEY`, it costs money, and it is non-deterministic.
 *   Any one of those disqualifies it from being a build gate. CI must stay
 *   runnable by somebody with no credentials — that is the standard the rest
 *   of this codebase already holds itself to, and an eval suite that broke it
 *   would make every push depend on a vendor being up.
 *
 * THE LOOP THIS CLOSES
 *   Run it, read the failures, and promote anything it caught into
 *   `fixtures.ts` as a permanent case. A regression found once against the
 *   live model then costs nothing to check forever.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   It does not write `baselines.json`. A script that both measures and moves
 *   the bar it is measured against is not a gate, and the one edit this whole
 *   subsystem exists to make somebody think twice about is raising a baseline
 *   to turn a red build green.
 */

import Anthropic from "@anthropic-ai/sdk";
import { parseScore } from "../src/lib/night-shift";
import { parseCoding } from "../src/lib/genome/genome";
import { coderInstruction, type Coding } from "../src/lib/genome/taxonomy";
import { AGENTS } from "../src/lib/agents";
import {
  agreement,
  completeness,
  noFabricatedStats,
  noFakeTestimonial,
  schemaCompliance,
  tierCoherence,
  vocabularyCompliance,
  type Score,
} from "../src/lib/evals/scorers";
import { QUALIFIER_REQUIRED } from "../src/lib/evals/suites";

const key = process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.error(
    "ANTHROPIC_API_KEY is not set.\n" +
      "Live evals call the real model; CI runs the replay suites instead:\n" +
      "  pnpm test -- src/lib/evals",
  );
  process.exit(1);
}

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const client = new Anthropic({ apiKey: key });

async function ask(system: string, user: string, maxTokens = 800): Promise<string> {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

function agentPrompt(slug: string): string {
  const agent = AGENTS.find((a) => a.slug === slug);
  if (!agent) throw new Error(`no agent "${slug}"`);
  return agent.baseSystemPrompt;
}

// The instruction the night shift appends for unattended runs. Kept in step
// with night-shift.ts by hand; if they diverge, this script stops measuring
// the thing that actually runs.
const JSON_INSTRUCTION = [
  "\n\nYou are running unattended as part of an overnight batch. Nobody will read a conversational reply.",
  "Respond with ONLY a fenced ```json block containing:",
  '{ "score": <0-100 integer>, "tier": "HOT"|"WARM"|"COLD"|"DISQUALIFIED", "reasoning": "<2 sentences>", "nextAction": "<who does what, by when>" }',
  "No prose before or after the block.",
].join(" ");

// ---------------------------------------------------------------------------
// The live cases
// ---------------------------------------------------------------------------

const LEADS = [
  `Source: WEBSITE\nName: Marcy Bell\nCompany: (not given)\nEmail: marcy@example.com\nPhone: 480-555-0134\nMessage: Storm last night took shingles off the back slope and there's water in the hallway ceiling. Roof is about 14 years old. Insurance adjuster is coming Thursday. Need someone out before then if possible.`,
  `Source: WEBSITE\nName: Dan\nCompany: (not given)\nEmail: (not given)\nPhone: (not given)\nMessage: how much for a roof`,
  `Source: FACEBOOK\nName: Priya Raman\nCompany: Raman Dental\nEmail: priya@ramandental.com\nPhone: 602-555-0199\nMessage: We're planning a re-roof on our practice building next spring and getting three quotes now. Flat commercial roof, about 4,000 sq ft. No urgency, want to budget for FY26.`,
  `Source: WEBSITE\nName: Kevin Osei\nCompany: (not given)\nEmail: kevin.osei@example.com\nPhone: 928-555-0121\nMessage: Looking for a quote on a flat commercial roof in Flagstaff. Also do you do solar? Not sure if you cover this far north.`,
];

const CREATIVES: { name: string; prompt: string; gold: Coding }[] = [
  {
    name: "storm-damage-question",
    prompt: `Format: IMAGE\nName: Storm Damage — Q1\nHeadline: Did last night's storm take your shingles?\nBody: We'll be on your roof today, not next week. Free damage assessment, and we'll photograph what we find whether you hire us or not. Rated 4.9 by homeowners across the East Valley.\nVisual: Split image — torn shingles on the left, finished roof on the right.`,
    gold: {
      hook: "question",
      visual: "before-after",
      pacing: "immediate",
      offer: "quote",
      proof: "review",
      cta: "call",
    },
  },
  {
    name: "hvac-availability",
    prompt: `Format: VIDEO\nName: Summer Availability\nHeadline: AC out? We have same-day slots left this week.\nBody: Factory-certified technicians, fully stocked vans. Book a time online and we'll confirm within the hour.\nVisual: Technician working on a rooftop condenser unit, no presenter, cuts straight to the work.`,
    gold: {
      hook: "problem",
      visual: "work",
      pacing: "immediate",
      offer: "availability",
      proof: "credential",
      cta: "book",
    },
  },
];

const COPY_BRIEFS = [
  `Offer: Roof inspection and repair for homeowners in Mesa, Arizona, after monsoon storm damage. Audience: homeowners aged 35-65 with a roof over 10 years old. Platform: Meta.`,
  `Offer: Full HVAC system replacement with financing available. Audience: homeowners whose unit is over 12 years old. Platform: Meta.`,
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

interface Row {
  suite: string;
  caseKey: string;
  scores: Record<string, Score>;
}

function line(r: Row): string {
  const parts = Object.entries(r.scores).map(
    ([k, s]) => `${k} ${s.score.toFixed(2)}${s.score < 1 ? ` (${s.detail})` : ""}`,
  );
  return `  ${r.caseKey.padEnd(26)} ${parts.join("  ")}`;
}

async function main() {
  const rows: Row[] = [];

  console.log(`\nLive evals against ${MODEL}\n${"=".repeat(60)}`);

  // --- Qualifier -----------------------------------------------------------
  console.log("\nqualifier");
  const qualifierSystem = agentPrompt("lead-qualifier") + JSON_INSTRUCTION;
  for (const [i, lead] of LEADS.entries()) {
    const reply = await ask(qualifierSystem, lead, 700);
    const parsed = parseScore(reply);
    const row: Row = {
      suite: "qualifier",
      caseKey: `lead-${i + 1}`,
      scores: {
        schema: schemaCompliance(parsed as unknown as Record<string, unknown>, QUALIFIER_REQUIRED),
        coherence: tierCoherence(parsed),
      },
    };
    rows.push(row);
    console.log(line(row));
  }

  // --- Creative coder ------------------------------------------------------
  console.log("\ncoder");
  for (const c of CREATIVES) {
    const reply = await ask(coderInstruction(), c.prompt, 400);
    const { coding, raw } = parseCoding(reply);
    const row: Row = {
      suite: "coder",
      caseKey: c.name,
      scores: {
        vocabulary: vocabularyCompliance(raw),
        agreement: agreement(coding, c.gold),
        completeness: completeness(coding),
      },
    };
    rows.push(row);
    console.log(line(row));
  }

  // --- Ad copy -------------------------------------------------------------
  console.log("\ncopy");
  const copySystem = agentPrompt("ad-copy-copilot");
  for (const [i, brief] of COPY_BRIEFS.entries()) {
    const reply = await ask(copySystem, brief, 1500);
    const row: Row = {
      suite: "copy",
      caseKey: `brief-${i + 1}`,
      scores: {
        noFabricatedStats: noFabricatedStats(reply),
        noFakeTestimonial: noFakeTestimonial(reply),
      },
    };
    rows.push(row);
    console.log(line(row));
    if (row.scores.noFabricatedStats.score < 1) {
      // Printed in full because this is the failure worth acting on, and the
      // offending sentence is what turns it into a prompt fix.
      console.log(`\n--- ${row.caseKey} output ---\n${reply}\n---\n`);
    }
  }

  // --- Verdict -------------------------------------------------------------
  const failed = rows.filter((r) => Object.values(r.scores).some((s) => s.score < 1));
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${rows.length - failed.length}/${rows.length} cases clean.`);

  if (failed.length > 0) {
    console.log(
      "\nPromote what this caught into src/lib/evals/fixtures.ts as a permanent case,\n" +
        "then fix the prompt. Do not raise baselines.json to make it pass.",
    );
  }

  // A live failure is information, not a broken build — the exit code stays 0
  // so this can be run against production prompts without a red pipeline
  // being the thing that gets somebody's attention.
  process.exit(0);
}

main().catch((err) => {
  console.error("[evals] failed:", err);
  process.exit(1);
});
