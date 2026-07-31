/**
 * Notifications — the tap on the shoulder.
 *
 * DIRECTION
 *   Almost everything this platform does happens while nobody is looking. The
 *   night shift writes a brief at 3am, the Spend Watch finds a dead account on
 *   a Sunday, a client files a request at 11pm. Until now none of it told
 *   anyone. A system that only works if you remember to go and check it is a
 *   system people stop checking.
 *
 * BLUEPRINTS
 *   `renderNotification` is pure — kind and payload in, subject and body out —
 *   so every template is tested without a mail server. `sendNotification` does
 *   the delivery and is fire-and-forget by construction: it catches everything
 *   and returns a status. A failing mail server must never break a client's
 *   request submission or fail a Stripe webhook.
 *
 *   With no SMTP configured it logs and reports "skipped", exactly like
 *   lib/webhooks.ts. The app has always had to run without secrets.
 */

import nodemailer from "nodemailer";
import { BRAND } from "@/lib/brand";
import { env } from "@/lib/env";
import { postWebhook } from "@/lib/webhooks";
import { renderEmailHtml } from "@/lib/email-shell";
import { FLIGHT_CHECK } from "@/lib/upgrades";

export type NotificationKind =
  | "ENQUIRY_RECEIPT"
  | "REQUEST_FILED"
  | "REQUEST_REPLY_TO_CLIENT"
  | "REQUEST_REPLY_TO_AGENCY"
  | "BRIEF_READY"
  | "ALERT_CRITICAL"
  | "COCKPIT_CONFIGURED"
  | "RESERVATION"
  | "MARKETING_LEAD"
  /** To the customer: a phone estimate the client released through the gate. */
  | "ESTIMATE_READY"
  /** To the agency: the phone desk priced a call off a fallback range because
   * no rate-card line matched — worth a look before it reaches a customer. */
  | "ESTIMATE_FALLBACK_USED"
  /** To the agency: a caller left a voicemail-style message because nobody
   * was available to transfer to. */
  | "VOICEMAIL_LEFT";

export interface NotificationPayload {
  businessName: string;
  /** Headline detail — request title, brief headline, alert title. */
  title: string;
  /** Optional body detail. */
  detail?: string;
  /** Path on this app the recipient should land on. */
  path?: string;
  /** Extra lines, rendered as bullets. */
  lines?: string[];
}

export interface RenderedNotification {
  subject: string;
  text: string;
  /** Branded HTML, for the two kinds a human reads as a first impression. */
  html?: string;
}

