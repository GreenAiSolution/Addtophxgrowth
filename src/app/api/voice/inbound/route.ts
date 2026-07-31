import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { verifyTwilioWebhook, twimlGatherTurn, twimlSayAndHangup, twimlResponse } from "@/lib/telephony";
import { buildGreeting, isWithinBusinessHours, parseBusinessHours } from "@/lib/voice";

/**
 * The first thing a caller hears. Twilio's Voice webhook for every inbound
 * call to a client's assigned number — configured on the number itself in the
 * Twilio console, not something a client edits.
 *
 * The AI answers every call, 24 hours a day. Business hours (see
 * lib/voice.ts) only decide whether a later TRANSFER attempts a live hand-off
 * — they never decide whether the call gets picked up.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(req: Request) {
  const verified = await verifyTwilioWebhook(req);
  if (!verified.ok) {
    console.warn("[voice/inbound] rejected:", verified.reason);
    return twimlResponse(twimlSayAndHangup("Sorry, this line isn't available right now."));
  }
  const { params } = verified;
  const to = params.To;
  const from = params.From;
  const callSid = params.CallSid;
  if (!to || !from || !callSid) {
    return twimlResponse(twimlSayAndHangup("Sorry, something went wrong on our end."));
  }

  const phoneLine = await prisma.phoneLine.findUnique({
    where: { twilioNumber: to },
    include: { client: { select: { id: true, businessName: true } } },
  });
  if (!phoneLine || !phoneLine.active) {
    return twimlResponse(twimlSayAndHangup("This number is not currently in service."));
  }

  const withinHours = isWithinBusinessHours(parseBusinessHours(phoneLine.businessHours), new Date());

  // Idempotent: Twilio can and does retry the initial webhook.
  const call =
    (await prisma.callLog.findUnique({ where: { twilioCallSid: callSid } })) ??
    (await prisma.callLog.create({
      data: {
        clientId: phoneLine.clientId,
        phoneLineId: phoneLine.id,
        twilioCallSid: callSid,
        direction: "INBOUND",
        fromNumber: from,
        toNumber: to,
      },
    }));

  // Every call becomes a lead the instant it connects — even one that hangs
  // up before saying a word was a real prospective customer calling in.
  if (!call.leadId) {
    const lead = await prisma.lead.create({
      data: { clientId: phoneLine.clientId, source: "PHONE", phone: from },
    });
    await prisma.callLog.update({ where: { id: call.id }, data: { leadId: lead.id } });
  }

  const greeting = buildGreeting({
    businessName: phoneLine.client.businessName,
    isWithinHours: withinHours,
    customGreeting: phoneLine.greeting,
    customAfterHoursGreeting: phoneLine.afterHoursGreeting,
  });

  return twimlResponse(
    twimlGatherTurn({ say: greeting, gatherActionUrl: `${env.siteUrl}/api/voice/gather` }),
  );
}
