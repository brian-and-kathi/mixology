import { execSync } from "node:child_process";

/**
 * Commit this process was built from. Vercel sets VERCEL_GIT_COMMIT_SHA; the container
 * gets GIT_SHA from a build arg. A local checkout falls back to git.
 */
export function commitRef(): { short: string; full: string } {
  const fromEnv = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_SHA || "").trim();
  if (/^[0-9a-f]{7,40}$/i.test(fromEnv)) return { full: fromEnv, short: fromEnv.slice(0, 7) };
  try {
    const full = execSync("git rev-parse HEAD", {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (/^[0-9a-f]{7,40}$/i.test(full)) return { full, short: full.slice(0, 7) };
  } catch {
    /* Built without a checkout. */
  }
  return { full: "", short: "unknown" };
}

/** Short commit shown dimly on the TV. */
export function commitHash(): string {
  const { short } = commitRef();
  return short === "unknown" ? "dev" : short;
}
