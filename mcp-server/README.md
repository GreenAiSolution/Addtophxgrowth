# Add To PHX — Repo-Introspection MCP Server

A stdio [Model Context Protocol](https://modelcontextprotocol.io) server that lets an AI
assistant explore this codebase through structured tools instead of raw file reads.

This is the **second** of the repo's two MCP surfaces, and they deliberately do different jobs:

| Server | Transport | Job |
| --- | --- | --- |
| `/api/mcp` + [`phxgrowth-plus-mcp-server/`](../phxgrowth-plus-mcp-server) | HTTP (+ stdio proxy) | The **live catalogue** — prices and upgrades from the deployed site, never a stale copy. |
| `mcp-server/` (this one) | stdio | The **codebase** — routes, schema, tests, config surface, source search. |

It holds no data of its own: every tool reads the working tree at call time.

## Tools

| Tool | What it returns |
| --- | --- |
| `get_project_overview` | Name, description, scripts and dependencies from `package.json`, plus counts of routes, Prisma models and test files. |
| `get_route_map` | Every page and API route the Next.js app serves, derived from `page.tsx` / `route.ts` files under `src/app`. |
| `get_db_schema` | Models, fields and enums parsed live from `prisma/schema.prisma`. Optional `model` filter. |
| `list_guardrail_tests` | Every `*.test.ts` file with its `describe`/`it` titles — the repo's consistency guardrails, enumerated. |
| `get_env_reference` | The documented configuration keys from the committed `.env.example` (names and placeholders only — the real `.env` is never read). |
| `search_source` | Case-insensitive literal search across `src/`, `prisma/` and `scripts/` with file/line results. |

## Setup

```bash
cd mcp-server
npm install
```

Add it to Claude Code:

```bash
claude mcp add addtophxgrowth -- node mcp-server/server.mjs
```

Or use the repo's root `.mcp.json`, which registers it automatically for tools that support project-scoped MCP config.

## Smoke test

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' | node server.mjs
```

You should get back an `initialize` result naming the server `addtophxgrowth`.
