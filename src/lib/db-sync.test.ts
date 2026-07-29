import { describe, expect, it } from "vitest";

/**
 * The schema has to install itself.
 *
 * `prisma db push` had never been run against production. Every feature that
 * added a table shipped its code and left its schema behind, and the only
 * symptom was a 500 on a page nobody happened to open. The gate made that
 * intolerable: a queue whose job is to hold a client's invoices, backed by a
 * table nobody created, holds nothing and says nothing.
 *
 * The fix is a build step, so there is no human step to forget. These tests
 * are what stop somebody quietly removing it — a deploy that silently stops
 * syncing looks identical to one that never needed to.
 */

async function pkg(): Promise<{ scripts: Record<string, string> }> {
  const { readFile } = await import("node:fs/promises");
  return JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
}

async function syncScript(): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL("../../scripts/db-sync.mjs", import.meta.url), "utf8");
}

describe("the database is brought up to the schema on every deploy", () => {
  it("runs the sync as part of the build", async () => {
    const { scripts } = await pkg();
    expect(scripts.build, "the build no longer syncs the schema").toContain("db-sync.mjs");
    // Before next build, so a deploy cannot serve pages against a schema the
    // code has already moved past.
    expect(scripts.build.indexOf("db-sync.mjs")).toBeLessThan(scripts.build.indexOf("next build"));
  });

  it("never fails the build", async () => {
    /*
      The marketing site and the enquiry form touch no database. Failing a
      whole deploy because Postgres was briefly unreachable would take the
      live, revenue-carrying half of the site down to protect a dormant
      console — the wrong trade, and the reason this exits zero on failure.
    */
    const src = await syncScript();
    expect(src, "the sync can fail a deploy").not.toMatch(/process\.exit\([1-9]/);
    expect(src).toMatch(/process\.exit\(0\)/);
  });

  it("refuses to drop anything unattended", async () => {
    /*
      `--accept-data-loss` would let an unattended build discard a column
      because a schema edit implied it. Push must refuse instead.

      Read from the argument list, not the file text. A whole-file `not.toContain`
      failed on this file's own doc comment explaining why the flag is absent —
      a check that cannot tell an argument from a sentence about an argument
      would also have to be silenced the first time somebody documented it.
    */
    const src = await syncScript();
    const args = src.match(/\[\s*"prisma"[^\]]*\]/s);
    expect(args, "cannot find the prisma argument list").not.toBeNull();
    expect(args![0], "the unattended sync accepts data loss").not.toContain("accept-data-loss");
    expect(args![0]).toContain('"push"');
  });

  it("does nothing at all without a database", async () => {
    // Local builds and previews have no DATABASE_URL and must stay silent —
    // a warning nobody can act on trains people to ignore the log.
    const src = await syncScript();
    expect(src).toMatch(/DATABASE_URL/);
    expect(src).toMatch(/Skipping schema sync/);
  });
});

describe("whether it worked is one request away", () => {
  it("probes the gate's own table rather than the connection", async () => {
    // A DATABASE_URL pointing at a database nobody ever pushed to answers a
    // generic `SELECT 1` perfectly happily and holds no invoices at all. The
    // probe has to touch the table that has actually been missing.
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(new URL("./db-health.ts", import.meta.url), "utf8");
    expect(src).toMatch(/prisma\.pendingAction/);
  });

  it("reports the gate on /api/health without changing the status code", async () => {
    /*
      The public pages and the enquiry form touch no database, so a missing
      schema is not a reason to tell the world the site is down.
      `enquiriesReachAHuman` keeps ownership of the 503 — that one really does
      mean nobody can reach us.
    */
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(
      new URL("../app/api/health/route.ts", import.meta.url),
      "utf8",
    );
    // Anchored to the start of the property, not a bare substring. `/gate:\s*\{/`
    // was the first attempt and it matched `notgate: {` perfectly happily, so
    // renaming the key out of the response left the check green.
    expect(src, "health does not report the gate at all").toMatch(/^\s*gate:\s*\{/m);
    expect(src).toMatch(/checkDb/);
    // The status expression must still depend only on delivery.
    expect(src).toMatch(/status:\s*healthy\s*\?\s*200\s*:\s*503/);
  });

  it("tells a person what to do rather than printing a Prisma code", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(new URL("./db-health.ts", import.meta.url), "utf8");
    for (const state of ["not-configured", "schema-missing", "unreachable"]) {
      expect(src, `${state} has no fix line`).toContain(state);
    }
    expect(src).toMatch(/prisma:push|Redeploy/);
  });
});

describe("the surfaces fail legibly instead of throwing", () => {
  it("shows the queue's failure on the queue", async () => {
    /*
      An unguarded query here renders the framework's error page. "Something
      went wrong" on the screen whose entire job is to prove a client can see
      what an automation is about to do is close to the worst possible
      failure, because it looks exactly like the automation hiding something.
    */
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(
      new URL("../app/app/gate/page.tsx", import.meta.url),
      "utf8",
    );
    expect(src, "the queue page has no guard around its reads").toMatch(/catch\s*\{/);
    expect(src).toMatch(/dbError/);
    // And it has to say the important part: nothing went out unreviewed.
    expect(src).toMatch(/nothing has\s*\n?\s*"?\s*\+?\s*"?gone out unreviewed|gone out unreviewed/);
  });

  it("makes the sweep's failure diagnosable at a glance", async () => {
    // "relation does not exist" every five minutes in a cron log is a worse
    // diagnostic than a sentence naming the fix.
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(
      new URL("../app/api/cron/gate/route.ts", import.meta.url),
      "utf8",
    );
    expect(src).toMatch(/checkDb/);
    expect(src, "a schema failure still reports as a 500").toMatch(/503/);
  });
});
