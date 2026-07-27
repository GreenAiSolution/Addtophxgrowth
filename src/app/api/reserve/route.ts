import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { sendNotification, agencyAddress } from "@/lib/notify";
import { priceCockpit, buildSheet, matchesSignature, VALID_AGENT_PLANS, VALID_ADOPS_PLANS, VALID_ADDONS } from "@/lib/cockpit";
import { VERTICAL_PACKS, verticalByKey } from "@/lib/verticals";
import { formatCurrency } from "@/lib/utils";

/**
 * Reserve a cockpit without an account.
 *
 * DIRECTION
 *   Somebody spent five minutes assembling a five-figure build and pressed the
 *   button. Sending them to a login form — which on an unconfigured deploy is a
 *   wall that says "no auth providers configured" — throws that away at the
 *   exact moment of intent. This endpoint takes their details and the build and
 *   gets it in front of a human.
 *
 * BLUEPRINTS
 *   Deliberately touches NO database, NO auth and NO Stripe. Those are the
 *   three things most likely to be unconfigured on a fresh deploy, and this is
 *   precisely the path that has to survive that. It needs only the notify
 *   layer, which itself degrades to a log line rather than failing.
 */

export const runtime = "nodejs";

const VERTICAL_KEYS = VERTICAL_PACKS.map((v) => v.key);

const Body = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  phone: z.string().max(60).optional(),
  company: z.string().max(160).optional(),
  note: z.string().max(2000).optional(),
  selection: z.object({
    agentsPlan: z.enum(VALID_AGENT_PLANS as [string, ...string[]]).nullable().optional(),
    adOpsPlan: z.enum(VALID_ADOPS_PLANS as [string, ...string[]]).nullable().optional(),
    addons: z.array(z.enum(VALID_ADDONS as [string, ...string[]])).max(20).optional(),
    verticalKey: z.enum(VERTICAL_KEYS as [string, ...string[]]).nullable().optional(),
  }),
});

function ip(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anon"
  );
}

export async function POST(req: Request) {
  const rl = rateLimit(`reserve:${ip(req)}`, { limit: 5, windowMs: 60_000 });
  if (!rl.success) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check your name and email." }, { status: 400 });
  }

  const { name, email, phone, company, note, selection } = parsed.data;
  const quote = priceCockpit(selection);
  if (quote.isEmpty) {
    return NextResponse.json({ error: "Nothing selected yet." }, { status: 400 });
  }

  const signature = matchesSignature(selection);
  const pack = verticalByKey(selection.verticalKey);
  const businessName = company?.trim() || name;

  const detail = [
    `Name:    ${name}`,
    `Email:   ${email}`,
    phone ? `Phone:   ${phone}` : "",
    company ? `Company: ${company}` : "",
    pack ? `Trade:   ${pack.trade}` : "",
    "",
    buildSheet(selection, quote),
    note ? `\nWhat they said:\n"${note}"` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await sendNotification({
    kind: "RESERVATION",
    to: agencyAddress(),
    payload: {
      businessName,
      title: signature ? signature.name : "Custom build",
      detail,
      lines: [
        `${formatCurrency(quote.monthlyTotal)}/mo`,
        `${formatCurrency(quote.oneTimeTotal)} one-time build`,
        `${formatCurrency(quote.firstInvoiceTotal)} on the first invoice`,
      ],
      path: "/cockpit",
    },
  });

  // Always report success to the visitor. Their reservation reached the Zapier
  // hook and the server log regardless, and telling somebody "we couldn't take
  // your details" because our mail server is down is a self-inflicted lost sale.
  if (result.status === "failed" || result.status === "skipped") {
    console.warn(
      `[reserve] delivery ${result.status} (${result.reason}) for ${email} — payload logged above`,
    );
  }

  return NextResponse.json({ ok: true });
}
