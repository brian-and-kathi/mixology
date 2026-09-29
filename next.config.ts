import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

/** Build stamps for the admin System tab (read on the server only). Missing pieces stay empty. */
function stamp(read: () => string): string {
  try {
    return read().trim();
  } catch {
    return "";
  }
}
const pkgVersion = (name: string) => stamp(() => JSON.parse(readFileSync(`node_modules/${name}/package.json`, "utf8")).version);
const gitLog = (format: string) => stamp(() => execSync(`git log -1 --format=${format}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));

const nextConfig: NextConfig = {
  // Standalone output keeps the Docker runtime image small (server.js + traced deps only).
  // Vercel ignores this and uses its own build output.
  output: "standalone",
  poweredByHeader: false,
  env: {
    BUILD_TIME: new Date().toISOString(),
    NEXT_VERSION: pkgVersion("next"),
    REACT_VERSION: pkgVersion("react"),
    COMMIT_AUTHOR: gitLog("%an"),
  },
  // Always revalidate the service worker script so updates are picked up.
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] }];
  },
};

export default nextConfig;
