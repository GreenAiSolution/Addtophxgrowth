import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ensureClientProfile } from "@/lib/client-data";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileNav } from "@/components/mobile-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "ADMIN") redirect("/admin");

  // Guarantee a tenant row exists on first login.
  await ensureClientProfile(session.user.id, session.user.name ?? undefined);

  return (
    <div className="min-h-screen md:flex">
      <AppSidebar variant="client" />
      <div className="min-w-0 flex-1">
        <MobileNav variant="client" />
        <main className="overflow-x-hidden">
          <div className="container max-w-6xl py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
