import type { MetadataRoute } from "next";
import { BAR_NAME } from "@/lib/brand";

/** Web app manifest (/manifest.webmanifest) so the guest menu installs from Chrome like speakeasy. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: BAR_NAME,
    short_name: "Cortex",
    description: "Home bar menu: pours, cocktails, and cellar.",
    start_url: "/menu",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    // Share a label photo from the phone's share sheet straight into Add bottle (admin).
    share_target: {
      action: "/admin/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: { title: "title", text: "text", url: "url", files: [{ name: "images", accept: ["image/*", ".jpg", ".jpeg", ".png", ".webp", ".heic"] }] },
    },
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
