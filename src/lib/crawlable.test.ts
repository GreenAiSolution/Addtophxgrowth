import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { BRAND } from "@/lib/brand";

/**
 * robots.txt and sitemap.xml were both serving `http://localhost:3000` in
 * production, because they read `env.appUrl` — which falls back to localhost
 * when NEXT_PUBLIC_APP_URL is unset, exactly as a dev server should.
 *
 * The result was a sitemap of URLs no crawler on earth can fetch and a
 * `Sitemap:` pointer into a machine that isn't ours. Neither errored. Neither
 * showed up in any log. The site was simply invisible.
 *
 * The first fix was worse than the bug. Swapping in `env.publicUrl` produced a
 * sitemap that listed **phxgrowth.com's** URLs as ours — a cross-domain claim
 * Google acts on, pointing at pages (`/legal/terms`) the parent site does not
 * have. A link only has to be clickable; a sitemap has to be true. The tests
 * below pin down both halves, because only pinning the first is what caused
 * the second.
 */

const LOCAL = /localhost|127\.0\.0\.1|\.local\b/i;
const PARENT_HOST = new URL(BRAND.parent.url).hostname;

const VARS = ["NEXT_PUBLIC_APP_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(VARS.map((v) => [v, process.env[v]]));
  for (const v of VARS) delete process.env[v];
});
afterEach(() => {
  for (const v of VARS) {
    if (saved[v] === undefined) delete process.env[v];
    else process.env[v] = saved[v];
  }
});

async function routes() {
  const [{ default: robots }, { default: sitemap }] = await Promise.all([
    import("@/app/robots"),
    import("@/app/sitemap"),
  ]);
  return { robots, sitemap };
}

describe("what crawlers are told", () => {
  it("self-identifies from Vercel when nobody set NEXT_PUBLIC_APP_URL", async () => {
    // The exact production condition: the dashboard step never happened.
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "plus.phxgrowth.com";
    const { robots, sitemap } = await routes();

    expect(robots().sitemap).toBe("https://plus.phxgrowth.com/sitemap.xml");
    for (const e of sitemap()) {
      expect(e.url).not.toMatch(LOCAL);
      expect(e.url.startsWith("https://plus.phxgrowth.com")).toBe(true);
    }
  });

  it("prefers the explicit setting over Vercel's guess", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://plus.phxgrowth.com/";
    process.env.VERCEL_URL = "some-preview-hash.vercel.app";
    const { sitemap } = await routes();
    // Trailing slash trimmed, so no `//legal/...` doubles up.
    expect(sitemap()[0]!.url).toBe("https://plus.phxgrowth.com");
    for (const e of sitemap()) expect(e.url).not.toContain("//legal");
  });

  it("never claims the parent site's URLs as its own", async () => {
    // This is the regression that matters most. `env.publicUrl` falls back to
    // phxgrowth.com so email links stay clickable; if that value ever reaches
    // a sitemap we are telling Google we own pages we do not.
    const { robots, sitemap } = await routes();
    expect(robots().sitemap).not.toContain(PARENT_HOST);
    for (const e of sitemap()) {
      expect(e.url, `${e.url} belongs to ${PARENT_HOST}, not to us`).not.toContain(PARENT_HOST);
    }
  });

  it("keeps the private surfaces out of the index", async () => {
    const { robots } = await routes();
    const rule = robots().rules;
    const disallow = (Array.isArray(rule) ? rule[0]! : rule).disallow as string[];
    // Client data and the token-bearing intake endpoint.
    for (const path of ["/app/", "/admin/", "/api/"]) {
      expect(disallow).toContain(path);
    }
  });

  it("resolves at request time, not at build time", async () => {
    // Both files are otherwise statically generated, which freezes the domain
    // at `next build`. A build that runs without the domain variable then
    // bakes localhost into the artifact permanently, and setting the variable
    // correctly afterwards changes nothing. That is how the original bug hid.
    const [robotsMod, sitemapMod] = await Promise.all([
      import("@/app/robots"),
      import("@/app/sitemap"),
    ]);
    expect(robotsMod.dynamic).toBe("force-dynamic");
    expect(sitemapMod.dynamic).toBe("force-dynamic");
  });

  it("still lets assistants read the catalogue", async () => {
    // We sell Answer Engine Visibility. Blocking the one machine-readable
    // statement of our own offer would be selling against ourselves.
    const { robots } = await routes();
    const rule = robots().rules;
    const allow = (Array.isArray(rule) ? rule[0]! : rule).allow as string[];
    expect(allow).toContain("/api/catalogue");
  });

  it("never lists a private surface in the sitemap", async () => {
    const { sitemap } = await routes();
    for (const e of sitemap()) {
      expect(e.url).not.toMatch(/\/(app|admin|api|login)\b/);
    }
  });
});

describe("env.siteUrl vs env.publicUrl", () => {
  it("keeps them apart: one must be true, the other only reachable", async () => {
    const { env } = await import("@/lib/env");
    // Nothing configured — a local build.
    expect(env.siteUrl).toMatch(LOCAL); // honest: we genuinely don't know
    expect(env.publicUrl).toBe(BRAND.parent.url.replace(/\/$/, "")); // clickable
  });

  it("converges once the site knows its own name", async () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "plus.phxgrowth.com";
    const { env } = await import("@/lib/env");
    expect(env.siteUrl).toBe("https://plus.phxgrowth.com");
    expect(env.publicUrl).toBe("https://plus.phxgrowth.com");
  });
});
