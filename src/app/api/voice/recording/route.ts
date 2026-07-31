import { prisma } from "@/lib/prisma";
import { verifyTwilioWebhook } from "@/lib/telephony";
import { sendNotification, agencyAddress } from "@/lib/notify";

/**
 * The `<Record>` recordingStatusCallback — fires once a voicemail-style
 * message finishes. Fire-and-forget; the caller has already heard the
 * "we've got your message" line inline in the TwiML that started the
 * recording.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noContent() {
  return new Response(null, { status: 204 });
}

export async function POST(req: Request) {
  const verified = await verifyTwilioWebhook(req);
  if (!verified.ok) return noContent();

  const { params } = verified;
  const call = await prisma.callLog.findUnique({
    where: { twilioCallSid: params.CallSid },
    include: { client: { select: { businessName: true } } },
  });
  if (!call) return noContent();

  const recordingUrl = params.RecordingUrl || null;
  await prisma.callLog.update({
    where: { id: call.id },
    data: { recordingUrl: recordingUrl ?? call.recordingUrl, outcome: "MESSAGE_TAKEN" },
  });

  await sendNotification({
    kind: "VOICEMAIL_LEFT",
    to: agencyAddress(),
    payload: {
      businessName: call.client.businessName,
      title: call.fromNumber,
      detail: recordingUrl ? `Recording: ${recordingUrl}` : "No recording captured.",
      path: "/app/phone",
    },
  });

  return noContent();
}
