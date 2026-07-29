/**
 * RETRIEVAL.
 *
 * DIRECTION
 *   The memory this system already had was statistical: enough closed deals
 *   and it can tell a client that leads scoring above seventy close at some
 *   rate. Useful, and blind to everything that is not a number. It cannot
 *   answer the question an owner actually asks, which is "have we seen this
 *   before?" — because that question is about resemblance, and resemblance
 *   lives in the words.
 *
 *   So: an index over the things a client owns, searchable by meaning.
 *
 * WHY HYBRID AND NOT JUST VECTORS
 *   Pure vector search is very good at paraphrase and quietly terrible at
 *   exact terms. "Trane XR16", a postcode, a surname, an invoice number — the
 *   embedding smears all of them toward the general neighbourhood of their
 *   type, and a search for one model number cheerfully returns a different
 *   model number as the top hit. Lexical search has the mirror problem: it
 *   nails the identifier and misses every way of saying the same thing in
 *   different words.
 *
 *   Both halves run, and Reciprocal Rank Fusion combines them. RRF rather than
 *   a weighted score blend because the two halves produce scores on
 *   incomparable scales — a cosine distance and a `ts_rank_cd` are not
 *   commensurable, and any constant chosen to blend them is a constant tuned
 *   on one dataset that silently stops being right on the next. RRF only ever
 *   reads *rank*, which is the part that means the same thing in both systems.
 *
 * BLUEPRINTS
 *   Everything that decides the ranking is pure and tested: `chunk`, `rrf`,
 *   `mmr`, `fuse`. Only `indexSource` and `search` touch the database. The
 *   ranking is the part most likely to be wrong in a way nobody notices, so it
 *   is the part that must be testable without a Postgres.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  provider,
  embedDocuments,
  embedQuery,
  toVectorLiteral,
  cosine,
} from "@/lib/embeddings";

export type SourceType = "LEAD" | "MEMORY" | "CONVERSATION" | "DOCUMENT";

export interface Chunk {
  index: number;
  text: string;
}

/**
 * Split text for embedding.
 *
 * An embedding is a fixed-size summary, so the longer the text the more it
 * averages away — a whole transcript in one vector is a vector that means
 * "a transcript". Chunking keeps each vector about one thing.
 *
 * Overlap exists because the alternative is losing whatever straddles a
 * boundary. A sentence split down the middle produces two chunks that each
 * half-say something and neither of which matches a search for it.
 */
export function chunk(text: string, size = 900, overlap = 150): Chunk[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= size) return [{ index: 0, text: clean }];

  if (overlap >= size) {
    throw new Error("Overlap must be smaller than the chunk size, or this never advances.");
  }

  const out: Chunk[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);

    // Prefer to break at a sentence, then at a word, rather than mid-token.
    if (end < clean.length) {
      const window = clean.slice(start, end);
      const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
      const word = window.lastIndexOf(" ");
      // Only honour a break in the back half — a break at character 12 of a
      // 900-character window makes a chunk of nothing and defeats the point.
      if (sentence > size * 0.5) end = start + sentence + 1;
      else if (word > size * 0.5) end = start + word;
    }

    out.push({ index: out.length, text: clean.slice(start, end).trim() });
    if (end >= clean.length) break;

    /*
      Forward progress, unconditionally.

      `start = end - overlap` is the obvious line and it hangs. The break-point
      search above can pull `end` back toward `start` — a word boundary at 195
      of a 200-character window with 199 of overlap puts the next start four
      characters *behind* this one, and the loop walks backwards until the
      process dies. It is not a slow chunker; it never returns.

      When the overlap cannot be honoured without going backwards, the chunk
      simply does not overlap. Losing the overlap on one boundary costs a
      little recall there; the alternative costs the whole process.
    */
    const next = end - overlap;
    start = next > start ? next : end;
  }
  return out;
}

export interface Ranked {
  id: string;
  rank: number;
}

