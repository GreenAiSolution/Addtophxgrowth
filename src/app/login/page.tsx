import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { auth, signIn } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { sendNotification, agencyAddress } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";

/**
 * Only ever redirect back to a path on this site. A `next` value that starts
 * with `//` or a scheme is an open-redirect, so anything that isn't a plain
 * internal path falls back to the console.
 */
function safeNext(next: string | undefined): string {
  if (!next) return "/app";
  if (!next.startsWith("/") || next.startsWith("//")) return "/app";
  return next;
}

/**
 * Sign-in, and — when no auth provider is configured — a way through anyway.
 *
 * This page used to end at "No auth providers configured yet. Set
 * GOOGLE_CLIENT_ID or SMTP in your .env", which is a message written for a
 * developer being shown to a prospect. Somebody who just built a five-figure
 * cockpit and pressed Reserve would read that and leave. Now the page always
 * offers a real next step: leave your details and a human gets in touch.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; plan?: string; sent?: string };
}) {
  const session = await auth();
  const next = safeNext(searchParams.next);
  if (session?.user) redirect(session.user.role === "ADMIN" ? "/admin" : next);

  const emailEnabled = Boolean(process.env.EMAIL_SERVER_HOST);
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID);
  const canSignIn = emailEnabled || googleEnabled;
  const sent = searchParams.sent === "1";

  async function requestAccess(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim().slice(0, 120);
    const email = String(formData.get("email") ?? "").trim().slice(0, 200);
    const note = String(formData.get("note") ?? "").trim().slice(0, 2000);
    if (!name || !email.includes("@")) return;

    await sendNotification({
      kind: "RESERVATION",
      to: agencyAddress(),
      payload: {
        businessName: name,
        title: "Access request from the sign-in page",
        detail: [`Name:  ${name}`, `Email: ${email}`, note ? `\n"${note}"` : ""]
          .filter(Boolean)
          .join("\n"),
        path: "/login",
      },
    });

    redirect("/login?sent=1");
  }

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <Card className="w-full max-w-md hud-corners">
        <div className="mb-6 text-center">
          <Link href="/" className="whitespace-nowrap font-heading text-2xl font-bold">
            {BRAND.wordmarkLead}
            <span className="text-gradient">{BRAND.wordmarkAccent}</span>
          </Link>
          <p className="mt-2 text-sm text-muted-foreground">
            {sent
              ? "Thanks — that's with us."
              : next === "/cockpit"
                ? "Sign in and we'll take you straight back to your build."
                : canSignIn
                  ? "Access your growth cockpit."
                  : "Tell us where to reach you and we'll open your cockpit."}
          </p>
        </div>

        {sent ? (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4 text-center">
            <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-400" />
            <p className="mt-2 text-sm text-emerald-300">We&apos;ll be in touch today.</p>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link href="/">Back to the site</Link>
            </Button>
          </div>
        ) : (
          <>
            {emailEnabled && (
              <form
                action={async (formData: FormData) => {
                  "use server";
                  await signIn("nodemailer", {
                    email: String(formData.get("email")),
                    redirectTo: next,
                  });
                }}
                className="space-y-3"
              >
                <div>
                  <Label htmlFor="email">Email magic link</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    placeholder="you@company.com"
                  />
                </div>
                <Button type="submit" className="w-full">
                  Send magic link
                </Button>
              </form>
            )}

            {emailEnabled && googleEnabled && (
              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> OR{" "}
                <span className="h-px flex-1 bg-border" />
              </div>
            )}

            {googleEnabled && (
              <form
                action={async () => {
                  "use server";
                  await signIn("google", { redirectTo: next });
                }}
              >
                <Button type="submit" variant="outline" className="w-full">
                  Continue with Google
                </Button>
              </form>
            )}

            {/* Always a way through. With no provider configured this is the
                only path, and it still has to work — a prospect must never be
                shown a developer's TODO and left with nowhere to go. */}
            {!canSignIn && (
              <form action={requestAccess} className="space-y-3">
                <div>
                  <Label htmlFor="name">Your name</Label>
                  <Input id="name" name="name" required placeholder="Alex Rivera" autoComplete="name" />
                </div>
                <div>
                  <Label htmlFor="access-email">Email</Label>
                  <Input
                    id="access-email"
                    name="email"
                    type="email"
                    required
                    placeholder="you@company.com"
                    autoComplete="email"
                  />
                </div>
                <div>
                  <Label htmlFor="note">What are you after? (optional)</Label>
                  <Textarea id="note" name="note" rows={2} placeholder="Roofing, ~$20k/mo on Meta…" />
                </div>
                <Button type="submit" className="w-full">
                  Request your cockpit <ArrowRight className="h-4 w-4" />
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  A human reads every one of these and replies the same day.
                </p>
              </form>
            )}
          </>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing you agree to our{" "}
          <Link href="/legal/terms" className="text-cyan hover:underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/legal/privacy" className="text-cyan hover:underline">
            Privacy Policy
          </Link>
          .
          {!canSignIn && (
            <>
              {" "}
              Prefer to look around first?{" "}
              <Link href="/cockpit" className="text-cyan hover:underline">
                Build a cockpit
              </Link>
              .
            </>
          )}
        </p>
      </Card>
    </div>
  );
}
