import { revalidatePath } from "next/cache";
import { Phone } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/tenancy";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Assigning a real Twilio number.
 *
 * Everything else about a client's phone line — greeting, forwarding number,
 * business hours, on/off — is theirs to edit on /app/phone. Buying and
 * assigning the actual number is the one step that has to happen here: it
 * costs real money and needs a Twilio console action (buy the number, point
 * its Voice webhook at /api/voice/inbound) that only an admin can do.
 */
export async function PhoneLineAdmin({ clientId }: { clientId: string }) {
  const line = await prisma.phoneLine.findUnique({ where: { clientId } });
  if (!line) return null; // Inbound Phone Line module not provisioned for this tier.

  async function assignNumber(formData: FormData) {
    "use server";
    await requireAdmin();
    const targetId = String(formData.get("clientId") ?? "");
    const target = await prisma.phoneLine.findUnique({ where: { clientId: targetId }, select: { id: true } });
    if (!target) return;

    const raw = String(formData.get("twilioNumber") ?? "").trim();
    // E.164 or blank to unassign.
    const twilioNumber = raw ? raw.replace(/[^\d+]/g, "") : null;

    await prisma.phoneLine.update({ where: { id: target.id }, data: { twilioNumber } });
    revalidatePath(`/admin/clients/${targetId}`);
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-cyan" />
          <CardTitle>Phone desk</CardTitle>
        </div>
        <Badge variant={line.active && line.twilioNumber ? "success" : "muted"}>
          {line.twilioNumber ? (line.active ? "live" : "number set, off") : "no number"}
        </Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Buy the number in the Twilio console, point its Voice webhook at{" "}
        <code className="font-mono text-xs">/api/voice/inbound</code>, then paste it here. The client
        turns it on themselves once it&apos;s assigned.
        {line.outboundEnabled && " Outbound callbacks are included on this tier."}
      </p>
      <form action={assignNumber} className="mt-4 flex items-end gap-2">
        <input type="hidden" name="clientId" value={clientId} />
        <div className="flex-1">
          <Label htmlFor="twilioNumber">Twilio number (E.164)</Label>
          <Input id="twilioNumber" name="twilioNumber" placeholder="+16025551234" defaultValue={line.twilioNumber ?? ""} />
        </div>
        <Button type="submit" size="sm" variant="outline">
          Save
        </Button>
      </form>
    </Card>
  );
}
