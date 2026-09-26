import type { Viewport } from "next";

export const viewport: Viewport = { themeColor: "#07101c" };

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
