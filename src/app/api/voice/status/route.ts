import { prisma } from "@/lib/prisma";
import { verifyTwilioWebhook } from "@/lib/telephony";
import { summarizeTranscript, type TranscriptTurn } from "@/lib/voice";
import type { CallOutcome } from "@prisma/client";

/**
 * The call-level status callback — fires once the whole call ends, however it
 * ended. Fire-and-forget on Twilio's side: no TwiML is read from the
 * response, so this only ever needs to return 2xx.
 *
 * Only ever *widens* to a more specific outcome that a mid-call turn already
 * set (TRANSFERRED, ESTIMATE_GIVEN, MESSAGE_TAKEN) — never overwrites one.
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
  const call = await prisma.callLog.findUnique({ where: { twilioCallSid: params.CallSid } });
  if (!call) return noContent();

  const callStatus = params.CallStatus; // completed | busy | no-answer | failed | canceled
  const duration = params.CallDuration ? Number(params.CallDuration) : null;
  const recordingUrl = params.RecordingUrl || null;

  let outcome: CallOutcome = call.outcome;
  if (call.outcome === "IN_PROGRESS") {
    outcome = callStatus === "completed" ? "HUNG_UP" : "NO_ANSWER";
  }

  await prisma.callLog.update({
    where: { id: call.id },
    data: {
      outcome,
      endedAt: new Date(),
      durationSec: Number.isFinite(duration) ? duration : call.durationSec,
      recordingUrl: recordingUrl ?? call.recordingUrl,
    },
  });

  // Backfill the lead's message with the call transcript so it reads like a
  // real inbound submission on /app/leads and scores properly overnight.
  if (call.leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: call.leadId }, select: { message: true } });
    if (lead && !lead.message) {
      const transcript = (call.transcript as unknown as TranscriptTurn[] | null) ?? [];
      await prisma.lead.update({
        where: { id: call.leadId },
        data: { message: summarizeTranscript(transcript) },
      });
    }
  }

  return noContent();
}
