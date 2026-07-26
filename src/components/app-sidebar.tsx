"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldHalf } from "lucide-react";
import { cn } from "@/lib/utils";
import { CLIENT_NAV, ADMIN_NAV, isNavActive } from "@/lib/nav";
import { BRAND } from "@/lib/brand";

export function AppSidebar({ variant }: { variant: "client" | "admin" }) {
  const pathname = usePathname();
  const nav = variant === "admin" ? ADMIN_NAV : CLIENT_NAV;

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border/60 bg-card/40 p-4 md:flex">
      <Link href={variant === "admin" ? "/admin" : "/app"} className="mb-8 flex items-center gap-2 px-2 font-heading text-lg font-bold">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-primary/15 text-cyan shadow-hud">◈</span>
        <span className="whitespace-nowrap text-base">{BRAND.shortName}</span>
      </Link>

      {variant === "admin" && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-secondary/30 bg-secondary/10 px-3 py-2 text-xs text-secondary">
          <ShieldHalf className="h-4 w-4" /> Admin console
        </div>
      )}

      <nav className="flex flex-1 flex-col gap-1">
        {nav.map((item) => {
          const active = isNavActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-cyan/10 text-cyan shadow-[inset_2px_0_0_hsl(var(--hud-cyan))]"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <form action="/api/auth/signout" method="post" className="mt-4">
        <button className="w-full rounded-md border border-border px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive">
          Sign out
        </button>
      </form>
    </aside>
  );
}
