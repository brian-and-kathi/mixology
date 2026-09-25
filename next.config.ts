import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output keeps the Docker runtime image small (server.js + traced deps only).
  // Vercel ignores this and uses its own build output.
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
