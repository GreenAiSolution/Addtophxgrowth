import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; plan?: string };
}) {
  const session = await auth();
  const next = safeNext(searchParams.next);
  if (session?.user) redirect(session.user.role === "ADMIN" ? "/admin" : next);

  const emailEnabled = Boolean(process.env.EMAIL_SERVER_HOST);
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID);

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <Card className="w-full max-w-md hud-corners">
        <div className="mb-6 text-center">
          <Link href="/" className="whitespace-nowrap font-heading text-2xl font-bold">
            {BRAND.wordmarkLead}<span className="text-gradient">{BRAND.wordmarkAccent}</span>
          </Link>
          <p className="mt-2 text-sm text-muted-foreground">
            {next === "/cockpit"
              ? "Sign in and we'll take you straight back to your build."
              : "Access your growth cockpit."}
          </p>
        </div>

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
              <Input id="email" name="email" type="email" required placeholder="you@company.com" />
            </div>
            <Button type="submit" className="w-full">Send magic link</Button>
          </form>
        )}

        {emailEnabled && googleEnabled && (
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> OR <span className="h-px flex-1 bg-border" />
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

        {!emailEnabled && !googleEnabled && (
          <p className="rounded-md border border-border bg-muted/40 p-3 text-center text-xs text-muted-foreground">
            No auth providers configured yet. Set <code>GOOGLE_CLIENT_ID</code> or SMTP
            (<code>EMAIL_SERVER_HOST</code>) in your <code>.env</code> to enable sign-in.
          </p>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing you agree to the terms. Roles are assigned by the agency.
        </p>
      </Card>
    </div>
  );
}
