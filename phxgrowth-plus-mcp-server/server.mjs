#!/usr/bin/env node
/**
 * PHX Growth Plus — stdio MCP server.
 *
 * WHY THIS EXISTS
 *   `src/app/api/catalogue/route.ts` has named this directory since the day it
 *   shipped, and the README calls the catalogue endpoint "the single source
 *   the MCP server reads". Neither was true — there was no server and no
 *   directory. `src/lib/mcp.test.ts` now fails the build if this file goes
 *   missing again, because a component described in a README and absent from
 *   the repository is the same defect as a price on a page the business does
 *   not charge.
 *
 * WHAT IT IS FOR
 *   Desktop clients that speak stdio rather than HTTP. `/api/mcp` is the same
 *   server over HTTP and is the one to use if the client supports a URL.
 *
 * WHY IT PROXIES RATHER THAN IMPORTING THE CATALOGUE
 *   Because two copies of a price list means one of them is eventually wrong,
 *   and it will be the one somebody quotes. This process holds no prices. It
 *   forwards JSON-RPC to the deployed `/api/mcp` and returns the answer, so a
 *   price change on the site is live here with no reinstall.
 *
 *   The cost is that it needs the site to be reachable. That is the correct
 *   trade for a sales tool: a quote from a stale local copy is worse than no
 *   quote, because nobody finds out until the invoice.
 *
 * NO DEPENDENCIES
 *   Deliberate. Node's own stdin, stdout and fetch are enough for a framed
 *   JSON-RPC proxy, and this file should be runnable with `node server.mjs`
 *   against a clean checkout and no install step.
 *
 * WHY THE URL IS REQUIRED AND NOT DEFAULTED
 *   This repository has already paid for this lesson once. `robots.txt` and
 *   `sitemap.xml` shipped serving `localhost:3000` to Googlebot because a URL
 *   had a plausible default instead of a real one, and the recorded conclusion
 *   in the README is that `siteUrl` "must never borrow anything". A baked-in
 *   guess at this property's domain would be the same mistake, and it would
 *   fail the same way: not loudly, but by quietly talking to the wrong place.
 *
 * USAGE
 *   PHX_MCP_URL=https://<the-deployed-site>/api/mcp node server.mjs
 *   PHX_MCP_URL=http://localhost:3000/api/mcp     node server.mjs
 */

const ENDPOINT = process.env.PHX_MCP_URL;

if (!ENDPOINT) {
  process.stderr.write(
    "PHX_MCP_URL is not set.\n" +
      "Point it at the deployed catalogue endpoint, e.g.\n" +
      "  PHX_MCP_URL=https://<the-deployed-site>/api/mcp node server.mjs\n",
  );
  process.exit(1);
}

const TIMEOUT_MS = Number(process.env.PHX_MCP_TIMEOUT_MS ?? 10_000);

/** Write one JSON-RPC message, newline-delimited. */
function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function errorFor(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

async function forward(message) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
      signal: controller.signal,
    });

    // 202 is a notification acknowledgement — no body, and nothing to write
    // back to the client. Answering it anyway is a protocol violation some
    // clients drop the connection over.
    if (res.status === 202) return null;

    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch (err) {
    // A network failure must come back as a JSON-RPC error, not as a dead
    // process. The client is a conversation somebody is having; losing the
    // server mid-sentence is worse than being told the site is unreachable.
    const reason = err?.name === "AbortError" ? `timed out after ${TIMEOUT_MS}ms` : String(err?.message ?? err);
    return errorFor(message?.id, -32603, `Could not reach ${ENDPOINT}: ${reason}`);
  } finally {
    clearTimeout(timer);
  }
}

let buffer = "";

/**
 * In-flight forwards.
 *
 * WHY THIS EXISTS
 *   The first version of this file exited on stdin's `end` event, which fires
 *   as soon as the writer closes the pipe — while every `forward` is still
 *   awaiting the network. Piping a batch of messages in produced a clean
 *   exit code and not one byte of output. It only worked when a human was
 *   typing, because a human is slow enough that the response arrives before
 *   the pipe closes.
 *
 *   `end` means "no more input", not "no more work".
 */
const pending = new Set();

async function handle(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    send(errorFor(null, -32700, "Invalid JSON"));
    return;
  }

  const response = await forward(message);
  if (response !== null) send(response);
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;

  // Newline-delimited framing. A partial line is kept for the next chunk —
  // stdin does not promise message boundaries.
  let index;
  while ((index = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;

    // Not serialised. JSON-RPC matches responses by id, so ordering is not
    // load-bearing, and a slow call must not hold up the ones behind it.
    const task = handle(line).finally(() => pending.delete(task));
    pending.add(task);
  }
});

process.stdin.on("end", async () => {
  // Drain, including anything queued by a response that arrived late.
  while (pending.size > 0) await Promise.all([...pending]);
  process.exit(0);
});
