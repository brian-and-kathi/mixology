/**
 * Short commit shown dimly on the TV, centered over the QR code.
 * Vercel sets VERCEL_GIT_COMMIT_SHA; the container gets GIT_SHA from a build arg (see Dockerfile).
 */
export function commitHash(): string {
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_SHA || "").trim();
  return sha ? sha.slice(0, 7) : "dev";
}
