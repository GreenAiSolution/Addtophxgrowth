/**
 * Is the database actually carrying the schema this code expects?
 *
 * WHY IT IS ITS OWN QUESTION
 *   "Is DATABASE_URL set" and "does the table exist" are different failures
 *   with the same symptom: a 500 on a page nobody happened to open. The gate
 *   turned that from untidy into unacceptable — a queue whose whole job is to
 *   hold a client's invoices, backed by a table that was never created, holds
 *   nothing and says nothing.
 *
 *   So the answer is one request away, and it is a live probe rather than a
 *   guess from environment variables. A DATABASE_URL that points at a database
 *   nobody ever pushed to looks perfectly healthy from the outside.
 *
 * NEVER THROWS
 *   Called from `/api/health`, which has to answer on a box with no database
 *   at all. Every failure mode resolves to a reason string.
 */

import { prisma } from "@/lib/prisma";
import { provider, EMBEDDING_DIM } from "@/lib/embeddings";

export type DbState = "ready" | "schema-missing" | "unreachable" | "not-configured";

export interface DbHealth {
  state: DbState;
  /** True only when a query against the gate's own table succeeded. */
  gateReady: boolean;
  /** What to do about it, in plain English. Absent when there is nothing to do. */
  fix?: string;
  /**
   * The retrieval layer, reported separately because it fails differently.
   *
   * `ready` here means the Embedding table answered. `semantic` means an
   * embedding key is configured — and the two are independent: a perfectly
   * healthy index with no key still only does keyword search, which is a
   * working system giving materially worse answers. Reporting one number for
   * both would hide exactly the case worth knowing about.
   */
  retrieval: {
    ready: boolean;
    semantic: boolean;
    model: string;
    dimensions: number;
    indexed: number | null;
    fix?: string;
  };
}

/** The embedding half, which is knowable without touching the database. */
function retrievalConfig() {
  const p = provider();
  return {
    semantic: p.semantic,
    model: p.model,
    dimensions: EMBEDDING_DIM,
    fix: p.semantic
      ? undefined
      : "Set VOYAGE_API_KEY for semantic recall. Anthropic has no embeddings API, so this uses Voyage. Without it search still works, by keyword only.",
  };
}

export async function checkDb(): Promise<DbHealth> {
  const cfg = retrievalConfig();

  if (!process.env.DATABASE_URL) {
    return {
      state: "not-configured",
      gateReady: false,
      fix: "Set DATABASE_URL. The public site and the enquiry form work without it; the console and the gate do not.",
      retrieval: { ready: false, indexed: null, ...cfg },
    };
  }

  try {
    // The gate's own table, not a generic `SELECT 1`. A connection that works
    // proves the credential, not the schema — and the schema is the thing that
    // has actually been missing.
    await prisma.pendingAction.count();
    // Counted separately: the gate's table can exist while the embedding
    // table does not, and vice versa. One probe reporting for both would
    // make a half-installed schema look whole.
    let indexed: number | null = null;
    let retrievalReady = false;
    try {
      indexed = await prisma.embedding.count();
      retrievalReady = true;
    } catch {
      retrievalReady = false;
    }
    return {
      state: "ready",
      gateReady: true,
      retrieval: { ready: retrievalReady, indexed, ...cfg },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);

    // P2021 = table does not exist. P1001/P1017 = cannot reach the database.
    // Matched on the text too, because the error surfaces differently
    // depending on whether it comes from the query engine or the connector.
    const missing =
      message.includes("P2021") ||
      /does not exist in the current database|relation .* does not exist/i.test(message);

    if (missing) {
      return {
        state: "schema-missing",
        gateReady: false,
        fix: "The database is reachable but has no PendingAction table. Redeploy — the build runs `db-sync` — or run `pnpm prisma:push` by hand.",
        retrieval: { ready: false, indexed: null, ...cfg },
      };
    }

    return {
      state: "unreachable",
      gateReady: false,
      fix: "The database did not answer. Check DATABASE_URL and that the host allows connections from Vercel.",
      retrieval: { ready: false, indexed: null, ...cfg },
    };
  }
}
