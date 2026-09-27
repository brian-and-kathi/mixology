import type { Metadata, Viewport } from "next";
import "./cover.css";

export const metadata: Metadata = {
  title: { absolute: "Hart & Ward" },
  description: "Locks, keys, and safes.",
};

export const viewport: Viewport = { themeColor: "#100e0c" };

export default function CoverLayout({ children }: { children: React.ReactNode }) {
  return children;
}
