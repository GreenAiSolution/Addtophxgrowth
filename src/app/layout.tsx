import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import { env } from "@/lib/env";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const DESCRIPTION =
  "Specialised upgrades that bolt onto PHX Growth's AI Employees, Ad Growth Management and Web / SEO / Paid Ads. Be the business an AI assistant names, own the map pack, answer every call in one ring, and measure it all on data you actually own. Priced on the page, month to month, nothing charged today.";

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
      <body className={cn(spaceGrotesk.variable, jetbrainsMono.variable, "min-h-screen")}>
        {children}
      </body>
    </html>
  );
}
