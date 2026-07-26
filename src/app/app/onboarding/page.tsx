import { redirect } from "next/navigation";
import { requireClient } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { postWebhook } from "@/lib/webhooks";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const PLATFORMS = ["META", "GOOGLE", "TIKTOK", "LINKEDIN", "YOUTUBE"];

async function completeOnboarding(formData: FormData) {
  "use server";
  const { client, actor } = await requireClient();

  const businessName = String(formData.get("businessName") || client.businessName);
  const industry = String(formData.get("industry") || "");
  const website = String(formData.get("website") || "");
  const goals = String(formData.get("goals") || "");
  const voiceTone = String(formData.get("voiceTone") || "");
  const adPlatforms = PLATFORMS.filter((p) => formData.get(`platform_${p}`) === "on");

  await prisma.clientProfile.update({
    where: { id: client.id },
    data: { businessName, industry, website, goals, voiceTone, adPlatforms, onboardedAt: new Date() },
  });

  // Push to Zapier → HubSpot contact creation.
  await postWebhook(
    env.zapierOnboardHook,
    {
      source: "client_onboarding",
      clientId: client.id,
      email: actor.email,
      businessName,
      industry,
      website,
      adPlatforms,
      goals,
      onboardedAt: new Date().toISOString(),
    },
    { label: "zapier-onboard" },
  );

  redirect("/app");
}

export default async function OnboardingPage() {
  const { client } = await requireClient();
  if (client.onboardedAt) redirect("/app");

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 text-center">
        <div className="hud-label">Onboarding</div>
        <h1 className="mt-1 font-heading text-3xl font-bold">Let&apos;s calibrate your cockpit</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A few details so your agents and ad-ops team know your business.
        </p>
      </div>

      <Card className="hud-corners">
        <form action={completeOnboarding} className="space-y-5">
          <div>
            <Label htmlFor="businessName">Business name</Label>
            <Input id="businessName" name="businessName" defaultValue={client.businessName} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="industry">Industry</Label>
              <Input id="industry" name="industry" placeholder="e.g. Home Services" />
            </div>
            <div>
              <Label htmlFor="website">Website</Label>
              <Input id="website" name="website" placeholder="https://…" />
            </div>
          </div>
          <div>
            <Label>Ad platforms used</Label>
            <div className="mt-1 flex flex-wrap gap-3">
              {PLATFORMS.map((p) => (
                <label key={p} className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:border-cyan/50">
                  <input type="checkbox" name={`platform_${p}`} className="accent-[hsl(var(--hud-cyan))]" />
                  {p}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="goals">Primary goals</Label>
            <Textarea id="goals" name="goals" placeholder="What does winning look like this quarter?" />
          </div>
          <div>
            <Label htmlFor="voiceTone">Brand voice / tone</Label>
            <Textarea id="voiceTone" name="voiceTone" placeholder="e.g. Confident, warm, no jargon — your agents will write in this voice." />
            <CardDescription className="mt-1">Your agents use this to match your voice.</CardDescription>
          </div>
          <Button type="submit" className="w-full">Enter the cockpit →</Button>
        </form>
      </Card>
    </div>
  );
}
