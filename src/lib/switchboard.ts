/**
 * THE SWITCHBOARD, wired up.
 *
 * `telephony.ts` decides things. This file makes them happen: writes the call,
 * opens the lead, sends the recovery text, and queues a callback through the
 * gate. Same split as `gate.ts` and `night-shift.ts` — nothing below here makes
 * a decision the pure layer has not already made.
 *
 * THE ONE RULE THAT MATTERS HERE
 *   Nothing in this file may throw into a carrier's webhook.
 *
 *   A telephony provider treats a non-2xx as a failed call and will either
 *   retry it or drop the caller. If our database is slow, the caller must still
 *   be spoken to; if the SMS gateway is down, the call record must still be
 *   written. Every function here returns a status instead of raising, exactly
 *   like `sendNotification` does for the same reason one layer up.
 */

import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { postWebhook } from "@/lib/webhooks";
import { notifyAgency } from "@/lib/notify";
import { propose, registerExecutor } from "@/lib/gate";
import {
  formatNumber,
  normaliseNumber,
  shouldTextBack,
  textBackMessage,
  type CallOutcome,
  type TextBackCall,
} from "@/lib/telephony";

export interface SmsResult {
  delivered: boolean;
  /** Which way it went out, or why it did not. Surfaced to the client. */
  detail: string;
}

/**
 * Send one SMS.
 *
 * Mirrors `notify.ts`: try the configured transport, fall back to the Zapier
 * hook so an agency living in a Zap gets the signal with no carrier configured
 * at all, and degrade to a log line when neither exists. Never throws.
 *
 * The `delivered` flag is returned rather than assumed. `/api/reserve` learned
 * this the expensive way — a path that always reported success meant nobody
 * found out for weeks that the key was named wrong.
 */
export async function sendSms(to: string, body: string, from?: string): Promise<SmsResult> {
  const number = normaliseNumber(to);
  if (!number) return { delivered: false, detail: "no usable number" };

  const url = env.smsUrl;
  if (url) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(env.smsToken ? { authorization: `Bearer ${env.smsToken}` } : {}),
        },
        body: JSON.stringify({ to: number, from: from ?? null, body }),
      });
      if (res.ok) return { delivered: true, detail: "sent" };
      return { delivered: false, detail: `gateway returned ${res.status}` };
    } catch (e) {
      return { delivered: false, detail: e instanceof Error ? e.message : "gateway unreachable" };
    }
  }

  const hook = env.zapierLeadHook ?? env.zapierOnboardHook;
  const mirrored = await postWebhook(
    hook,
    { event: "sms.send", to: number, from: from ?? null, body },
    { label: "switchboard-sms" },
  );
  if (mirrored) return { delivered: true, detail: "mirrored to the Zapier hook" };

  console.warn(
    `[switchboard] SMS to ${number} skipped — set VOICE_SMS_URL or ZAPIER_ONBOARD_HOOK_URL to deliver`,
  );
  return { delivered: false, detail: "no SMS transport configured" };
}

export interface RecordCallInput {
  clientId: string;
  externalId: string;
  direction: "INBOUND" | "OUTBOUND";
  from: string;
  to: string;
  callerName?: string | null;
  startedAt?: Date;
  pendingActionId?: string | null;
}

/**
 * Open the call record.
 *
 * Upserts on `[clientId, externalId]`. Carriers retry the opening request as
 * readily as the status callback, and without the upsert a retry produces a
 * second row — which inflates exactly the number the client is being shown.
 */
export async function recordCall(input: RecordCallInput) {
  const startedAt = input.startedAt ?? new Date();
  return prisma.employeeCall.upsert({
    where: { clientId_externalId: { clientId: input.clientId, externalId: input.externalId } },
    create: {
      clientId: input.clientId,
      externalId: input.externalId,
      direction: input.direction,
      fromNumber: input.from,
      toNumber: input.to,
      callerName: input.callerName ?? null,
      startedAt,
      pendingActionId: input.pendingActionId ?? null,
    },
    // Empty on purpose. A retry of the opening request must not reset a call
    // that has since been answered and closed out.
    update: {},
  });
}

