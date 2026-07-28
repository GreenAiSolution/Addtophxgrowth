/**
 * SECURITY HEADERS
 *
 * The site shipped with none. Every response — including the enquiry endpoint
 * that carries a prospect's name, email and phone — went out with no
 * clickjacking protection, no MIME-sniffing protection, and a referrer policy
 * that leaked the full URL to any third party a visitor clicked through to.
 * These cost nothing and are checked by every buyer who runs a scanner on us
 * before signing a four-figure monthly.
 *
 * ON THE CONTENT SECURITY POLICY
 *   `script-src` carries 'unsafe-inline' deliberately, and it is worth being
 *   honest about why rather than pretending the policy is stricter than it is.
 *   Next's App Router injects inline bootstrap and flight-data scripts on every
 *   page. Removing 'unsafe-inline' means nonces, nonces mean a middleware that
 *   stamps a fresh one per request, and a per-request header means every page
 *   becomes dynamic — we would trade the static rendering of a marketing page
 *   for a hardening that matters most on pages accepting user-generated HTML,
 *   which this site has none of.
 *
 *   What the policy does buy is real: `object-src 'none'` and `base-uri 'self'`
 *   kill the two classic injection escalations, `frame-ancestors 'none'` stops
 *   framing at the modern header, and `form-action 'self'` means an injected
 *   form cannot post a visitor's details to somebody else's server.
 */

const CSP = [
  "default-src 'self'",
  // See the note above: Next's own bootstrap scripts are inline.
  "script-src 'self' 'unsafe-inline'",
  // Tailwind ships as a stylesheet, but React inline `style` props are used
  // throughout for animation delays and progress widths.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // Same-origin only: /api/reserve, /api/pulse and /api/health are all local.
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  // Belt and braces with frame-ancestors, for anything old enough to ignore CSP.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing on this site asks for a camera, a microphone or a location.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Prisma + Anthropic SDK are server-only; keep them out of the client bundle.
    serverComponentsExternalPackages: ["@prisma/client", "@anthropic-ai/sdk", "stripe"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // The health endpoint is a live probe. A cached 200 from a moment when
      // delivery worked is the exact lie the endpoint exists to prevent.
      {
        source: "/api/health",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
