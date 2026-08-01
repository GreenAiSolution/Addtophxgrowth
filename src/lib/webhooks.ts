/**
 * Outbound webhook helpers — the *agency's own* Zapier hooks.
 *
 * NOT the client integration path. Anything a client connects — their CRM,
 * their QuickBooks, their own endpoint — goes through `event-bus.ts`, which is
 * signed, queued and retried. This file stays fire-and-forget on purpose: it
 * posts internal ops notifications to a hook we own, where a dropped message
 * costs somebody a glance at a dashboard rather than a row in a customer's
 * ledger. Do not reach for it for anything a client is relying on.
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
