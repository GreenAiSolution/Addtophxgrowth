/**
 * Outbound webhook helpers — Zapier Catch Hook + HubSpot integration points.
 * Failures are logged, never thrown into the user flow (fire-and-forget with a
 * short timeout). Wire real retry/queue semantics later.
 */

export async function postWebhook(
  url: string | undefined,
  payload: unknown,
  { label = "webhook" }: { label?: string } = {},
): Promise<boolean> {
  if (!url) {
    console.info(`[${label}] skipped — no URL configured`);
    return false;
  }
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      console.warn(`[${label}] non-2xx: ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[${label}] failed:`, (err as Error).message);
    return false;
  }
}
