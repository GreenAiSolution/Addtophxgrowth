import { redirect } from "next/navigation";
import { Building2, Megaphone, Target, Plug, Mic, UserCheck } from "lucide-react";
import { requireClient } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { postWebhook } from "@/lib/webhooks";
import { notifyAgency } from "@/lib/notify";
import { VERTICAL_PACKS, verticalForIndustry } from "@/lib/verticals";
import { Card, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/**
 * The intake.
 *
 * DIRECTION
 *   This used to be five fields — name, industry, website, goals, tone — which
 *   meant every build phase began with the same hour-long call, asked in the
 *   same order, for every client. These are those questions, asked once, in
 *   writing, before the kickoff rather than during it. It is also what makes
 *   the build fee feel earned from minute one: the client can see the depth of
 *   what we're about to do.
 *
 * BLUEPRINTS
 *   Answers don't just get stored — they get *applied*. The trade sets the
 *   industry pack, the targets are copied onto every ad account so the Spend
 *   Watch checks that depend on them stop being skipped, and the voice fields
 *   compose into the brand voice every agent reads.
 *
 *   One long page rather than a wizard. A wizard hides how much is being asked
 *   and loses answers on a dropped connection; a single form can be filled in
 *   over coffee and submitted once.
 */

const PLATFORMS = ["META", "GOOGLE", "TIKTOK", "LINKEDIN", "YOUTUBE"];

/** Dollars in the form, cents in the database. Blank stays null. */
function cents(raw: FormDataEntryValue | null): number | null {
  const cleaned = String(raw ?? "").replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

function ratio(raw: FormDataEntryValue | null): number | null {
  const cleaned = String(raw ?? "").replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function text(formData: FormData, key: string, max = 2000): string {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

async function completeOnboarding(formData: FormData) {
  "use server";
  const { client, actor } = await requireClient();

  const businessName = text(formData, "businessName", 160) || client.businessName;
  const industry = text(formData, "industry", 120);
  const chosenVertical = text(formData, "verticalKey", 60);
  const wordsWeUse = text(formData, "wordsWeUse", 500);
  const wordsWeAvoid = text(formData, "wordsWeAvoid", 500);
  const voiceTone = text(formData, "voiceTone");

  const monthlyBudgetCents = cents(formData.get("monthlyBudget"));
  const targetCplCents = cents(formData.get("targetCpl"));
  const targetCpaCents = cents(formData.get("targetCpa"));
  const targetRoas = ratio(formData.get("targetRoas"));

  // An explicit trade choice wins; otherwise guess from what they typed.
  const explicitVertical =
    chosenVertical && VERTICAL_PACKS.some((v) => v.key === chosenVertical) ? chosenVertical : null;
  const verticalKey = explicitVertical ?? verticalForIndustry(industry)?.key ?? null;

  // The voice fields compose into the one string every agent reads, so the
  // answers here actually change agent output rather than sitting in a table.
  const composedVoice = [
    voiceTone,
    wordsWeUse ? `Words we use: ${wordsWeUse}.` : "",
    wordsWeAvoid ? `Words we never use: ${wordsWeAvoid}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  await prisma.clientProfile.update({
    where: { id: client.id },
    data: {
      businessName,
      industry,
      verticalKey,
      website: text(formData, "website", 300),
      serviceArea: text(formData, "serviceArea", 300),
      goals: text(formData, "goals"),
      offerSummary: text(formData, "offerSummary"),
      priceRange: text(formData, "priceRange", 120),
      differentiator: text(formData, "differentiator"),
      proofPoints: text(formData, "proofPoints"),
      monthlyBudgetCents,
      targetCplCents,
      targetCpaCents,
      targetRoas,
      crmPlatform: text(formData, "crmPlatform", 120),
      leadDestination: text(formData, "leadDestination", 300),
      approverName: text(formData, "approverName", 120),
      approverEmail: text(formData, "approverEmail", 200),
      wordsWeUse,
      wordsWeAvoid,
      voiceTone: composedVoice,
      adPlatforms: PLATFORMS.filter((p) => formData.get(`platform_${p}`) === "on"),
      intakeAnswers: {
        adAccountIds: text(formData, "adAccountIds", 500),
        competitors: text(formData, "competitors", 500),
        compliance: text(formData, "compliance"),
        anythingElse: text(formData, "anythingElse"),
      },
      onboardedAt: new Date(),
      intakeCompletedAt: new Date(),
    },
  });

  // Push the targets onto every ad account they have. Without this the pacing,
  // cost-per-sale and ROAS checks stay permanently asleep — the client answered
  // the question, so the answer should take effect.
  if (monthlyBudgetCents || targetCpaCents || targetRoas) {
    await prisma.adAccount.updateMany({
      where: { clientId: client.id },
      data: {
        ...(monthlyBudgetCents ? { monthlyBudgetCents } : {}),
        ...(targetCpaCents ? { targetCpaCents } : {}),
        ...(targetRoas ? { targetRoas } : {}),
        ...(targetCplCents ? { targetCplCents } : {}),
      },
    });
  }

  await notifyAgency("REQUEST_FILED", {
    businessName,
    title: "Intake completed — ready for kickoff",
    detail: [
      `Trade: ${verticalKey ?? (industry || "not given")}`,
      `Service area: ${text(formData, "serviceArea", 300) || "not given"}`,
      `Budget: ${monthlyBudgetCents ? `$${monthlyBudgetCents / 100}/mo` : "not given"}`,
      `Target CPL: ${targetCplCents ? `$${targetCplCents / 100}` : "not given"}`,
      `CRM: ${text(formData, "crmPlatform", 120) || "not given"}`,
      `Approver: ${text(formData, "approverName", 120) || "not given"}`,
    ].join("\n"),
    path: `/admin/clients/${client.id}`,
  });

  await postWebhook(
    env.zapierOnboardHook,
    {
      source: "client_onboarding",
      clientId: client.id,
      email: actor.email,
      businessName,
      industry,
      verticalKey,
      monthlyBudgetCents,
      targetCplCents,
      onboardedAt: new Date().toISOString(),
    },
    { label: "zapier-onboard" },
  );

  redirect("/app");
}

function Section({
  icon: Icon,
  index,
  title,
  note,
  children,
}: {
  icon: typeof Building2;
  index: string;
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline gap-3 border-b border-cyan/20 pb-2">
        <span className="hud-value shrink-0 text-lg font-bold text-cyan/50">{index}</span>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-heading text-base font-bold">
            <Icon className="h-4 w-4 text-cyan" /> {title}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default async function OnboardingPage() {
  const { client } = await requireClient();
  if (client.intakeCompletedAt) redirect("/app");

  return (
    <div className="mx-auto max-w-2xl pb-16">
      <div className="mb-8 text-center">
        <div className="hud-label">Intake</div>
        <h1 className="mt-1 font-heading text-3xl font-bold">Let&apos;s calibrate your cockpit</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          These are the questions we&apos;d otherwise ask on your kickoff call. Answering them now
          means we arrive already knowing your business — and your agents start sounding like you
          from the first run. Ten minutes, and only the first two boxes are required.
        </p>
      </div>

      <Card className="hud-corners">
        <form action={completeOnboarding} className="space-y-10">
          <Section
            icon={Building2}
            index="01"
            title="Your business"
            note="The basics, plus your trade — which pre-writes your qualification rules."
          >
            <div>
              <Label htmlFor="businessName">Business name</Label>
              <Input
                id="businessName"
                name="businessName"
                defaultValue={client.businessName}
                required
              />
            </div>
            <div>
              <Label htmlFor="verticalKey">Your trade</Label>
              <select
                id="verticalKey"
                name="verticalKey"
                className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                defaultValue={client.verticalKey ?? ""}
              >
                <option value="">Something else — describe it below</option>
                {VERTICAL_PACKS.map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.trade}
                  </option>
                ))}
              </select>
              <CardDescription className="mt-1">
                Picking one pre-fills your qualification rubric and escalation rules. You can edit
                every word of them afterwards.
              </CardDescription>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="industry">Industry, in your words</Label>
                <Input id="industry" name="industry" placeholder="Commercial roofing" />
              </div>
              <div>
                <Label htmlFor="website">Website</Label>
                <Input id="website" name="website" placeholder="https://…" />
              </div>
            </div>
            <div>
              <Label htmlFor="serviceArea">Where do you serve?</Label>
              <Input id="serviceArea" name="serviceArea" placeholder="Phoenix metro, 50-mile radius" />
            </div>
          </Section>

          <Section
            icon={Megaphone}
            index="02"
            title="Your offer"
            note="What you sell and why people pick you. This is what the ad copy is built from."
          >
            <div>
              <Label htmlFor="offerSummary">What do you sell?</Label>
              <Textarea
                id="offerSummary"
                name="offerSummary"
                rows={2}
                placeholder="Full roof replacement and storm-damage repair, mostly insurance work."
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="priceRange">Typical job value</Label>
                <Input id="priceRange" name="priceRange" placeholder="$8k–$25k" />
              </div>
              <div>
                <Label htmlFor="competitors">Who do you lose to?</Label>
                <Input id="competitors" name="competitors" placeholder="The two big franchises" />
              </div>
            </div>
            <div>
              <Label htmlFor="differentiator">Why do people choose you over them?</Label>
              <Textarea id="differentiator" name="differentiator" rows={2} />
            </div>
            <div>
              <Label htmlFor="proofPoints">What proof can we use?</Label>
              <Textarea
                id="proofPoints"
                name="proofPoints"
                rows={2}
                placeholder="22 years, 400+ reviews, manufacturer certified, lifetime workmanship warranty"
              />
              <CardDescription className="mt-1">
                Real, verifiable claims only — the agents are instructed never to invent proof.
              </CardDescription>
            </div>
          </Section>

          <Section
            icon={Target}
            index="03"
            title="Your numbers"
            note="These arm the Spend Watch. A check with no target is skipped rather than guessed."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="monthlyBudget">Monthly ad budget ($)</Label>
                <Input id="monthlyBudget" name="monthlyBudget" inputMode="decimal" placeholder="15000" />
              </div>
              <div>
                <Label htmlFor="targetCpl">Target cost per lead ($)</Label>
                <Input id="targetCpl" name="targetCpl" inputMode="decimal" placeholder="120" />
              </div>
              <div>
                <Label htmlFor="targetCpa">Target cost per sale ($)</Label>
                <Input id="targetCpa" name="targetCpa" inputMode="decimal" placeholder="900" />
              </div>
              <div>
                <Label htmlFor="targetRoas">Target return on ad spend (×)</Label>
                <Input id="targetRoas" name="targetRoas" inputMode="decimal" placeholder="4" />
              </div>
            </div>
            <div>
              <Label htmlFor="goals">What does winning look like this quarter?</Label>
              <Textarea id="goals" name="goals" rows={2} />
            </div>
          </Section>

          <Section
            icon={Plug}
            index="04"
            title="Your stack"
            note="Where the ads run and where the leads need to land."
          >
            <div>
              <Label>Ad platforms you use</Label>
              <div className="mt-1 flex flex-wrap gap-3">
                {PLATFORMS.map((p) => (
                  <label
                    key={p}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:border-cyan/50"
                  >
                    <input
                      type="checkbox"
                      name={`platform_${p}`}
                      className="accent-[hsl(var(--hud-cyan))]"
                    />
                    {p}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="adAccountIds">Ad account IDs (if you have them handy)</Label>
              <Input id="adAccountIds" name="adAccountIds" placeholder="Meta: 1234567890, Google: 123-456-7890" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="crmPlatform">CRM</Label>
                <Input id="crmPlatform" name="crmPlatform" placeholder="HubSpot / JobNimbus / none" />
              </div>
              <div>
                <Label htmlFor="leadDestination">Where do leads go today?</Label>
                <Input id="leadDestination" name="leadDestination" placeholder="Email to the office" />
              </div>
            </div>
          </Section>

          <Section
            icon={Mic}
            index="05"
            title="Your voice"
            note="Every agent reads this before it writes a single word for you."
          >
            <div>
              <Label htmlFor="voiceTone">How should you sound?</Label>
              <Textarea
                id="voiceTone"
                name="voiceTone"
                rows={2}
                defaultValue={client.voiceTone ?? ""}
                placeholder="Straight-talking, no pressure, like a neighbour who happens to know roofs."
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="wordsWeUse">Words we use</Label>
                <Input id="wordsWeUse" name="wordsWeUse" placeholder="inspection, claim, crew, warranty" />
              </div>
              <div>
                <Label htmlFor="wordsWeAvoid">Words we never use</Label>
                <Input id="wordsWeAvoid" name="wordsWeAvoid" placeholder="cheap, deal, act now" />
              </div>
            </div>
          </Section>

          <Section
            icon={UserCheck}
            index="06"
            title="Approvals and anything else"
            note="Who signs off, and whatever we haven't thought to ask."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="approverName">Who approves creative?</Label>
                <Input id="approverName" name="approverName" placeholder="Rae Delgado" />
              </div>
              <div>
                <Label htmlFor="approverEmail">Their email</Label>
                <Input id="approverEmail" name="approverEmail" type="email" placeholder="rae@…" />
              </div>
            </div>
            <div>
              <Label htmlFor="compliance">Any compliance or licensing rules we must follow?</Label>
              <Textarea id="compliance" name="compliance" rows={2} placeholder="Licence number must appear on every ad." />
            </div>
            <div>
              <Label htmlFor="anythingElse">Anything else we should know?</Label>
              <Textarea id="anythingElse" name="anythingElse" rows={2} />
            </div>
          </Section>

          <div className="border-t border-border/60 pt-6">
            <Button type="submit" className="w-full" size="lg">
              Finish intake and enter the cockpit →
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Everything here is editable later from your console. Blanks are fine — we&apos;ll fill
              them in together on the kickoff call.
            </p>
          </div>
        </form>
      </Card>
    </div>
  );
}