export interface CompleteCallInput {
  clientId: string;
  externalId: string;
  outcome: CallOutcome;
  facts?: Record<string, unknown>;
  transcript?: string | null;
  summary?: string | null;
  recordingUrl?: string | null;
  durationSeconds?: number | null;
  endedAt?: Date;
}

/** Close the call out with what actually happened. */
export async function completeCall(input: CompleteCallInput) {
  return prisma.employeeCall.update({
    where: { clientId_externalId: { clientId: input.clientId, externalId: input.externalId } },
    data: {
      outcome: input.outcome,
      ...(input.facts ? { collected: input.facts as never } : {}),
      transcript: input.transcript ?? undefined,
      summary: input.summary ?? undefined,
      recordingUrl: input.recordingUrl ?? undefined,
      durationSeconds: input.durationSeconds ?? undefined,
      endedAt: input.endedAt ?? new Date(),
    },
  });
}

/**
 * A call becomes a lead.
 *
 * A call that never becomes a lead is a call nobody follows up — it sits in a
 * table with no pipeline behind it, which is the dead end `/app/leads` was
 * built to close for the intake endpoint. The switchboard opens the lead on the
 * way past rather than leaving it to a nightly job, because the night shift is
 * a tier feature and a missed call is not.
 */
export async function leadForCall(
  clientId: string,
  callId: string,
  facts: { name?: string; callbackNumber?: string; job?: string },
  fallbackNumber: string,
) {
  const existing = await prisma.employeeCall.findUnique({
    where: { id: callId },
    select: { leadId: true },
  });
  if (existing?.leadId) return existing.leadId;

  const lead = await prisma.lead.create({
    data: {
      clientId,
      source: "PHONE",
      name: facts.name ?? null,
      phone: normaliseNumber(facts.callbackNumber ?? fallbackNumber),
      message: facts.job ?? null,
      raw: facts as object,
    },
    select: { id: true },
  });

  await prisma.employeeCall.update({ where: { id: callId }, data: { leadId: lead.id } });
  return lead.id;
}

export interface TextBackOutcome {
  sent: boolean;
  detail: string;
}

/**
 * The missed-call recovery.
 *
 * The decision is `shouldTextBack`'s, taken before anything is written. The
 * write happens *before* awaiting delivery is claimed and is guarded by the
 * row's own `textBackSentAt`, so two webhooks arriving at once cannot both
 * decide to send. The failure this guards is not theoretical: providers retry,
 * and being apologised to three times reads worse than being missed once.
 */
export async function runTextBack(
  callId: string,
  now = new Date(),
): Promise<TextBackOutcome> {
  const call = await prisma.employeeCall.findUnique({
    where: { id: callId },
    include: { client: { select: { businessName: true, voiceTextBack: true, voiceNumber: true } } },
  });
  if (!call) return { sent: false, detail: "no such call" };

  const verdict = shouldTextBack(call as unknown as TextBackCall, now);
  if (!verdict.send) return { sent: false, detail: verdict.why };

  // Claim it first. A second webhook arriving mid-flight finds the stamp set
  // and refuses, which is the cheap version of a lock and the correct
  // behaviour either way — an unsent text is recoverable, a doubled one is not.
  const claimed = await prisma.employeeCall.updateMany({
    where: { id: callId, textBackSentAt: null },
    data: { textBackSentAt: now },
  });
  if (claimed.count === 0) return { sent: false, detail: "already sent" };

  const body = textBackMessage({
    businessName: call.client.businessName,
    custom: call.client.voiceTextBack,
  });
  const result = await sendSms(call.fromNumber, body, call.client.voiceNumber ?? undefined);

  if (!result.delivered) {
    // Release the claim so a later sweep or a manual retry can try again, and
    // record why. A stamp left behind on an undelivered text would tell the
    // client they had answered somebody they never reached.
    await prisma.employeeCall.update({
      where: { id: callId },
      data: { textBackSentAt: null, textBackError: result.detail },
    });
    return { sent: false, detail: result.detail };
  }

  await prisma.employeeCall.update({ where: { id: callId }, data: { textBackError: null } });
  return { sent: true, detail: result.detail };
}

