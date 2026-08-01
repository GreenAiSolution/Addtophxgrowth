import { NextResponse } from "next/server";
import { requireClient } from "@/lib/tenancy";
import { env } from "@/lib/env";
import { authorizeUrl, quickBooksRedirectUri } from "@/lib/quickbooks";
import { signState } from "@/lib/connect-state";

/**
 * Send the owner to QuickBooks to say yes.
 *
 * The whole reason this route exists is that the alternative — asking a small
 * business owner to register an app at developer.intuit.com and paste a refresh
 * token — is not a thing that happens. We hold one Intuit app; they click a
 * button.
 */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { client } = await requireClient();

  const intuitClientId = env.optional("QUICKBOOKS_CLIENT_ID");
  if (!intuitClientId) {
    // Said plainly rather than redirecting to a broken Intuit page. This is our
    // deploy that is missing something, not the owner's mistake.
    return NextResponse.redirect(
      `${env.siteUrl}/app/connections?error=${encodeURIComponent(
        "QuickBooks is not configured on this deployment yet. Nothing is wrong on your side — ask us to set it up.",
      )}`,
    );
  }

  const environment =
    new URL(req.url).searchParams.get("environment") === "production" ? "production" : "sandbox";

  const res = NextResponse.redirect(
    authorizeUrl({
      clientId: intuitClientId,
      redirectUri: quickBooksRedirectUri(env.siteUrl),
      // Carries the tenant across the round trip so the callback never has to
      // guess from whatever session the browser comes back holding.
      state: signState({ clientId: client.id, connector: `quickbooks:${environment}` }),
    }),
  );
  res.headers.set("cache-control", "no-store");
  return res;
}
