import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

/**
 * The Lead Intake Webhook, for real.
 *
 * Every tier provisions a module promising "a live endpoint your forms post to";
 * this is that endpoint. A client pastes the URL into their web form, Zapier,
 * or lead-ad connector and leads land in their tenant.
 *
 * Deliberately NOT scored on the request path — a slow model call must never
 * make a client's website form time out. Rows land as NEW and the night shift
 * scores them (see lib/night-shift.ts).
 */

export const runtime = "nodejs";

/** Forms post whatever they post; keep every field, normalise the common ones. */
const Body = z
  .object({
    name: z.string().max(200).optional(),
    first_name: z.string().max(120).optional(),
    last_name: z.string().max(120).optional(),
    full_name: z.string().max(200).optional(),
    email: z.string().max(200).optional(),
    phone: z.string().max(60).optional(),
    tel: z.string().max(60).optional(),
    company: z.string().max(200).optional(),
    business: z.string().max(200).optional(),
    message: z.string().max(5000).optional(),
    comments: z.string().max(5000).optional(),
    notes: z.string().max(5000).optional(),
    source: z.string().max(60).optional(),
  })
  .passthrough();

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-intake-token",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** Constant-time compare so the token can't be probed a character at a time. */
function tokenMatches(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request, { params }: { params: { clientId: string } }) {
  const { clientId } = params;

  // Rate limit before touching the database — this endpoint is public.
  const rl = rateLimit(`intake:${clientId}`, { limit: 60, windowMs: 60_000 });
  if (!rl.success) return json({ error: "Rate limit exceeded" }, 429);

  const url = new URL(req.url);
  const provided = req.headers.get("x-intake-token") ?? url.searchParams.get("token") ?? "";
  if (!provided) return json({ error: "Missing intake token" }, 401);

  const client = await prisma.clientProfile.findUnique({
    where: { id: clientId },
    select: { id: true, intakeToken: true },
  });
  // Same response for "no such tenant" and "wrong token" — don't confirm which
  // client ids exist.
  if (!client?.intakeToken || !tokenMatches(provided, client.intakeToken)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid payload" }, 400);
  const d = parsed.data;

  const name =
    d.name ?? d.full_name ?? [d.first_name, d.last_name].filter(Boolean).join(" ").trim();

  const lead = await prisma.lead.create({
    data: {
      clientId: client.id,
      source: d.source ?? "WEBHOOK",
      name: name || null,
      email: d.email ?? null,
      phone: d.phone ?? d.tel ?? null,
      company: d.company ?? d.business ?? null,
      message: d.message ?? d.comments ?? d.notes ?? null,
      raw: d as object,
    },
    select: { id: true },
  });

  const { emit } = await import("@/lib/event-bus");
  await emit({
    clientId: client.id,
    type: "lead.received",
    key: lead.id,
    data: {
      leadId: lead.id,
      source: d.source ?? "WEBHOOK",
      customer: {
        name: name || null,
        email: d.email ?? null,
        phone: d.phone ?? d.tel ?? null,
        company: d.company ?? d.business ?? null,
      },
      message: d.message ?? d.comments ?? d.notes ?? null,
    },
  });

  return json({ ok: true, leadId: lead.id }, 201);
}
