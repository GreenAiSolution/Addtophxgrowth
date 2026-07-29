#!/usr/bin/env node
/**
 * Bring the database up to the schema, at deploy time.
 *
 * WHY THIS EXISTS
 *   `prisma db push` had never been run against production. Every feature that
 *   added a table shipped its code and left its schema behind, so the console
 *   was carrying models that existed in the repo and not in Postgres — and the
 *   only signal was a 500 on a page nobody visited. The gate made that
 *   unacceptable rather than merely untidy: its whole job is to hold a client's
 *   invoices, and a queue backed by a missing table holds nothing.
 *
 *   Asking a human to remember a manual step before every deploy is not a fix.
 *   This runs on every build instead.
 *
 * WHY IT NEVER FAILS THE BUILD
 *   The marketing site and the enquiry form touch no database at all. Failing
 *   the whole deploy because Postgres was briefly unreachable would take the
 *   live, revenue-carrying half of the site down to protect a dormant console —
 *   exactly the wrong trade.
 *
 *   So: loud on failure, exit 0 regardless. `/api/health` reports whether the
 *   sync actually landed, which is a better signal than a red build anyway
 *   because it stays true between deploys.
 *
 * WHY `db push` AND NOT `migrate deploy`
 *   There is no migration history in this repo — it has only ever been pushed.
 *   `migrate deploy` against a populated database with no baseline fails, and
 *   creating that baseline needs a connection nobody has from CI yet. `db push`
 *   is additive and idempotent, and without `--accept-data-loss` it refuses
 *   rather than dropping anything, which is the behaviour we want unattended.
 *
 *   Moving to real migrations is worth doing and is its own piece of work.
 */

import { spawnSync } from "node:child_process";

const url = process.env.DATABASE_URL;

if (!url) {
  // The expected case for a preview build or a local `next build` with no
  // secrets. Not a warning — there is nothing wrong.
  console.log("[db-sync] No DATABASE_URL. Skipping schema sync.");
  process.exit(0);
}

console.log("[db-sync] Syncing schema to the database…");

const res = spawnSync(
  "npx",
  ["prisma", "db", "push", "--skip-generate"],
  { stdio: "inherit", env: process.env },
);

if (res.status === 0) {
  console.log("[db-sync] Schema is up to date.");

  /*
    Indexes Prisma cannot express.

    `Unsupported("vector(1024)")` creates the column and stops. There is no way
    to declare an HNSW index in the schema language, so without this step
    similarity search silently degrades to a sequential scan over every
    embedding a client owns — correct answers, quietly getting slower, which is
    the worst shape of performance bug because nothing ever errors.

    Separate from the push and non-fatal for the same reason the push is: a
    missing index is a slow console, not a broken website.
  */
  const sql = spawnSync(
    "npx",
    ["prisma", "db", "execute", "--file", "prisma/sql/retrieval.sql", "--schema", "prisma/schema.prisma"],
    { stdio: "inherit", env: process.env },
  );
  console.log(
    sql.status === 0
      ? "[db-sync] Retrieval indexes are in place."
      : "[db-sync] WARNING: retrieval indexes could not be applied. Search will work and be slow.",
  );

  process.exit(0);
}

console.error(
  [
    "",
    "  ┌─────────────────────────────────────────────────────────────────┐",
    "  │  SCHEMA SYNC FAILED — the build continues, the console will not │",
    "  └─────────────────────────────────────────────────────────────────┘",
    "",
    "  The site will deploy and the public pages will work. Anything that",
    "  reads the database — the client console, and the gate that holds",
    "  automation actions — will not.",
    "",
    "  Check /api/health after this deploy: it reports whether the gate's",
    "  table is actually reachable.",
    "",
    "  Most likely causes:",
    "    - DATABASE_URL is unreachable from the build environment",
    "    - the change would drop data, so push refused it (correctly)",
    "",
  ].join("\n"),
);

// Deliberately zero. See the note above.
process.exit(0);
