import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import { PARENT_SERVICES, FLIGHT_CHECK } from "@/lib/upgrades";
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

/**
 * The description every search result and share card shows.
 *
 * The service names and the guarantee are interpolated from the catalogue
 * rather than typed. This paragraph is the single most-syndicated sentence
 * about the business — it is what Google prints and what Slack renders — and
 * it was hand-written, so it would have kept naming a service or a guarantee
 * the site no longer offers long after the page itself had moved on. Copy that
 * lives outside the page is the copy nobody remembers to update.
 */
const DESCRIPTION =
  `Specialised upgrades that bolt onto your ${BRAND.parent.name} services — ` +
  `${PARENT_SERVICES.map((s) => s.name).join(", ")}. ` +
  `Be the business an AI assistant names, own the map pack, answer every call on ` +
  `the first ring, and measure it on data you actually own. Month to month, ` +
  `covered by ${FLIGHT_CHECK.label}.`;

/**
 * `metadataBase` is what makes relative OG image paths resolve to absolute URLs.
 * Without it, a shared link renders as a blank card on every platform — which
 * is exactly what was happening before.
 */
export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
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
    url: env.siteUrl,
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
