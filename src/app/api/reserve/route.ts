import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { sendNotification, agencyAddress } from "@/lib/notify";
import { captureOpportunity } from "@/lib/pipeline";
import {
  UPGRADES,
  BUNDLES,
  upgradeByKey,
  bundleByKey,
  bundleMembers,
  bundleSaving,
  serviceByKey,
} from "@/lib/upgrades";
import { formatCurrency } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

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
const BUNDLE_KEYS = BUNDLES.map((b) => b.key) as [string, ...string[]];

const Body = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  phone: z.string().max(60).optional(),
  company: z.string().max(160).optional(),
  note: z.string().max(2000).optional(),
  upgrades: z.array(z.enum(UPGRADE_KEYS)).max(UPGRADES.length).optional(),
  /** A deluxe bundle. Priced server-side from its members, never from the browser. */
  bundle: z.enum(BUNDLE_KEYS).optional(),
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

  // A bundle wins outright: its members are implied, and pricing it as the sum
  // of its parts would quote a number higher than the page advertised.
  const bundle = parsed.data.bundle ? bundleByKey(parsed.data.bundle) : undefined;

  // De-duplicate, then resolve against the catalogue. Anything we no longer
  // sell simply drops out rather than failing the whole enquiry.
  const picked = bundle
    ? bundleMembers(bundle)
    : [...new Set(parsed.data.upgrades ?? [])]
        .map((k) => upgradeByKey(k))
        .filter((u): u is NonNullable<typeof u> => Boolean(u));

  if (picked.length === 0) {
    return NextResponse.json({ error: "Nothing selected yet." }, { status: 400 });
  }

  // Bundles are monthly by definition and priced as one line.
  const monthly = bundle
    ? bundle.price
    : picked.filter((u) => u.billing === "monthly").reduce((sum, u) => sum + u.price, 0);
  const oneTime = bundle
    ? 0
    : picked.filter((u) => u.billing === "one_time").reduce((sum, u) => sum + u.price, 0);

  const businessName = company?.trim() || name;

  const detail = [
    `Name:    ${name}`,
    `Email:   ${email}`,
    phone ? `Phone:   ${phone}` : "",
    company ? `Company: ${company}` : "",
    "",
    bundle
      ? `WANTS THE BUNDLE: ${bundle.name} — ${formatCurrency(bundle.price)}/mo ` +
        `(saves ${formatCurrency(bundleSaving(bundle))}/mo vs à la carte)`
      : "WANTS:",
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

  // Write the prospect down before telling anybody about them.
  //
  // This endpoint's whole design is that it survives an unconfigured deploy, so
  // the capture is best-effort by construction: `captureOpportunity` swallows
  // its own failures and returns null. A missing database costs the follow-up
  // ladder and nothing else — the notification below still goes, and the
  // visitor still sees a confirmation.
  const opportunity = await captureOpportunity({
    source: bundle ? "COCKPIT" : "RESERVATION",
    name,
    email,
    phone,
    company,
    note,
    items: bundle ? [bundle.key] : picked.map((u) => u.key),
    quotedMonthlyCents: monthly,
    quotedOneTimeCents: oneTime,
  });

  if (!opportunity) {
    // Worth a loud line: the enquiry still reaches a human, but nothing will
    // chase it if they don't act, so the safety net is off for this one.
    console.warn(`[reserve] ${email} was not captured — no follow-up will be scheduled.`);
  }

  const result = await sendNotification({
    kind: "RESERVATION",
    to: agencyAddress(),
    payload: {
      businessName,
      title: bundle
        ? `BUNDLE enquiry — ${bundle.name}`
        : `Upgrade enquiry — ${picked.length} selected`,
      detail,
      lines: [
        monthly > 0 ? `${formatCurrency(monthly)}/mo` : "",
        oneTime > 0 ? `${formatCurrency(oneTime)} one-time` : "",
      ].filter(Boolean),
      path: "/",
    },
  });

  // And tell the person who filled it in. They used to get nothing at all —
  // a prospect asking to spend four figures a month received silence while we
  // celebrated internally. Fire-and-forget: their receipt must never be able
  // to fail the enquiry, and the agency copy above is the one that matters.
  void sendNotification({
    kind: "ENQUIRY_RECEIPT",
    to: email,
    payload: {
      businessName,
      title: bundle ? bundle.name : picked.map((u) => u.name).join(" + "),
      detail: bundle
        ? bundleMembers(bundle)
            .map((u) => `• ${u.name}`)
            .join("\n")
        : undefined,
      lines: [
        monthly > 0 ? `${formatCurrency(monthly)}/mo` : "",
        oneTime > 0 ? `${formatCurrency(oneTime)} one-time` : "",
      ].filter(Boolean),
      path: "/",
    },
  });

  // Report honestly whether it actually reached anyone.
  //
  // This used to always return a bare {ok:true}, and that was the most
  // expensive line in the codebase: with no transport configured the endpoint
  // told every visitor "cleared for pre-flight" while the enquiry evaporated
  // into a log line. A false success on the only conversion path is worse than
  // an error, because nobody ever finds out.
  //
  // Now the visitor is still thanked — their details did reach the log and the
  // Zapier mirror if either is live — but when nothing delivered they are also
  // given a working way through: a mailto with their whole selection already
  // written out, so the lead is recovered by the person who cared enough to
  // send it rather than lost by us.
  const delivered = result.status === "sent";
  if (!delivered) {
    console.warn(
      `[enquiry] UNDELIVERED (${result.status}: ${result.reason}) — ${name} <${email}> wants ` +
        `${picked.map((u) => u.name).join(", ")}. Full payload logged above.`,
    );
  }

  return NextResponse.json({
    ok: true,
    delivered,
    ...(delivered
      ? {}
      : {
          fallback: {
            email: agencyAddress() || BRAND.notifyEmail,
            subject: `Upgrade enquiry — ${businessName}`,
            body: detail,
          },
        }),
  });
}
