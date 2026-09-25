import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output keeps the Docker runtime image small (server.js + traced deps only).
  // Vercel ignores this and uses its own build output.
  output: "standalone",
  poweredByHeader: false,
  // Always revalidate the service worker script so updates are picked up.
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] }];
  },
};

export default nextConfig;
