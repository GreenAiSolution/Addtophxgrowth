#!/usr/bin/env node
/**
 * Add To PHX (PHX Growth Plus) — repo-introspection MCP server.
 *
 * This is NOT the price-list server. The catalogue already has two faithful
 * surfaces — `/api/mcp` (HTTP) and `phxgrowth-plus-mcp-server/` (a stdio proxy
 * to it) — and the repo's own tests enforce that no third copy of a price ever
 * exists. This server respects that rule: it holds no data of its own. Every
 * tool reads the actual files in the working tree at call time, so the answer
 * is always the answer the repository currently gives.
 *
 * Tools:
 *   get_project_overview  — package.json facts + repo shape counts
 *   get_route_map         — every page and API route under src/app
 *   get_db_schema         — models/enums parsed from prisma/schema.prisma
 *   list_guardrail_tests  — every test file with its describe/it titles
 *   get_env_reference     — documented keys from .env.example (names only)
 *   search_source         — literal search across src/, prisma/, scripts/
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const server = new McpServer({
  name: "addtophxgrowth",
  version: "1.0.0",
});

function text(payload) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return { content: [{ type: "text", text: body }] };
}

async function walk(dir, filter, results = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, filter, results);
    } else if (filter(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

/* ------------------------------------------------------------------ */

server.registerTool(
  "get_project_overview",
  {
    title: "Project overview",
    description:
      "What this repository is: name, description, scripts, dependency list from package.json, plus counts of app routes, Prisma models and test files.",
    inputSchema: {},
  },
  async () => {
    const pkg = JSON.parse(await readFile(join(REPO_ROOT, "package.json"), "utf8"));
    const routes = await routeMap();
    const schema = await dbSchema();
    const tests = await walk(join(REPO_ROOT, "src"), (n) => n.endsWith(".test.ts"));
    return text({
      name: pkg.name,
      description: pkg.description,
      framework: `next ${pkg.dependencies?.next ?? "?"}`,
      scripts: pkg.scripts,
      dependencies: Object.keys(pkg.dependencies ?? {}),
      counts: {
        pageRoutes: routes.pages.length,
        apiRoutes: routes.api.length,
        prismaModels: schema.models.length,
        prismaEnums: schema.enums.length,
        testFiles: tests.length,
      },
    });
  },
);

/* ------------------------------------------------------------------ */

async function routeMap() {
  const appDir = join(REPO_ROOT, "src", "app");
  const files = await walk(appDir, (n) => n === "page.tsx" || n === "route.ts");
  const toUrl = (file) => {
    const rel = relative(appDir, dirname(file));
    const url =
      "/" +
      rel
        .split("/")
        .filter((seg) => seg && !(seg.startsWith("(") && seg.endsWith(")")))
        .join("/");
    return url === "/" ? "/" : url;
  };
  const pages = files.filter((f) => f.endsWith("page.tsx")).map(toUrl).sort();
  const api = files.filter((f) => f.endsWith("route.ts")).map(toUrl).sort();
  return { pages, api };
}

server.registerTool(
  "get_route_map",
  {
    title: "Route map",
    description:
      "Every page route and API route the Next.js app actually serves, derived from page.tsx / route.ts files under src/app. Route groups like (marketing) are collapsed the way Next collapses them.",
    inputSchema: {},
  },
  async () => text(await routeMap()),
);

/* ------------------------------------------------------------------ */

async function dbSchema() {
  const src = await readFile(join(REPO_ROOT, "prisma", "schema.prisma"), "utf8");
  const models = [];
  const enums = [];
  const blockRe = /^(model|enum)\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m;
  while ((m = blockRe.exec(src)) !== null) {
    const [, kind, name, body] = m;
    const lines = body
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("//") && !l.startsWith("@@"));
    if (kind === "model") {
      const fields = lines
        .map((l) => {
          const parts = l.split(/\s+/);
          return parts.length >= 2 ? { name: parts[0], type: parts[1] } : null;
        })
        .filter(Boolean);
      models.push({ name, fields });
    } else {
      enums.push({ name, values: lines });
    }
  }
  return { models, enums };
}

