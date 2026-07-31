/**
 * The "quote.send" gate executor for phone-desk estimates.
 *
 * `lib/gate.ts` shipped with the kind defined and nothing registered — "the
 * catalogue says every quote waits for a named release, and that promise had
 * no executor behind it yet." This is that executor: it runs once a human
 * releases the action (or its review window would close it, though quote.send
 * is MANUAL-only and never auto-releases), and it is what turns a DRAFT
 * Estimate into a SENT one.
 *
 * Side-effect import: `/api/cron/gate/route.ts` imports this module so
 * `registerExecutor` runs before `sweep()` — see the comment there.
 */

import { prisma } from "@/lib/prisma";
import { registerExecutor } from "@/lib/gate";
import { sendNotification } from "@/lib/notify";
import { sendSms } from "@/lib/telephony";
import { formatRange } from "@/lib/estimate";

interface QuoteSendPayload {
  estimateId: string;
  clientId: string;
  leadId?: string | null;
  callerName?: string;
  callbackPhone?: string;
  jobType?: string;
  priceLowCents?: number;
  priceHighCents?: number;
  basis?: string;
}

registerExecutor("quote.send", async (rawPayload) => {
  const payload = rawPayload as QuoteSendPayload;
  if (!payload.estimateId) throw new Error("quote.send payload is missing estimateId");

  const [estimate, client] = await Promise.all([
    prisma.estimate.findUnique({ where: { id: payload.estimateId } }),
    prisma.clientProfile.findUnique({
      where: { id: payload.clientId },
      select: { businessName: true, phoneLine: { select: { twilioNumber: true } } },
    }),
  ]);
  if (!estimate) throw new Error(`No such estimate: ${payload.estimateId}`);
  if (!client) throw new Error(`No such client: ${payload.clientId}`);
  if (estimate.status === "SENT") {
    return { skipped: true, reason: "already sent" };
  }

  const range = formatRange(estimate.priceLowCents, estimate.priceHighCents);
  const lead = estimate.leadId
    ? await prisma.lead.findUnique({ where: { id: estimate.leadId }, select: { email: true, phone: true } })
    : null;

  const emailTo = lead?.email ?? null;
  const smsTo = payload.callbackPhone ?? lead?.phone ?? null;

  const emailResult = await sendNotification({
    kind: "ESTIMATE_READY",
    to: emailTo,
    payload: {
      businessName: client.businessName,
      title: `Your estimate from ${client.businessName}`,
      detail: `For ${estimate.jobType}: ${range}. ${estimate.basis}`,
      lines: [range],
    },
  });

  let smsResult: Awaited<ReturnType<typeof sendSms>> | null = null;
  if (smsTo && client.phoneLine?.twilioNumber) {
    smsResult = await sendSms({
      to: smsTo,
      from: client.phoneLine.twilioNumber,
      body: `${client.businessName}: your estimate for ${estimate.jobType} is ${range}. This is a range — we'll confirm the exact number before any work starts.`,
    });
  }

  await prisma.estimate.update({
    where: { id: estimate.id },
    data: { status: "SENT", sentAt: new Date() },
  });

  return {
    email: { to: emailTo, status: emailResult.status },
    sms: smsTo ? { to: smsTo, status: smsResult?.status ?? "skipped" } : { status: "skipped", reason: "no phone" },
  };
});

export {};