function link(path?: string): string {
  // publicUrl, not appUrl: an unset NEXT_PUBLIC_APP_URL made real enquiry
  // emails sign off with "http://localhost:3000/", which is dead for every
  // recipient.
  const base = env.publicUrl;
  if (!path) return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Pure: turn a notification into the exact email that goes out.
 *
 * Plain text on purpose. These are operational messages read on a phone at
 * 6am — an HTML template with a hero image is worse in every way that matters,
 * and plain text can't render broken.
 */
export function renderNotification(
  kind: NotificationKind,
  payload: NotificationPayload,
): RenderedNotification {
  const url = link(payload.path);
  const bullets = (payload.lines ?? []).map((l) => `• ${l}`).join("\n");
  const sign = `\n\n— ${BRAND.teamName}\n${url}`;

  switch (kind) {
    case "REQUEST_FILED":
      return {
        subject: `New request from ${payload.businessName}: ${payload.title}`,
        text: [
          `${payload.businessName} filed a request.`,
          "",
          payload.title,
          payload.detail ? `\n${payload.detail}` : "",
          bullets,
        ]
          .filter(Boolean)
          .join("\n") + sign,
      };

    case "REQUEST_REPLY_TO_CLIENT":
      return {
        subject: `Re: ${payload.title}`,
        text: [
          `${BRAND.teamName} replied to your request.`,
          "",
          payload.title,
          payload.detail ? `\n"${payload.detail}"` : "",
        ]
          .filter(Boolean)
          .join("\n") + sign,
      };

    case "REQUEST_REPLY_TO_AGENCY":
      return {
        subject: `${payload.businessName} replied: ${payload.title}`,
        text: [
          `${payload.businessName} replied on an open request.`,
          "",
          payload.title,
          payload.detail ? `\n"${payload.detail}"` : "",
        ]
          .filter(Boolean)
          .join("\n") + sign,
      };

    case "BRIEF_READY":
      return {
        subject: payload.title, // the brief's own headline is the subject
        text: [
          `Your desk worked overnight. Here's what it found.`,
          "",
          payload.detail ?? "",
          bullets ? `\n${bullets}` : "",
        ]
          .filter(Boolean)
          .join("\n") + sign,
      };

    case "ALERT_CRITICAL":
      return {
        subject: `Action needed — ${payload.title}`,
        text: [
          `The Spend Watch found something on ${payload.businessName} that needs attention today.`,
          "",
          payload.title,
          payload.detail ? `\n${payload.detail}` : "",
          bullets ? `\n${bullets}` : "",
        ]
          .filter(Boolean)
          .join("\n") + sign,
      };

    case "RESERVATION": {
      // Subject is built to be scannable in a notification bar: who, then what.
      // The old one led with "NEW RESERVATION —" and buried the business name
      // behind it, and mentioned a cockpit configurator deleted weeks ago.
      const headline = payload.lines?.[0]
        ? `${payload.businessName} — ${payload.lines[0]}`
        : payload.businessName;

      return {
        subject: `💰 ${headline} · ${payload.title}`,
        text: [
          `${payload.businessName} wants to buy.`,
          "",
          payload.detail ?? "",
          bullets ? `\n${bullets}` : "",
          "",
          "Reply to them directly — they are expecting to hear from you today.",
        ]
          .filter(Boolean)
          .join("\n") + sign,
        html: renderEmailHtml({
          kicker: "New enquiry",
          headline: `${payload.businessName} wants to buy.`,
          intro: "They picked their own stack and left their details. They are expecting to hear from you today.",
          blocks: [
            ...(payload.lines ?? []).map((l, i) => ({
              label: i === 0 ? "Value" : "Also",
              value: l,
              big: i === 0,
              tone: (i === 0 ? "gold" : "plain") as "gold" | "plain",
            })),
            { label: "What they want", value: payload.title, tone: "violet" as const },
          ],
          detail: payload.detail,
          footnote: "Sent by the enquiry form. Hit reply — their address is in the detail above.",
        }),
      };
    }

    case "ENQUIRY_RECEIPT":
      // The email the person who filled in the form gets. Before this they got
      // nothing at all: a prospect asked to spend four figures a month and
      // received silence, while we celebrated internally.
      return {
        subject: `We've got it — ${payload.title}`,
        text: [
          `Thanks — that's with us.`,
          "",
          `You asked about: ${payload.title}`,
          payload.detail ? `\n${payload.detail}` : "",
          "",
          "A human reads every one of these and replies the same day, with the exact scope and the exact number in writing.",
          "",
          "Nothing has been charged and nothing on your account changes until you say so.",
        ]
          .filter(Boolean)
          .join("\n") + sign,
        html: renderEmailHtml({
          kicker: "Cleared for pre-flight",
          headline: "We've got it.",
          intro:
            "A human reads every one of these — not a sequence. You'll hear back today with the exact scope and the exact number in writing.",
          blocks: [
            { label: "You asked about", value: payload.title, big: true, tone: "cyan" },
            ...(payload.lines ?? []).map((l) => ({
              label: "Value",
              value: l,
              tone: "gold" as const,
            })),
          ],
          detail: payload.detail,
          cta: { label: `See the upgrades again`, href: link("/") },
          // The guarantee's name is interpolated, not typed. This footnote is
          // read by the prospect at the exact moment they are deciding whether
          // to trust us, sitting beside a contract that quotes the same clause.
          footnote:
            `Nothing has been charged, and nothing on your ${BRAND.parent.name} account changes until you agree the scope. Every upgrade is month to month and covered by ${FLIGHT_CHECK.label}.`,
        }),
      };

    case "MARKETING_LEAD":
      return {
        subject: `New enquiry — ${payload.businessName}`,
        text: [
          `Someone filled in the contact form.`,
          "",
          payload.detail ?? "",
          bullets ? `\n${bullets}` : "",
        ]
          .filter(Boolean)
          .join("\n") + sign,
      };

    case "ESTIMATE_READY":
      return {
        subject: payload.title, // e.g. "Your estimate from Acme Roofing"
        text: [
          payload.detail ?? "",
          bullets ? `\n${bullets}` : "",
          "",
          "This is a range, not a final invoice — the exact number gets confirmed before any work starts.",
        ]
          .filter(Boolean)
          .join("\n") + sign,
        html: renderEmailHtml({
          kicker: payload.businessName,
          headline: payload.title,
          intro: payload.detail ?? "",
          blocks: (payload.lines ?? []).map((l, i) => ({
            label: i === 0 ? "Estimated range" : "Detail",
            value: l,
            big: i === 0,
            tone: (i === 0 ? "gold" : "plain") as "gold" | "plain",
          })),
          footnote: "This is a range, not a final invoice — the exact number gets confirmed before any work starts.",
        }),
      };

    case "ESTIMATE_FALLBACK_USED":
      return {
        subject: `Phone estimate used a placeholder range — ${payload.title}`,
        text: [
          `The phone desk priced a call for ${payload.businessName} without a matching rate-card line, so it used a wide placeholder range instead of a real one.`,
          "",
          payload.detail ?? "",
          "Check the gate queue before it goes out.",
        ]
          .filter(Boolean)
          .join("\n") + sign,
      };

    case "VOICEMAIL_LEFT":
      return {
        subject: `Voicemail — ${payload.businessName}: ${payload.title}`,
        text: [
          `Someone called ${payload.businessName} and left a message — nobody was available to transfer to.`,
          "",
          payload.detail ?? "",
        ]
          .filter(Boolean)
          .join("\n") + sign,
      };

    case "COCKPIT_CONFIGURED":
      return {
        subject: `${payload.businessName} built a cockpit: ${payload.title}`,
        text: [
          `${payload.businessName} configured a cockpit on the site.`,
          "",
          payload.detail ?? "",
          bullets ? `\n${bullets}` : "",
        ]
          .filter(Boolean)
          .join("\n") + sign,
      };
  }
}

/**
 * Where agency-bound notifications go. Never undefined: a deploy with no env
 * config at all still reaches a real inbox, because "nobody was told" is the
 * failure mode that costs an actual sale.
 */
export function agencyAddress(): string {
  return process.env.AGENCY_NOTIFY_EMAIL ?? process.env.SEED_ADMIN_EMAIL ?? BRAND.notifyEmail;
}

export type NotifyStatus = "sent" | "skipped" | "failed";

export interface NotifyResult {
  status: NotifyStatus;
  reason?: string;
}

/**
 * Resend's HTTPS API. Preferred over SMTP because it needs exactly one secret
 * and their onboarding sender works before any domain is verified — the
 * difference between "email works after you paste a key" and "email works
 * after you get five SMTP variables right".
 */
async function sendViaResend(
  to: string,
  rendered: RenderedNotification,
): Promise<NotifyResult | null> {
  const key = env.resendKey;
  if (!key) return null;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? `${BRAND.name} <onboarding@resend.dev>`,
        to: [to],
        subject: rendered.subject,
        text: rendered.text,
        ...(rendered.html ? { html: rendered.html } : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[notify] resend rejected: ${res.status} ${detail.slice(0, 200)}`);
      return { status: "failed", reason: `resend ${res.status}` };
    }
    return { status: "sent" };
  } catch (err) {
    console.error("[notify] resend failed:", (err as Error).message);
    return { status: "failed", reason: (err as Error).message };
  }
}

let transport: nodemailer.Transporter | null = null;

function mailer(): nodemailer.Transporter | null {
  if (!process.env.EMAIL_SERVER_HOST) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.EMAIL_SERVER_HOST,
      port: Number(process.env.EMAIL_SERVER_PORT ?? 587),
      auth: process.env.EMAIL_SERVER_USER
        ? { user: process.env.EMAIL_SERVER_USER, pass: process.env.EMAIL_SERVER_PASSWORD }
        : undefined,
    });
  }
  return transport;
}

export interface SendInput {
  kind: NotificationKind;
  /** Recipient address. Falsy = skipped, not an error. */
  to?: string | null;
  payload: NotificationPayload;
}

/**
 * Deliver one notification. NEVER throws — every caller is inside a user flow
 * or a webhook that must not fail because a mail server hiccuped.
 *
 * Also mirrors to the Zapier hook, so an agency running on Slack rather than
 * email gets the same signal without any SMTP config at all.
 */
export async function sendNotification({ kind, to, payload }: SendInput): Promise<NotifyResult> {
  const rendered = renderNotification(kind, payload);

  // Mirror everything to the automation hook first — it's the path most likely
  // to be configured, and it's how this reaches Slack.
  await postWebhook(
    env.zapierOnboardHook,
    {
      source: "notification",
      kind,
      to: to ?? null,
      subject: rendered.subject,
      body: rendered.text,
      url: link(payload.path),
      at: new Date().toISOString(),
    },
    { label: `notify-${kind.toLowerCase()}` },
  );

  if (!to) {
    console.info(`[notify] ${kind} skipped — no recipient`);
    return { status: "skipped", reason: "no recipient" };
  }

  // Resend first — it's the one-secret path.
  const viaResend = await sendViaResend(to, rendered);
  if (viaResend) {
    console.info(`[notify] ${kind} → ${to} ${viaResend.status} (resend)`);
    return viaResend;
  }

  const t = mailer();
  if (!t) {
    console.info(
      `[notify] ${kind} → ${to} skipped — set RESEND_API_KEY or EMAIL_SERVER_HOST to deliver`,
    );
    return { status: "skipped", reason: "no mail transport" };
  }

  try {
    await t.sendMail({
      to,
      from: process.env.EMAIL_FROM ?? BRAND.fromEmail,
      subject: rendered.subject,
      text: rendered.text,
      ...(rendered.html ? { html: rendered.html } : {}),
    });
    console.info(`[notify] ${kind} → ${to} sent`);
    return { status: "sent" };
  } catch (err) {
    console.error(`[notify] ${kind} → ${to} failed:`, (err as Error).message);
    return { status: "failed", reason: (err as Error).message };
  }
}

/** Convenience: notify the agency inbox. */
export function notifyAgency(kind: NotificationKind, payload: NotificationPayload) {
  return sendNotification({ kind, to: agencyAddress(), payload });
}
