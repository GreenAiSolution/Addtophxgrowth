import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { sendNotification, agencyAddress } from "@/lib/notify";
import { UPGRADES, upgradeByKey, serviceByKey } from "@/lib/upgrades";
import { formatCurrency } from "@/lib/utils";

/**
 * The only conversion endpoint on the site.
 *
 * DIRECTION
 *   Somebody read a page of four-figure monthly upgrades and picked the ones
 *   they want. Sending them to a login form at that exact moment throws the
 *   intent away, so this takes their details and their shortlist and gets it in
 *   front of a human the same day.
 *
 * BLUEPRINTS
 *   Deliberately touches NO database, NO auth and NO Stripe. Those are the three
 *   things most likely to be unconfigured on a fresh deploy, and this is
 *   precisely the path that has to survive that. It needs only the notify layer,
 *   which itself degrades to a log line rather than failing.
 *
 *   The quote is recomputed here from `UPGRADES` rather than trusting any total
 *   the browser sent. A posted price is user input.
 */

export const runtime = "nodejs";

const UPGRADE_KEYS = UPGRADES.map((u) => u.key) as [string, ...string[]];

const Body = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  phone: z.string().max(60).optional(),
  company: z.string().max(160).optional(),
  note: z.string().max(2000).optional(),
  upgrades: z.array(z.enum(UPGRADE_KEYS)).min(1).max(UPGRADES.length),
});

function ip(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anon"
  );
}

export async function POST(req: Request) {
  const rl = rateLimit(`enquiry:${ip(req)}`, { limit: 5, windowMs: 60_000 });
  if (!rl.success) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check your name, email, and pick at least one upgrade." },
      { status: 400 },
    );
  }

  const { name, email, phone, company, note } = parsed.data;

  // De-duplicate, then resolve against the catalogue. Anything we no longer
  // sell simply drops out rather than failing the whole enquiry.
  const picked = [...new Set(parsed.data.upgrades)]
    .map((k) => upgradeByKey(k))
    .filter((u): u is NonNullable<typeof u> => Boolean(u));

  if (picked.length === 0) {
    return NextResponse.json({ error: "Nothing selected yet." }, { status: 400 });
  }

  const monthly = picked
    .filter((u) => u.billing === "monthly")
    .reduce((sum, u) => sum + u.price, 0);
  const oneTime = picked
    .filter((u) => u.billing === "one_time")
    .reduce((sum, u) => sum + u.price, 0);

  const businessName = company?.trim() || name;

  const detail = [
    `Name:    ${name}`,
    `Email:   ${email}`,
    phone ? `Phone:   ${phone}` : "",
    company ? `Company: ${company}` : "",
    "",
    "WANTS:",
    ...picked.map(
      (u) =>
        `• ${u.name} — ${formatCurrency(u.price)}${u.billing === "monthly" ? "/mo" : " once"}` +
        `  (on ${serviceByKey(u.attachesTo)?.name ?? u.attachesTo})`,
    ),
    "",
    monthly > 0 ? `Monthly:  ${formatCurrency(monthly)}` : "",
    oneTime > 0 ? `One-time: ${formatCurrency(oneTime)}` : "",
    note ? `\nWhat they said:\n"${note}"` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await sendNotification({
    kind: "RESERVATION",
    to: agencyAddress(),
    payload: {
      businessName,
      title: `Upgrade enquiry — ${picked.length} selected`,
      detail,
      lines: [
        monthly > 0 ? `${formatCurrency(monthly)}/mo` : "",
        oneTime > 0 ? `${formatCurrency(oneTime)} one-time` : "",
      ].filter(Boolean),
      path: "/",
    },
  });

  // Always report success to the visitor. Their enquiry reached the Zapier hook
  // and the server log regardless, and telling somebody "we couldn't take your
  // details" because our mail server is down is a self-inflicted lost sale.
  if (result.status === "failed" || result.status === "skipped") {
    console.warn(
      `[enquiry] delivery ${result.status} (${result.reason}) for ${email} — payload logged above`,
    );
  }

  return NextResponse.json({ ok: true });
}
