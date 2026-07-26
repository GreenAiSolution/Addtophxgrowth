import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileNav } from "@/components/mobile-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/app");

  return (
    <div className="min-h-screen md:flex">
      <AppSidebar variant="admin" />
      <div className="min-w-0 flex-1">
        <MobileNav variant="admin" />
        <main className="overflow-x-hidden">
          <div className="container max-w-6xl py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
