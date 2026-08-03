import { handleBody } from "@/lib/mcp";

/**
 * MCP over HTTP.
 *
 * DIRECTION
 *   Transport only. Every decision lives in `src/lib/mcp.ts`, which is pure
 *   and fully tested without starting a server — the same split as
 *   `spend-watch.ts` and its route, and for the same reason.
 *
 * WHY THERE IS NO AUTH HERE
 *   It serves the public catalogue and nothing else: the same facts as
 *   `/api/catalogue`, the same facts as the page. There is no tenant data
 *   behind it, no database call, and nothing to leak — so requiring a key
 *   would buy nothing and would keep out exactly the reader this endpoint
 *   exists for.
 *
 *   A tenant-scoped MCP server — "what is going cold", "release the queue" —
 *   is a different endpoint with a different posture, and it does not exist
 *   yet. It must not be added to this route.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "content-type, mcp-protocol-version, mcp-session-id",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * A GET would normally open the server-to-client SSE stream. This server has
 * nothing to push — no subscriptions, no progress, no sampling — so it says so
 * rather than holding a stream open forever and letting a client wait on
 * notifications that are never coming.
 */
export async function GET() {
  return new Response(
    JSON.stringify({
      name: "phxgrowth-plus",
      transport: "streamable-http",
      note: "POST JSON-RPC to this URL. This server sends no server-initiated messages, so there is no SSE stream to open.",
    }),
    { status: 200, headers: { "content-type": "application/json", ...CORS } },
  );
}

export async function POST(req: Request) {
  const body = await req.text().catch(() => "");
  const result = handleBody(body);

  // Notifications get 202 with no body, per the spec. Returning 200 with
  // `null` reads as a result to a client that is waiting for one.
  if (result === null) {
    return new Response(null, { status: 202, headers: CORS });
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "content-type": "application/json", ...CORS },
  });
}
