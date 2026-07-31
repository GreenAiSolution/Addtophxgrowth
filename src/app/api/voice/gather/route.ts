import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import {
  verifyTwilioWebhook,
  twimlGatherTurn,
  twimlTransfer,
  twimlTakeMessage,
  twimlSayAndHangup,
  twimlResponse,
} from "@/lib/telephony";
import { isWithinBusinessHours, parseBusinessHours } from "@/lib/voice";
import { runVoiceTurn } from "@/lib/voice-agent";

/**
 * Every subsequent turn of a live call. Twilio posts here on every
 * `<Gather>` completion, keyed by `CallSid` — the same identifier Twilio
 * attaches to every request tied to one call, so no id needs to be threaded
 * through query strings.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const verified = await verifyTwilioWebhook(req);
  if (!verified.ok) {
    return twimlResponse(twimlSayAndHangup("Sorry, something went wrong on our end."));
  }
  const { params } = verified;
  const callSid = params.CallSid;
  const speech = (params.SpeechResult ?? "").trim();

  const call = await prisma.callLog.findUnique({
    where: { twilioCallSid: callSid },
    include: {
      phoneLine: true,
      client: {
        select: { id: true, businessName: true, voiceTone: true, verticalKey: true, industry: true },
      },
    },
  });
  if (!call) {
    return twimlResponse(twimlSayAndHangup("Sorry, I lost track of this call."));
  }

  const gatherUrl = `${env.siteUrl}/api/voice/gather`;

  if (!speech) {
    return twimlResponse(
      twimlGatherTurn({ say: "Sorry, I didn't catch that — go ahead.", gatherActionUrl: gatherUrl }),
    );
  }

  const parsed = await runVoiceTurn(call, call.client, speech, call.direction === "OUTBOUND", null);

  if (parsed.action === "TRANSFER") {
    const withinHours = isWithinBusinessHours(parseBusinessHours(call.phoneLine?.businessHours), new Date());
    if (withinHours && call.phoneLine?.forwardingNumber) {
      await prisma.callLog.update({ where: { id: call.id }, data: { outcome: "TRANSFERRED" } });
      return twimlResponse(
        twimlTransfer(parsed.say, call.phoneLine.forwardingNumber, `${env.siteUrl}/api/voice/dial-fallback`),
      );
    }
    // Nobody to hand off to right now — take a message instead of pretending
    // to transfer.
    await prisma.callLog.update({ where: { id: call.id }, data: { outcome: "MESSAGE_TAKEN" } });
    return twimlResponse(
      twimlTakeMessage(
        withinHours
          ? parsed.say
          : `${parsed.say} We're closed right now, but go ahead and leave a message.`,
        `${env.siteUrl}/api/voice/recording`,
      ),
    );
  }

  if (parsed.action === "MESSAGE") {
    await prisma.callLog.update({ where: { id: call.id }, data: { outcome: "MESSAGE_TAKEN" } });
    return twimlResponse(twimlTakeMessage(parsed.say, `${env.siteUrl}/api/voice/recording`));
  }

  if (parsed.action === "END") {
    await prisma.callLog.update({
      where: { id: call.id },
      data: { outcome: call.outcome === "IN_PROGRESS" ? "HUNG_UP" : call.outcome },
    });
    return twimlResponse(twimlSayAndHangup(parsed.say));
  }

  // CONTINUE, and ESTIMATE (which keeps the conversation going afterward).
  return twimlResponse(twimlGatherTurn({ say: parsed.say, gatherActionUrl: gatherUrl }));
}
