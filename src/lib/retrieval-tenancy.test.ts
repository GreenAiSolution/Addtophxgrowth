import { describe, expect, it } from "vitest";
import { search } from "@/lib/retrieval";

/**
 * TENANT ISOLATION IN THE INDEX.
 *
 * Every other table in this schema is scoped by `clientId` and the console
 * resolves the tenant through `lib/tenancy.ts` rather than trusting a request.
 * An embedding index is the one place where getting that wrong is both
 * catastrophic and invisible: a leak returns *real records*, correctly
 * ranked, that simply belong to somebody else. Nothing errors, nothing looks
 * malformed, and the first person to notice is the client reading a
 * competitor's lead notes.
 *
 * A separate vector service would make this hard to check at all — the
 * namespace convention lives in another product, and no test in this
 * repository can see it. Keeping the index in Postgres means the scoping is a
 * WHERE clause in a file, and a file can be read.
 *
 * So it is read. Every raw query in the retrieval path has to name clientId,
 * and the entry point refuses to run without one.
 */

async function retrievalSource(): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL("./retrieval.ts", import.meta.url), "utf8");
}

/**
 * Every `$queryRaw` / `$executeRaw` template in the file, body included.
 *
 * The generic is optional and that mattered: the first version of this pattern
 * required `<...>`, which only the two `$queryRaw` calls carry. Both
 * `$executeRaw` calls — the re-index delete and the insert — were invisible to
 * it, so five assertions passed while the two riskiest statements in the file
 * went unread. The count guard below is what surfaced it.
 */
/** Code only. Prose about a filter is not a filter. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

function rawQueries(src: string): string[] {
  return [...src.matchAll(/\$(?:queryRaw|executeRaw)(?:<[^>]*>)?`([\s\S]*?)`/g)].map((m) => m[1]!);
}

describe("nothing reads the index without saying whose it is", () => {
  it("finds the raw queries at all, so the check is not looking at an empty set", async () => {
    // The failure mode this guards: a regex that silently matches nothing and
    // reports every assertion below as passing.
    const queries = rawQueries(await retrievalSource());
    expect(queries.length, "no raw queries found — the tenancy check is vacuous").toBeGreaterThanOrEqual(3);
  });

  it("scopes every raw query by clientId, in the way that statement can be scoped", async () => {
    /*
      The rule differs by statement, and flattening that was wrong.

      A SELECT or DELETE is scoped by a WHERE clause. An INSERT is scoped by
      writing the tenant into the row — there is no WHERE to put it in. The
      first version of this demanded `"clientId" = ${…}` of everything and
      failed on the insert, which was correctly carrying the tenant all along.

      Both still have to name the tenant. Neither is allowed to be silent
      about it.
    */
    const queries = rawQueries(await retrievalSource());
    for (const q of queries) {
      const label = q.replace(/\s+/g, " ").trim().slice(0, 70);
      if (/^\s*INSERT/i.test(q.trim())) {
        expect(/"clientId"/.test(q), `insert does not record a tenant: ${label}…`).toBe(true);
        expect(
          /\$\{\s*input\.clientId\s*\}/.test(q),
          `insert does not bind the caller's tenant: ${label}…`,
        ).toBe(true);
      } else {
        expect(/"clientId"\s*=\s*\$\{/.test(q), `unscoped read or delete: ${label}…`).toBe(true);
      }
    }
  });

  it("scopes the hydration read too, not just the ranking reads", async () => {
    /*
      The subtle one. The ids handed to the final `findMany` came from queries
      that were already scoped, so filtering again looks redundant — and it is,
      right up until somebody refactors the ranking and the hydration quietly
      becomes the only thing standing between tenants.
    */
    const src = await retrievalSource();
    const hydrate = src.match(/prisma\.embedding\.findMany\(\{[\s\S]*?\}\)/);
    expect(hydrate, "no hydration query found").not.toBeNull();

    /*
      Comments stripped before asserting, and that is not fussiness.

      The first version of this checked the matched block for the string
      "clientId" — and the block opens with a comment explaining why clientId
      is there. Deleting the actual filter left the explanation behind, so the
      check went on passing while describing a scoping that no longer existed.
      A test that reads its own justification is worse than no test.
    */
    const code = stripComments(hydrate![0]);
    // The where clause specifically, bounded by the next key rather than by a
    // brace — `where: { id: { in: ids }, clientId }` nests, and a pattern that
    // stops at the first `}` never reaches the tenant.
    const where = code.slice(code.indexOf("where:"), code.indexOf("select:"));
    expect(where.length, "could not isolate the where clause").toBeGreaterThan(10);
    expect(where, "hydration trusts ids without re-scoping").toContain("clientId");
  });

  it("scopes the delete inside a re-index", async () => {
    // A re-index deletes the old chunks first. Unscoped, a colliding sourceId
    // would let one client's re-index clear another client's rows — a silent
    // data-loss bug rather than a leak, which is arguably worse.
    const src = await retrievalSource();
    const del = rawQueries(src).find((q) => /DELETE\s+FROM\s+"Embedding"/i.test(q));
    expect(del, "no delete found in the re-index path").toBeDefined();
    expect(/"clientId"\s*=\s*\$\{/.test(del!), "the re-index delete is unscoped").toBe(true);
  });

  it("refuses an unscoped search at runtime, before touching the database", async () => {
    // Belt as well as braces. The guard is the first statement in `search`,
    // so this needs no database — and an empty string is exactly what a
    // half-wired caller passes.
    for (const bad of ["", undefined as unknown as string, null as unknown as string]) {
      await expect(search(bad, "anything"), `clientId: ${JSON.stringify(bad)}`).rejects.toThrow(
        /tenant-scoped/i,
      );
    }
  });

  it("takes the tenant as its first argument, never from options", async () => {
    /*
      Structural, not conventional. `search(clientId, query, opts)` cannot be
      called without deciding whose index is being read; a `{ clientId }` field
      on an options bag can be forgotten, and the forgetting typechecks.
    */
    const src = await retrievalSource();
    expect(src).toMatch(/export async function search\(\s*clientId: string,/);
    // And it must not be reachable as an optional field either.
    expect(src).not.toMatch(/clientId\?:/);
  });
});

describe("the index never mixes embedding models", () => {
  it("filters every read and write by model", async () => {
    /*
      Not tenancy, but the same class of silent wrongness. Distances between
      vectors from different models are meaningless numbers — they sort, they
      look like scores, and they rank nonsense. Swapping the provider without
      filtering on model turns the whole index into confident noise.
    */
    const queries = rawQueries(await retrievalSource());
    const reads = queries.filter((q) => /SELECT/i.test(q));
    expect(reads.length).toBeGreaterThanOrEqual(2);
    for (const q of reads) {
      expect(/"model"\s*=\s*\$\{/.test(q), `query ignores the embedding model: ${q.slice(0, 60)}`).toBe(
        true,
      );
    }
  });
});