server.registerTool(
  "get_db_schema",
  {
    title: "Database schema",
    description:
      "The data model, parsed live from prisma/schema.prisma: every model with its fields and types, and every enum with its values. Optionally filter to one model by name.",
    inputSchema: { model: z.string().optional().describe("Return only this model (case-insensitive).") },
  },
  async ({ model }) => {
    const schema = await dbSchema();
    if (model) {
      const hit = schema.models.find((x) => x.name.toLowerCase() === model.toLowerCase());
      return text(hit ?? { error: `No model named ${model}`, available: schema.models.map((x) => x.name) });
    }
    return text(schema);
  },
);

/* ------------------------------------------------------------------ */

server.registerTool(
  "list_guardrail_tests",
  {
    title: "Guardrail tests",
    description:
      "This repo's tests are consistency guardrails (e.g. no hand-typed prices, no catalogue overlap with the parent brand). Lists every *.test.ts file with its describe() and it() titles so you can see what the build refuses to ship without.",
    inputSchema: {},
  },
  async () => {
    const files = await walk(join(REPO_ROOT, "src"), (n) => n.endsWith(".test.ts"));
    const out = [];
    for (const file of files.sort()) {
      const src = await readFile(file, "utf8");
      const titles = [];
      const re = /\b(describe|it|test)\s*\(\s*(["'`])((?:\\.|(?!\2).)*)\2/g;
      let m;
      while ((m = re.exec(src)) !== null) {
        titles.push(`${m[1] === "describe" ? "" : "  - "}${m[3]}`);
      }
      out.push({ file: relative(REPO_ROOT, file), titles });
    }
    return text(out);
  },
);

/* ------------------------------------------------------------------ */

server.registerTool(
  "get_env_reference",
  {
    title: "Environment reference",
    description:
      "The documented configuration surface, parsed from the committed .env.example: key names, example placeholders and the comment that explains each section. Contains no real secrets — .env itself is gitignored and never read.",
    inputSchema: {},
  },
  async () => {
    const src = await readFile(join(REPO_ROOT, ".env.example"), "utf8");
    const sections = [];
    let current = { section: "General", comments: [], keys: [] };
    for (const raw of src.split("\n")) {
      const line = raw.trim();
      if (/^#\s*---/.test(line)) {
        if (current.keys.length || current.comments.length) sections.push(current);
        current = { section: line.replace(/^#\s*-*\s*|\s*-*$/g, ""), comments: [], keys: [] };
      } else if (line.startsWith("#")) {
        const c = line.replace(/^#+\s?/, "");
        if (c && !/^=+$/.test(c)) current.comments.push(c);
      } else if (line.includes("=")) {
        const [key, ...rest] = line.split("=");
        current.keys.push({ key: key.trim(), example: rest.join("=").trim() });
      }
    }
    if (current.keys.length || current.comments.length) sections.push(current);
    return text(sections);
  },
);

/* ------------------------------------------------------------------ */

server.registerTool(
  "search_source",
  {
    title: "Search source",
    description:
      "Case-insensitive literal search across src/, prisma/ and scripts/. Returns file, line number and the matching line, capped at 50 hits. Useful for questions like 'where is tenancy enforced?' or 'what touches Stripe?'.",
    inputSchema: {
      query: z.string().min(2).describe("Literal text to find."),
      limit: z.number().int().min(1).max(50).optional().describe("Max results (default 30)."),
    },
  },
  async ({ query, limit }) => {
    const cap = limit ?? 30;
    const needle = query.toLowerCase();
    const files = [];
    for (const dir of ["src", "prisma", "scripts"]) {
      files.push(
        ...(await walk(join(REPO_ROOT, dir), (n) => /\.(ts|tsx|mjs|prisma|sql|css)$/.test(n))),
      );
    }
    const hits = [];
    outer: for (const file of files) {
      const src = await readFile(file, "utf8");
      if (!src.toLowerCase().includes(needle)) continue;
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(needle)) {
          hits.push({ file: relative(REPO_ROOT, file), line: i + 1, text: lines[i].trim().slice(0, 200) });
          if (hits.length >= cap) break outer;
        }
      }
    }
    return text({ query, matches: hits.length, hits });
  },
);

/* ------------------------------------------------------------------ */

const transport = new StdioServerTransport();
await server.connect(transport);
