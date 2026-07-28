import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config.mjs";

/**
 * The site shipped for weeks with no security headers on any response.
 *
 * Nobody noticed because nothing breaks when they are missing — that is the
 * whole problem with this class of defect. A header only announces its absence
 * on the day somebody frames your enquiry form inside their own page, or runs
 * a scanner over you before signing a four-figure monthly.
 *
 * So the guard is a test rather than a comment. Deleting a header now fails
 * the build instead of quietly regressing.
 */

interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

async function rules(): Promise<HeaderRule[]> {
  const fn = (nextConfig as { headers?: () => Promise<HeaderRule[]> }).headers;
  expect(fn, "next.config.mjs must export a headers() function").toBeTypeOf("function");
  return fn!();
}

/** The rule that applies to every response. */
async function globalHeaders(): Promise<Map<string, string>> {
  const all = await rules();
  const global = all.find((r) => r.source === "/:path*");
  expect(global, "there must be a catch-all header rule").toBeDefined();
  return new Map(global!.headers.map((h) => [h.key, h.value]));
}

describe("security headers", () => {
  it("sets every header on every path", async () => {
    const h = await globalHeaders();
    for (const key of [
      "Content-Security-Policy",
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Strict-Transport-Security",
    ]) {
      expect(h.get(key), `${key} is missing`).toBeTruthy();
    }
  });

  it("refuses to be framed, at both the old header and the new one", async () => {
    const h = await globalHeaders();
    expect(h.get("X-Frame-Options")).toBe("DENY");
    expect(h.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });

  it("pins form submissions to our own origin", async () => {
    // An injected form that posts a prospect's name, email and phone to
    // somebody else's server is the realistic attack on a page whose entire
    // purpose is a contact form.
    const h = await globalHeaders();
    expect(h.get("Content-Security-Policy")).toContain("form-action 'self'");
  });

  it("closes the two classic injection escalations", async () => {
    const csp = (await globalHeaders()).get("Content-Security-Policy")!;
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("does not allow remote script or connect origins", async () => {
    // Everything this site talks to is same-origin. If that ever changes the
    // change should be deliberate and visible here, not a widened wildcard.
    const csp = (await globalHeaders()).get("Content-Security-Policy")!;
    const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src"))!;
    const connectSrc = csp.split(";").find((d) => d.trim().startsWith("connect-src"))!;
    expect(scriptSrc).not.toMatch(/https?:\/\//);
    expect(scriptSrc).not.toContain("*");
    expect(connectSrc.trim()).toBe("connect-src 'self'");
  });

  it("never allows eval", async () => {
    const csp = (await globalHeaders()).get("Content-Security-Policy")!;
    expect(csp).not.toContain("unsafe-eval");
  });

  it("asks for a year of HSTS at minimum", async () => {
    const hsts = (await globalHeaders()).get("Strict-Transport-Security")!;
    const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1] ?? 0);
    expect(maxAge).toBeGreaterThanOrEqual(31_536_000);
    expect(hsts).toContain("includeSubDomains");
  });

  it("hands back no camera, microphone or location", async () => {
    const pp = (await globalHeaders()).get("Permissions-Policy")!;
    for (const feature of ["camera", "microphone", "geolocation"]) {
      expect(pp).toContain(`${feature}=()`);
    }
  });

  it("stops the health probe being cached", async () => {
    // A cached 200 from a moment when mail delivery worked is precisely the
    // lie /api/health exists to prevent.
    const rule = (await rules()).find((r) => r.source === "/api/health");
    expect(rule, "/api/health needs its own no-store rule").toBeDefined();
    expect(rule!.headers.find((h) => h.key === "Cache-Control")?.value).toContain("no-store");
  });

  it("does not advertise the framework version", async () => {
    expect((nextConfig as { poweredByHeader?: boolean }).poweredByHeader).toBe(false);
  });
});
