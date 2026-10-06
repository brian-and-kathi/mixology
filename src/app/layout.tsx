import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, DM_Serif_Display, DM_Serif_Text, Geist, Geist_Mono, Nunito_Sans, Rock_Salt } from "next/font/google";
import { RegisterSW } from "@/components/RegisterSW";
import { BAR_NAME } from "@/lib/brand";
import { relaySocketUrl } from "@/lib/relay";
import "./globals.css";

// Font option B (Brian, 2026-10-06): Nunito Sans for body and UI (guest pages, TV, admin), DM Serif Display for big
// titles (--font-title), DM Serif Text for drink names and the gold brand/ingredient sublines (--font-serif). Both
// DM Serif faces have one weight (400); never ask for bolder (no faux bold). Rock Salt stays the logo, Geist Mono the
// TV band labels, tags, clock, QR caption and build hash.
const sans = Nunito_Sans({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });
const title = DM_Serif_Display({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-title" });
const serif = DM_Serif_Text({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif" });
const script = Rock_Salt({ subsets: ["latin"], weight: "400", variable: "--font-script" });
// The Hart & Ward cover pages keep their old faces (cover.css maps --font-sans/--font-display back to these), so
// they look exactly as before. Not preloaded: only the cover pages download them.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", preload: false });
const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display",
  preload: false,
});

export const metadata: Metadata = {
  title: { default: BAR_NAME, template: `%s · ${BAR_NAME}` },
  description: "Home bar menu: pours, cocktails, and cellar.",
  robots: { index: false, follow: false },
  // iPhone home-screen support (the manifest covers Chrome/Android).
  appleWebApp: { capable: true, title: "Cortex", statusBarStyle: "black" },
  icons: { apple: "/apple-touch-icon.png" },
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Realtime relay socket URL (lib/relay-client reads it); absent when RELAY_URL is unset, so
  // pages just poll as before. React hoists the meta into <head>.
  const relay = relaySocketUrl();
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${title.variable} ${serif.variable} ${script.variable} ${geist.variable} ${display.variable}`}>
      <body>
        {relay ? <meta name="relay-url" content={relay} /> : null}
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
