import { stopFollowUps } from "@/lib/pipeline";
import { BRAND } from "@/lib/brand";

/**
 * The opt-out link carried by every automated follow-up.
 *
 * WHY IT IS A GET WITH NO CONFIRMATION STEP
 *   Because a one-click promise has to be one click. An interstitial "are you
 *   sure?" on an unsubscribe is a dark pattern, and the cost of a mail client
 *   prefetching the link is that somebody stops receiving emails they did not
 *   want — which is the correct outcome anyway.
 *
 * WHY IT NEEDS NO LOGIN
 *   The recipient is not a client and has no account. A token in the URL is
 *   the whole authorisation, which is why it is 24 random bytes rather than
 *   the row id.
 *
 * Returns HTML rather than JSON: a human clicked this from an email client and
 * a raw JSON blob would read as an error.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function page(title: string, message: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07080c;color:#e7e9ee;
       font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Inter,sans-serif;padding:24px}
  .card{max-width:34rem;text-align:center}
  h1{font-size:1.4rem;margin:0 0 .6rem;letter-spacing:-.01em}
  p{margin:0;color:#9aa1ad}
  a{color:#22d3ee}
</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t");
  if (!token) {
    return page("That link is incomplete", "It's missing its token. Reply to any of our emails and we'll take you off by hand.", 400);
  }

  try {
    const ok = await stopFollowUps(token);
    if (!ok) {
      return page(
        "We couldn't find that",
        `The link may have expired. Reply to any email from ${BRAND.teamName} and we'll take you off the list by hand.`,
        404,
      );
    }
    return page(
      "Done — you won't hear from us again",
      "That sequence has stopped. Nothing else is scheduled, and nothing was ever charged.",
    );
  } catch (err) {
    console.error("[pipeline/stop] failed:", err);
    // Never show a stack trace to somebody whose only crime was unsubscribing.
    return page(
      "Something went wrong at our end",
      `Reply to any email from ${BRAND.teamName} and we'll take you off the list by hand.`,
      500,
    );
  }
}
