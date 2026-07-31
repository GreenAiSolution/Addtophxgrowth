import { NextResponse } from "next/server";
import { z } from "zod";
import { requireClient, AuthError } from "@/lib/tenancy";
import { createEstimate, estimateFromDescription, formatMoney } from "@/lib/estimate";

/**
 * The Estimator skill endpoint.
 *
 * Two ways in, one gate out:
 *   - `requests`: structured line items (a form, an app UI, or a voice bot that
 *     already resolved the rate card) → priced directly, no model.
 *   - `description`: free-text job (a call summary) → the Estimator bot maps it
 *     to the rate card, then prices it.
 *
 * Either way the quote is queued at the gate as `quote.send` and is NOT sent —
 * the owner releases it from /app/gate. This route never delivers a quote; it
 * only proposes one. That is what makes it safe to expose to a future voice
 * agent as its "price this job" tool.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const lineSchema = z.object({ key: z.string().min(1), qty: z.number().positive() });

const bodySchema = z
  .object({
    description: z.string().min(1).max(4000).optional(),
    requests: z.array(lineSchema).max(50).optional(),
    customerName: z.string().max(200).optional(),
    customerEmail: z.string().email().max(200).optional(),
    customerPhone: z.string().max(50).optional(),
    leadId: z.string().max(64).optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine((b) => (b.requests && b.requests.length > 0) || b.description, {
    message: "Provide either `requests` or a `description`.",
  });

export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.issues[0]?.message ?? "Invalid request" : "Invalid JSON";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const common = {
    clientId: client.id,
    customerName: body.customerName,
    customerEmail: body.customerEmail,
    customerPhone: body.customerPhone,
    leadId: body.leadId,
  };

  const result =
    body.requests && body.requests.length > 0
      ? await createEstimate({ ...common, requests: body.requests, notes: body.notes })
      : await estimateFromDescription({ ...common, description: body.description! });

  if (!result.ok) {
    const status =
      result.reason === "DISABLED" ? 403 : result.reason === "NOTHING_TO_PRICE" ? 422 : 400;
    return NextResponse.json(
      { error: result.reason, detail: result.detail, warnings: result.warnings },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    estimateId: result.estimateId,
    total: formatMoney(result.priced.totalCents),
    totalCents: result.priced.totalCents,
    depositCents: result.priced.depositCents,
    lineItems: result.priced.lineItems,
    validUntil: result.priced.validUntil.toISOString().slice(0, 10),
    warnings: result.warnings,
    queued: true,
    message: "Quote priced and held at the gate for release. Nothing has been sent.",
  });
}