/**
 * Reciprocal Rank Fusion.
 *
 * score(d) = Σ 1 / (k + rank(d)) over every list d appears in.
 *
 * `k` damps the top of each list. At k=0 the first result of any single list
 * would dominate everything; at 60 — the value from the original paper and the
 * one that has held up across a lot of subsequent work — a document has to do
 * well in more than one list to beat a document that did well in one.
 */
export function rrf(lists: Ranked[][], k = 60): { id: string; score: number }[] {
  const scores = new Map<string, number>();
  for (const list of lists) {
    for (const { id, rank } of list) {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
    }
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    // Ties broken by id so the order is stable. An unstable sort here makes
    // results flicker between identical queries, which reads as a bug even
    // when the ranking is correct.
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export interface MmrCandidate {
  id: string;
  vector: number[];
}

/**
 * Maximal Marginal Relevance — pick results that are relevant *and* different.
 *
 * Straight top-k over similarity has a failure mode that looks like success:
 * five results, all excellent, all the same thing said five ways. For "have we
 * seen this before?" that is the worst possible answer, because it hides the
 * variety that makes the answer useful.
 *
 * `lambda` trades relevance against diversity. 1 is pure relevance, 0 is pure
 * spread; 0.7 keeps relevance in charge while refusing near-duplicates.
 */
export function mmr(
  candidates: MmrCandidate[],
  queryVector: number[],
  n: number,
  lambda = 0.7,
): string[] {
  if (candidates.length === 0 || n <= 0) return [];

  const relevance = new Map(candidates.map((c) => [c.id, cosine(queryVector, c.vector)]));
  const picked: MmrCandidate[] = [];
  const pool = [...candidates];

  while (picked.length < Math.min(n, candidates.length) && pool.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < pool.length; i++) {
      const c = pool[i]!;
      const rel = relevance.get(c.id) ?? 0;
      // How close this is to something already chosen.
      let maxSim = 0;
      for (const p of picked) {
        const sim = cosine(c.vector, p.vector);
        if (sim > maxSim) maxSim = sim;
      }
      const score = lambda * rel - (1 - lambda) * maxSim;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    picked.push(pool[bestIdx]!);
    pool.splice(bestIdx, 1);
  }

  return picked.map((p) => p.id);
}

export interface SearchHit {
  id: string;
  sourceType: string;
  sourceId: string;
  content: string;
  meta: unknown;
  score: number;
  /** Which half found it — useful for explaining a result, and for debugging. */
  via: ("vector" | "lexical")[];
}

export interface SearchOptions {
  limit?: number;
  sourceTypes?: SourceType[];
  /** Over-fetch per half before fusing. Fusion needs depth to work with. */
  candidates?: number;
  /** 1 is pure relevance, 0 is pure diversity. */
  lambda?: number;
}

// ---------------------------------------------------------------------------
// Everything below here touches the database.
// ---------------------------------------------------------------------------

/**
 * Index one source. Idempotent per (client, source, chunk, model).
 *
 * Re-indexing replaces that source's chunks rather than adding to them —
 * otherwise editing a lead leaves the old text in the index forever, and a
 * search returns a version of the record that no longer exists.
 */
export async function indexSource(input: {
  clientId: string;
  sourceType: SourceType;
  sourceId: string;
  text: string;
  meta?: Record<string, unknown>;
}): Promise<number> {
  const p = provider();
  const chunks = chunk(input.text);
  if (chunks.length === 0) return 0;

  const vectors = await embedDocuments(chunks.map((c) => c.text));

  // Delete-then-insert for this source and model only. Scoped by clientId like
  // everything else — a re-index must never be able to clear another tenant's
  // rows even if a sourceId collided.
  await prisma.$executeRaw`
    DELETE FROM "Embedding"
    WHERE "clientId" = ${input.clientId}
      AND "sourceType" = ${input.sourceType}
      AND "sourceId" = ${input.sourceId}
      AND "model" = ${p.model}
  `;

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!;
    const vec = toVectorLiteral(vectors[i]!);
    // Raw because pgvector's type is invisible to the Prisma client, and the
    // tsvector is computed here rather than by a trigger — one fewer piece of
    // database state that can fall out of step with the row.
    await prisma.$executeRaw`
      INSERT INTO "Embedding"
        ("id", "clientId", "sourceType", "sourceId", "chunkIndex", "content", "meta", "model", "embedding", "tsv", "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid()::text,
        ${input.clientId},
        ${input.sourceType},
        ${input.sourceId},
        ${c.index},
        ${c.text},
        ${JSON.stringify(input.meta ?? {})}::jsonb,
        ${p.model},
        ${vec}::vector,
        to_tsvector('english', ${c.text}),
        now(), now()
      )
    `;
  }

  return chunks.length;
}

/**
 * Hybrid search, scoped to one tenant.
 *
 * `clientId` is the first parameter and is not optional. Every query below
 * filters on it. A vector index that can return one client's leads to another
 * is a catastrophic product failure *and* an invisible one — the results look
 * plausible, because they are real records — so the scoping is structural
 * rather than a filter somebody remembers to add.
 */
export async function search(
  clientId: string,
  query: string,
  opts: SearchOptions = {},
): Promise<SearchHit[]> {
  const limit = opts.limit ?? 8;
  const depth = opts.candidates ?? Math.max(30, limit * 4);
  const p = provider();

  if (!clientId) throw new Error("Retrieval is always tenant-scoped. Refusing an unscoped search.");
  if (!query.trim()) return [];

  const types = opts.sourceTypes ?? null;

  // ---- lexical half ----
  const lexical = await prisma.$queryRaw<{ id: string; rank: number }[]>`
    SELECT "id", ts_rank_cd("tsv", plainto_tsquery('english', ${query})) AS rank
    FROM "Embedding"
    WHERE "clientId" = ${clientId}
      AND "model" = ${p.model}
      AND "tsv" @@ plainto_tsquery('english', ${query})
      ${types ? Prisma.sql`AND "sourceType" = ANY(${types})` : Prisma.empty}
    ORDER BY rank DESC
    LIMIT ${depth}
  `;

  // ---- vector half ----
  //
  // Skipped entirely when the provider is the local hash. Fusing non-semantic
  // vectors into the ranking would make results *worse* than lexical alone
  // while looking like a working semantic search, which is the one outcome
  // worth avoiding more than having no vectors at all.
  let vector: { id: string; distance: number }[] = [];
  if (p.semantic) {
    const qv = toVectorLiteral(await embedQuery(query));
    vector = await prisma.$queryRaw<{ id: string; distance: number }[]>`
      SELECT "id", ("embedding" <=> ${qv}::vector) AS distance
      FROM "Embedding"
      WHERE "clientId" = ${clientId}
        AND "model" = ${p.model}
        AND "embedding" IS NOT NULL
        ${types ? Prisma.sql`AND "sourceType" = ANY(${types})` : Prisma.empty}
      ORDER BY "embedding" <=> ${qv}::vector
      LIMIT ${depth}
    `;
  }

  const fused = rrf([
    vector.map((r, i) => ({ id: r.id, rank: i + 1 })),
    lexical.map((r, i) => ({ id: r.id, rank: i + 1 })),
  ]);
  if (fused.length === 0) return [];

  const ids = fused.slice(0, depth).map((f) => f.id);
  const rows = await prisma.embedding.findMany({
    // clientId again, deliberately. The ids came from a scoped query, but a
    // hydration step that trusts ids is one refactor away from being the hole.
    where: { id: { in: ids }, clientId },
    select: { id: true, sourceType: true, sourceId: true, content: true, meta: true },
  });

  const byId = new Map(rows.map((r) => [r.id, r]));
  const viaVector = new Set(vector.map((v) => v.id));
  const viaLexical = new Set(lexical.map((l) => l.id));

  return fused
    .filter((f) => byId.has(f.id))
    .slice(0, limit)
    .map((f) => {
      const row = byId.get(f.id)!;
      const via: ("vector" | "lexical")[] = [];
      if (viaVector.has(f.id)) via.push("vector");
      if (viaLexical.has(f.id)) via.push("lexical");
      return { ...row, score: f.score, via };
    });
}
