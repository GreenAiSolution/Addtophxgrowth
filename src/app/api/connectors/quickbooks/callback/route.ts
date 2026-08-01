import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { exchangeCode, quickBooksRedirectUri } from "@/lib/quickbooks";
import { readState } from "@/lib/connect-state";

/**
 * Where QuickBooks sends the owner back.
 *
 * Trusts nothing from the browser except the signed `state` — that is what says
 * which tenant this belongs to. Reading the session here instead would mean a
 * mis-timed login could attach one business's books to another's account.
 *
 * Always redirects to a screen with a sentence on it. An OAuth callback that
 * renders a bare error is the point where a small business owner gives up and
 * rings us instead.
 */

export const dynamic = "force-dynamic";

function back(params: Record<string, string>): NextResponse {
  const q = new URLSearchParams(params).toString();
  const res = NextResponse.redirect(`${env.siteUrl}/app/connections?${q}`);
  res.headers.set("cache-control", "no-store");
  return res;
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  // The owner pressed cancel on Intuit's screen. Not an error.
  const denied = url.searchParams.get("error");
  if (denied) {
    return back({ note: "QuickBooks was not connected — nothing has changed." });
  }

  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const realmId = url.searchParams.get("realmId") ?? "";

  const checked = readState(state);
  if (!checked.ok) return back({ error: checked.why });
  if (!code || !realmId) {
    return back({ error: "QuickBooks did not send back enough to finish the connection. Try again." });
  }

  const clientId = env.optional("QUICKBOOKS_CLIENT_ID");
  const clientSecret = env.optional("QUICKBOOKS_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return back({ error: "QuickBooks is not configured on this deployment yet." });
  }

  const environment = checked.connector.endsWith(":production") ? "production" : "sandbox";

  const exchanged = await exchangeCode({
    code,
    realmId,
    redirectUri: quickBooksRedirectUri(env.siteUrl),
    environment,
    creds: { clientId, clientSecret },
  });
  if (!exchanged.ok) return back({ error: exchanged.detail });

  // Reconnecting replaces the credentials rather than stacking a second row,
  // so the delivery history and the events already queued behind it survive.
  const existing = await prisma.connection.findFirst({
    where: { clientId: checked.clientId, connector: "quickbooks" },
    select: { id: true },
  });

  if (existing) {
    await prisma.connection.update({
      where: { id: existing.id },
      data: {
        credentials: exchanged.config as never,
        enabled: true,
        lastError: null,
        consecutiveFailures: 0,
      },
    });
  } else {
    await prisma.connection.create({
      data: {
        clientId: checked.clientId,
        connector: "quickbooks",
        label: environment === "production" ? "QuickBooks Online" : "QuickBooks (sandbox)",
        credentials: exchanged.config as never,
      },
    });
  }

  return back({
    note:
      environment === "production"
        ? "QuickBooks is connected. Release one estimate and check it lands before you rely on it."
        : "QuickBooks sandbox is connected. Switch to production when you are ready for the real books.",
  });
}
