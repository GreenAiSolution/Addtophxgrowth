import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { verifyTwilioWebhook, twimlTakeMessage, twimlSayAndHangup, twimlResponse } from "@/lib/telephony";

/**
 * The `action` callback on the `<Dial>` Twilio Voice XML that TRANSFER
 * produces. Unlike the call-level status callback, this one has to return
 * TwiML — Twilio is still on the line with the caller waiting for what
 * happens next.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(req: Request) {
  const verified = await verifyTwilioWebhook(req);
  if (!verified.ok) {
    return twimlResponse(twimlSayAndHangup("Goodbye."));
  }
  const { params } = verified;
  const dialStatus = params.DialCallStatus; // completed | busy | no-answer | failed | canceled

  if (dialStatus === "completed") {
    // A human took it from here.
    return twimlResponse(twimlSayAndHangup("Thanks for calling."));
  }

  const call = await prisma.callLog.findUnique({ where: { twilioCallSid: params.CallSid } });
  if (call) {
    await prisma.callLog.update({ where: { id: call.id }, data: { outcome: "MESSAGE_TAKEN" } });
  }

  return twimlResponse(
    twimlTakeMessage(
      "Sorry, we couldn't get you through to someone right now — go ahead and leave a message and we'll call you back.",
      `${env.siteUrl}/api/voice/recording`,
    ),
  );
}
