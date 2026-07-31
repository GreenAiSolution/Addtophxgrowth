import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { originateCall } from "@/lib/telephony";
import { isWithinBusinessHours, parseBusinessHours, selectLeadsForCallback, DEFAULT_OUTBOUND_HOURS } from "@/lib/voice";

/**
 * The outbound half of the phone desk. Every 30 minutes (see vercel.json),
 * walks every Scale+/Command client with outbound calling turned on and
 * dials the leads that are due a callback — a missed call, an unworked form
 * fill, anyone who hasn't heard back yet.
 *
 * No model call in this route. Which leads get called is decided by
 * `selectLeadsForCallback`, a pure function in lib/voice.ts — the model only
 * runs once a human actually answers (lib/voice-agent.ts, driven by
 * /api/voice/outbound-connect).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BATCH_PER_CLIENT = 10;

function authorized(req: Request): boolean {
  const secret = env.optional("CRON_SECRET");
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function GET(req: Request) {
  if (!authorized(req)) return json({ error: "Unauthorized" }, 401);

  const now = new Date();
  const lines = await prisma.phoneLine.findMany({
    where: { active: true, outboundEnabled: true, twilioNumber: { not: null } },
    include: { client: { select: { id: true } } },
  });

  const results: Array<{ clientId: string; dialed: number; skipped: string }> = [];

  for (const line of lines) {
    if (!line.twilioNumber) continue;

    const hours = parseBusinessHours(line.businessHours) ?? DEFAULT_OUTBOUND_HOURS;
    if (!isWithinBusinessHours(hours, now)) {
      results.push({ clientId: line.clientId, dialed: 0, skipped: "outside calling hours" });
      continue;
    }

    const candidates = await prisma.lead.findMany({
      where: {
        clientId: line.clientId,
        status: { in: ["NEW", "SCORED"] },
        phone: { not: null },
        createdAt: { gte: new Date(now.getTime() - 8 * 24 * 3_600_000) },
      },
      select: {
        id: true,
        phone: true,
        message: true,
        company: true,
        createdAt: true,
        callLogs: {
          where: { direction: "OUTBOUND" },
          select: { createdAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
      take: 100,
    });

    const due = selectLeadsForCallback(
      candidates.map((c) => ({
        id: c.id,
        createdAt: c.createdAt,
        outboundAttempts: c.callLogs.length,
        lastOutboundAt: c.callLogs[0]?.createdAt ?? null,
      })),
      now,
      BATCH_PER_CLIENT,
    );

    let dialed = 0;
    for (const d of due) {
      const lead = candidates.find((c) => c.id === d.id);
      if (!lead?.phone) continue;

      const call = await originateCall({
        to: lead.phone,
        from: line.twilioNumber,
        twimlUrl: `${env.siteUrl}/api/voice/outbound-connect`,
        statusCallbackUrl: `${env.siteUrl}/api/voice/status`,
      });

      if (call.status !== "sent") {
        console.warn(`[outbound-calls] ${line.clientId} lead ${lead.id}: ${call.status} (${call.reason})`);
        continue;
      }

      await prisma.callLog.create({
        data: {
          clientId: line.clientId,
          phoneLineId: line.id,
          twilioCallSid: call.sid,
          direction: "OUTBOUND",
          fromNumber: line.twilioNumber,
          toNumber: lead.phone,
          leadId: lead.id,
        },
      });
      dialed++;
    }

    results.push({ clientId: line.clientId, dialed, skipped: dialed === 0 ? "no leads due" : "" });
  }

  return json({ ok: true, lines: lines.length, results });
}
