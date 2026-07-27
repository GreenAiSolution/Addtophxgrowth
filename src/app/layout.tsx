import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import { env } from "@/lib/env";

/**
 * Inter, because that is what phxgrowth.com sets. The site previously used
 * Space Grotesk — a good face, but a visibly different one, and typography is
 * the first thing that tells a visitor they have landed somewhere else.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const DESCRIPTION =
  "Specialised upgrades that bolt onto your PHX/GROWTH services — Premium AI Ads, AI Employees and Website Creation. Be the business an AI assistant names, own the map pack, answer every call on the first ring, and measure it on data you actually own. Month to month, covered by the 30-Day Flight Check.";

/**
 * `metadataBase` is what makes relative OG image paths resolve to absolute URLs.
 * Without it, a shared link renders as a blank card on every platform — which
 * is exactly what was happening before.
 */
export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    // Child pages set their own title; this keeps the brand on the end of it.
    template: `%s`,
  },
  description: DESCRIPTION,
  applicationName: BRAND.name,
  openGraph: {
    type: "website",
    siteName: BRAND.name,
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: DESCRIPTION,
    url: env.appUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={cn(inter.variable, jetbrainsMono.variable, "min-h-screen")}>
        {children}
      </body>
    </html>
  );
}
