/**
 * Embeddings.
 *
 * ANTHROPIC DOES NOT HAVE AN EMBEDDINGS API
 *   Worth stating at the top, because it is the single easiest thing to get
 *   wrong here. The Anthropic SDK exposes `messages` and `completions` and
 *   nothing else — there is no `anthropic.embeddings.create`. Code written
 *   against one would typecheck against `any` and fail at runtime on the first
 *   real call, which is exactly the kind of bug that ships.
 *
 *   Voyage is the provider Anthropic points at for this, and it is what
 *   `VOYAGE_API_KEY` selects below. It is deliberately behind an interface: the
 *   embedding provider is the one component here most likely to be swapped,
 *   and every other file in this directory should be able to ignore that.
 *
 * DEGRADING HONESTLY
 *   With no key configured there is still a provider — a deterministic local
 *   one — so the system installs, the tests run, and retrieval works
 *   lexically. What it must never do is pretend the local vectors are
 *   semantic. They are a hash. `provider().semantic` is false, retrieval drops
 *   the vector half of the fusion entirely rather than fusing noise into the
 *   ranking, and `/api/health` reports which one is live.
 *
 *   That is the same posture as the mail transport: work without the key, be
 *   loud about what is missing, never quietly serve a worse answer as though
 *   it were the real one.
 */

/**
 * Pinned, and asserted against whatever the provider actually returns.
 *
 * The column is `vector(1024)`. A provider quietly changing its default output
 * size — or a config change selecting a different model — writes rows that
 * either fail the insert or, worse, land in a mixed-dimension index where
 * distances mean nothing. Better to fail on the first call with a clear
 * message than to slowly poison the index.
 */
export const EMBEDDING_DIM = 1024;

export interface EmbeddingProvider {
  /** Recorded on every row. Queries filter on it — see the note in the schema. */
  model: string;
  /**
   * False for the local fallback. Retrieval reads this and refuses to fuse
   * non-semantic vectors into a ranking rather than degrading quality
   * invisibly.
   */
  semantic: boolean;
  /** Batched. Order out matches order in. */
  embed(texts: string[]): Promise<number[][]>;
}

/** Cosine similarity is only the dot product when both sides are unit length. */
export function normalise(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const len = Math.sqrt(sum);
  // A zero vector has no direction. Returning it unchanged keeps the caller
  // from dividing by zero and producing NaNs that poison every later distance.
  if (len === 0 || !Number.isFinite(len)) return v.slice();
  return v.map((x) => x / len);
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Cannot compare vectors of different sizes (${a.length} vs ${b.length})`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * The local provider: deterministic, offline, and not semantic.
 *
 * Exists so the schema installs, the suite runs and the console works on a
 * deploy with no embedding key — the same reason the notification layer has a
 * mailto fallback. It hashes character trigrams into a fixed number of buckets,
 * which means identical text embeds identically and near-identical text embeds
 * closely, and that is the entire extent of it. Paraphrase gets nothing.
 *
 * `semantic: false` is the important field on this object. Everything
 * downstream branches on it.
 */
export function localProvider(): EmbeddingProvider {
  return {
    model: "local-trigram-v1",
    semantic: false,
    async embed(texts: string[]) {
      return texts.map((text) => {
        const v = new Array<number>(EMBEDDING_DIM).fill(0);
        const clean = text.toLowerCase().replace(/\s+/g, " ").trim();
        for (let i = 0; i < clean.length - 2; i++) {
          const gram = clean.slice(i, i + 3);
          // FNV-1a. Cheap, well-spread, and stable across processes — which
          // matters, because a hash that varied by run would make every stored
          // vector unusable after a restart.
          let h = 0x811c9dc5;
          for (let j = 0; j < gram.length; j++) {
            h ^= gram.charCodeAt(j);
            h = Math.imul(h, 0x01000193) >>> 0;
          }
          v[h % EMBEDDING_DIM]! += 1;
        }
        return normalise(v);
      });
    },
  };
}

/**
 * Voyage. The real one.
 *
 * `input_type` matters and is easy to miss: Voyage embeds a query and a
 * document differently, and using the same setting for both measurably costs
 * recall. `embedDocuments` and `embedQuery` below exist so callers cannot get
 * that wrong by accident.
 */
export function voyageProvider(apiKey: string, model = "voyage-3"): EmbeddingProvider {
  async function call(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: texts,
        input_type: inputType,
        output_dimension: EMBEDDING_DIM,
      }),
    });

    if (!res.ok) {
      throw new Error(`Voyage returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }

    const body = (await res.json()) as { data?: { index: number; embedding: number[] }[] };
    if (!body.data || body.data.length !== texts.length) {
      throw new Error(`Voyage returned ${body.data?.length ?? 0} vectors for ${texts.length} inputs`);
    }

    // Order is documented but not free — sort by the index the API returns
    // rather than trusting array position, because a mismatched pairing here
    // attaches every embedding to the wrong text and nothing downstream can
    // detect it.
    const out = new Array<number[]>(texts.length);
    for (const row of body.data) {
      if (row.embedding.length !== EMBEDDING_DIM) {
        throw new Error(
          `Voyage returned ${row.embedding.length} dimensions, but the column is ${EMBEDDING_DIM}. ` +
            `Re-embed everything or change EMBEDDING_DIM — a mixed-dimension index returns meaningless distances.`,
        );
      }
      out[row.index] = normalise(row.embedding);
    }
    return out;
  }

  return {
    model: `voyage:${model}`,
    semantic: true,
    embed: (texts) => call(texts, "document"),
  };
}

let _provider: EmbeddingProvider | null = null;

/** The live provider. Voyage when a key is set, the local hash otherwise. */
export function provider(): EmbeddingProvider {
  if (_provider) return _provider;
  const key = process.env.VOYAGE_API_KEY;
  _provider = key ? voyageProvider(key) : localProvider();
  return _provider;
}

/** Tests only — the module-level cache would otherwise outlive an env change. */
export function resetProvider(): void {
  _provider = null;
}

/**
 * Voyage caps a request by both count and total tokens. Batching at 96 keeps
 * well inside the count limit; a whole backfill posted as one array is the
 * obvious thing to write and the thing that 413s in production.
 */
const BATCH = 96;

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const p = provider();
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    out.push(...(await p.embed(texts.slice(i, i + BATCH))));
  }
  return out;
}

export async function embedQuery(text: string): Promise<number[]> {
  const p = provider();
  // Voyage distinguishes query from document embeddings; the local provider
  // has no such notion and ignores it.
  if (p.semantic && process.env.VOYAGE_API_KEY) {
    const [v] = await voyageQuery(process.env.VOYAGE_API_KEY, text);
    return v!;
  }
  const [v] = await p.embed([text]);
  return v!;
}

async function voyageQuery(apiKey: string, text: string): Promise<number[][]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "voyage-3",
      input: [text],
      input_type: "query",
      output_dimension: EMBEDDING_DIM,
    }),
  });
  if (!res.ok) throw new Error(`Voyage returned ${res.status}`);
  const body = (await res.json()) as { data: { embedding: number[] }[] };
  return body.data.map((d) => normalise(d.embedding));
}

/** Postgres vector literal. `[0.1,0.2,…]`, which is what pgvector parses. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}
