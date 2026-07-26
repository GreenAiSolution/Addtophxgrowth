import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

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

export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description:
    "Deploy a crew of AI automation agents and managed ad-operations, self-serve. Qualify leads, write ads, follow up, and dominate the funnel.",
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