/**
 * Queue a callback to somebody who went quiet.
 *
 * Business-initiated, so it goes through the gate — `needsRelease` in
 * `employees.ts` is the rule and `call.outbound` is the kind. Nothing here
 * dials; releasing is what dials, and the executor below is what the sweep
 * calls once a human has said yes.
 */
export async function proposeCallback(input: {
  clientId: string;
  leadId: string;
  name: string | null;
  number: string;
  why: string;
}) {
  const number = normaliseNumber(input.number);
  if (!number) return null;

  return propose({
    clientId: input.clientId,
    kind: "call.outbound",
    summary: `Ring ${input.name ?? formatNumber(number)} — ${input.why}`,
    subject: input.name ?? formatNumber(number),
    payload: { leadId: input.leadId, number, name: input.name, why: input.why },
    // One proposal per lead. A loop waking twice on the same quiet lead must
    // not queue two calls to the same person.
    dedupeKey: `call.outbound:${input.leadId}`,
  });
}

/**
 * What actually happens when a callback is released.
 *
 * Registered here rather than in the gate, because the gate must not know how
 * to place a call. Until a carrier is configured this throws, and that is the
 * designed behaviour: `sweep` records FAILED with the reason, so an action
 * nobody can perform never looks like one that was performed.
 */
registerExecutor("call.outbound", async (payload) => {
  const p = payload as { number?: string; leadId?: string; name?: string | null };
  const number = normaliseNumber(p.number);
  if (!number) throw new Error("No usable number on the released callback.");

  const url = env.smsUrl;
  if (!url) {
    const hook = env.zapierLeadHook ?? env.zapierOnboardHook;
    const mirrored = await postWebhook(
      hook,
      { event: "call.outbound", to: number, leadId: p.leadId, name: p.name ?? null },
      { label: "switchboard-call" },
    );
    if (!mirrored) {
      throw new Error(
        "No telephony transport is configured. Set VOICE_SMS_URL or a Zapier hook to place calls.",
      );
    }
    return { placed: true, via: "zapier", to: number };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(env.smsToken ? { authorization: `Bearer ${env.smsToken}` } : {}),
    },
    body: JSON.stringify({ action: "call", to: number, leadId: p.leadId }),
  });
  if (!res.ok) throw new Error(`Telephony gateway returned ${res.status}`);
  return { placed: true, via: "gateway", to: number };
});

/**
 * Tell somebody a call came in that needs a human.
 *
 * Only for calls that ended without the crew being able to finish the job.
 * A notification per answered call would be a notification nobody reads, which
 * is the judgement `notify.ts` already made about the daily brief.
 */
export async function notifyIfUnresolved(callId: string) {
  const call = await prisma.employeeCall.findUnique({
    where: { id: callId },
    include: { client: { select: { businessName: true } } },
  });
  if (!call) return;
  if (!["MISSED", "VOICEMAIL", "FAILED", "TRANSFERRED"].includes(call.outcome)) return;

  notifyAgency("REQUEST_FILED", {
    businessName: call.client.businessName,
    title: `Call ${call.outcome.toLowerCase()} — ${formatNumber(call.fromNumber)}`,
    detail: call.summary ?? undefined,
    path: "/app/calls",
    lines: [
      `Direction: ${call.direction.toLowerCase()}`,
      `From: ${formatNumber(call.fromNumber)}`,
      call.textBackSentAt ? "Recovery text sent." : "No recovery text went out.",
    ],
  });
}
