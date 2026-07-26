"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CLIENT_NAV, ADMIN_NAV, isNavActive } from "@/lib/nav";
import { BRAND } from "@/lib/brand";

/**
 * Mobile top bar + full-screen slide-over menu.
 * The desktop sidebar is hidden below `md`; this takes over there.
 */
export function MobileNav({ variant }: { variant: "client" | "admin" }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  const nav = variant === "admin" ? ADMIN_NAV : CLIENT_NAV;

  // Close the menu on navigation.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md md:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href={variant === "admin" ? "/admin" : "/app"} className="flex items-center gap-2 whitespace-nowrap font-heading text-sm font-bold">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-primary/15 text-cyan shadow-hud">◈</span>
          {BRAND.shortName}
          {variant === "admin" && (
            <span className="ml-1 rounded-full border border-secondary/40 bg-secondary/10 px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-widest text-secondary">
              Admin
            </span>
          )}
        </Link>
        <button
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
          className="grid h-9 w-9 place-items-center rounded-md border border-border text-muted-foreground"
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div className="absolute inset-x-0 top-14 z-40 border-b border-border/60 bg-background/95 p-4 backdrop-blur-xl">
          <nav className="flex flex-col gap-1">
            {nav.map((item) => {
              const active = isNavActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-3 text-sm transition-colors",
                    active ? "bg-cyan/10 text-cyan" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <form action="/api/auth/signout" method="post" className="mt-3 border-t border-border/60 pt-3">
            <button className="w-full rounded-md border border-border px-3 py-2.5 text-left text-sm text-muted-foreground">
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
