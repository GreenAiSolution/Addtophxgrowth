import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

let _client: Anthropic | null = null;

/**
 * Server-only Anthropic client. NEVER import this into a client component —
 * the API key must never reach the browser. All calls flow through
 * /api/agents/[agentSlug]/run route handlers.
 */
export function anthropic(): Anthropic {
  if (typeof window !== "undefined") {
    throw new Error("Anthropic client must never be used in the browser");
  }
  if (!_client) {
    _client = new Anthropic({ apiKey: env.anthropicKey });
  }
  return _client;
}

export const ANTHROPIC_MODEL = env.anthropicModel;
