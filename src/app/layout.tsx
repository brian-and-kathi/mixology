import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Geist, Geist_Mono, Rock_Salt } from "next/font/google";
import { RegisterSW } from "@/components/RegisterSW";
import { BAR_NAME } from "@/lib/brand";
import { relaySocketUrl } from "@/lib/relay";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });
const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display",
});
const script = Rock_Salt({ subsets: ["latin"], weight: "400", variable: "--font-script" });

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
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable} ${script.variable}`}>
      <body>
        {relay ? <meta name="relay-url" content={relay} /> : null}
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
