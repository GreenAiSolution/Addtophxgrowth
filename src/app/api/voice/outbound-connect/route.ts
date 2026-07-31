import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { verifyTwilioWebhook, twimlGatherTurn, twimlSayAndHangup, twimlResponse } from "@/lib/telephony";
import { buildGreeting } from "@/lib/voice";

/**
 * Where an outbound call lands once the callee picks up. The CallLog row for
 * this call already exists — the cron that placed the call (see
 * lib/telephony.ts `originateCall` and /api/cron/outbound-calls) created it
 * right after Twilio handed back a CallSid, before the callee ever answered.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(req: Request) {
  const verified = await verifyTwilioWebhook(req);
  if (!verified.ok) {
    return twimlResponse(twimlSayAndHangup("Sorry, something went wrong on our end."));
  }

  const call = await prisma.callLog.findUnique({
    where: { twilioCallSid: verified.params.CallSid },
    include: {
      client: { select: { businessName: true } },
      lead: { select: { message: true, company: true } },
    },
  });
  if (!call) {
    return twimlResponse(twimlSayAndHangup("Sorry, I lost track of this call."));
  }

  const leadContext = call.lead?.message?.slice(0, 140) ?? call.lead?.company ?? null;
  const greeting = buildGreeting({
    businessName: call.client.businessName,
    isWithinHours: true,
    isOutbound: true,
    leadContext,
  });

  return twimlResponse(
    twimlGatherTurn({ say: greeting, gatherActionUrl: `${env.siteUrl}/api/voice/gather` }),
  );
}
