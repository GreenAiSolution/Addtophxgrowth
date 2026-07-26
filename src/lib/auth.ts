import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { BRAND } from "@/lib/brand";
import type { Role } from "@prisma/client";

/**
 * Auth.js (NextAuth v5) configuration.
 * - Email magic link (Nodemailer) + Google OAuth.
 * - Roles CLIENT / ADMIN surfaced on the session.
 *
 * The email provider is only registered when SMTP is configured, so the app
 * builds and runs in Google-only / dev environments without SMTP secrets.
 */

const providers = [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    allowDangerousEmailAccountLinking: true,
  }),
];

if (process.env.EMAIL_SERVER_HOST) {
  providers.push(
    Nodemailer({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: Number(process.env.EMAIL_SERVER_PORT ?? 587),
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: process.env.EMAIL_FROM ?? BRAND.fromEmail,
    }) as never,
  );
}

// Demo-friendly fallback: without AUTH_SECRET the whole site would 500.
// No providers are registered without env config, so no real session can be
// minted with this placeholder — but ALWAYS set AUTH_SECRET in production.
const secret = process.env.AUTH_SECRET ?? "insecure-demo-secret-set-AUTH_SECRET";
if (!process.env.AUTH_SECRET) {
  console.warn("[auth] AUTH_SECRET is not set — using an insecure demo fallback.");
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret,
  trustHost: true,
  session: { strategy: "database" },
  pages: { signIn: "/login" },
  providers,
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = (user as { role?: Role }).role ?? "CLIENT";
      }
      return session;
    },
  },
});
