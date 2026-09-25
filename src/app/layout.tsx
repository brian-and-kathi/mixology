import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Geist, Rock_Salt } from "next/font/google";
import { Frame } from "@/components/Frame";
import { RegisterSW } from "@/components/RegisterSW";
import { BAR_NAME } from "@/lib/brand";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["italic"],
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
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${script.variable}`}>
      <body>
        {children}
        <Frame />
        <RegisterSW />
      </body>
    </html>
  );
}
