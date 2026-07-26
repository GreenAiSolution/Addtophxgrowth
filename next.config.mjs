/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Prisma + Anthropic SDK are server-only; keep them out of the client bundle.
    serverComponentsExternalPackages: ["@prisma/client", "@anthropic-ai/sdk", "stripe"],
  },
};

export default nextConfig;
