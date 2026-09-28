import { execSync } from "node:child_process";
import { VERCEL_PROJECT, VERCEL_TEAM } from "@/lib/host-usage";
import { commitRef } from "@/lib/version";

// The System tab's git card: what is running, when it went out, and what production would roll back to.
// Commit and message come from Vercel's system env (VERCEL_GIT_COMMIT_SHA / _MESSAGE; a local checkout asks
// git). The deploy time and the rollback need VERCEL_TOKEN and one call each to the Vercel API; without it,
// the card shows the build time (BUILD_TIME, stamped by next.config) and no rollback row.

export type DeployInfo = {
  short: string;
  full: string;
  message: string | null;
  /** "Deployed" from the Vercel API, else "Built" from the build stamp; null when neither is known. */
  when: { label: "Deployed" | "Built"; iso: string } | null;
  /** The newest earlier READY production deploy at a different commit (production only). */
  rollback: { short: string; message: string | null; iso: string | null } | null;
  /** Why there is no rollback row, in plain words; null when there is one. */
  rollbackNote: string | null;
};

type ApiDeployment = {
  uid?: string;
  id?: string;
  created?: number;
  createdAt?: number;
  ready?: number;
  state?: string;
  readyState?: string;
  meta?: { githubCommitSha?: string; githubCommitMessage?: string };
};

const firstLine = (s: string | null | undefined) => s?.split(/\r?\n/, 1)[0]?.trim() || null;
const isoOf = (ms: number | undefined) => (typeof ms === "number" && ms > 0 ? new Date(ms).toISOString() : null);

function commitMessage(): string | null {
  const env = firstLine(process.env.VERCEL_GIT_COMMIT_MESSAGE);
  if (env) return env;
  try {
    return firstLine(execSync("git log -1 --format=%s", { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    return null;
  }
}

async function vercel<T>(path: string, token: string): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`https://api.vercel.com${path}${sep}teamId=${VERCEL_TEAM}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Newest earlier READY production deploy whose commit differs from `sha` (the list is newest first). */
export function pickRollback(list: ApiDeployment[], currentId: string | null, sha: string): DeployInfo["rollback"] {
  const ready = list.filter((d) => (d.readyState ?? d.state) === "READY");
  const at = currentId ? ready.findIndex((d) => (d.uid ?? d.id) === currentId) : -1;
  const start = at >= 0 ? at + 1 : ready.findIndex((d) => d.meta?.githubCommitSha === sha) + 1;
  const prev = ready.slice(Math.max(start, 0)).find((d) => d.meta?.githubCommitSha && d.meta.githubCommitSha !== sha);
  if (!prev?.meta?.githubCommitSha) return null;
  return { short: prev.meta.githubCommitSha.slice(0, 7), message: firstLine(prev.meta.githubCommitMessage), iso: isoOf(prev.ready ?? prev.created ?? prev.createdAt) };
}

// A deploy's own facts never change, so a good answer is kept for the life of the server instance.
let kept: DeployInfo | null = null;

export async function loadDeployInfo(): Promise<DeployInfo> {
  if (kept) return kept;
  const { short, full } = commitRef();
  const built = process.env.BUILD_TIME?.trim() || null;
  const info: DeployInfo = {
    short,
    full,
    message: commitMessage(),
    when: built ? { label: "Built", iso: built } : null,
    rollback: null,
    rollbackNote: null,
  };
  const token = process.env.VERCEL_TOKEN?.trim();
  const deployment = process.env.VERCEL_DEPLOYMENT_ID?.trim() || null;
  const production = process.env.VERCEL_ENV === "production";
  if (!token || !deployment) {
    info.rollbackNote = production ? "Rollback needs VERCEL_TOKEN." : "Rollback shows on production.";
    return info;
  }
  const [self, list] = await Promise.allSettled([
    vercel<ApiDeployment>(`/v13/deployments/${deployment}`, token),
    production
      ? vercel<{ deployments?: ApiDeployment[] }>(`/v6/deployments?projectId=${VERCEL_PROJECT}&target=production&state=READY&limit=20`, token)
      : Promise.resolve(null),
  ]);
  let complete = true;
  if (self.status === "fulfilled") {
    const iso = isoOf(self.value.ready);
    if (iso) info.when = { label: "Deployed", iso };
  } else {
    complete = false;
  }
  if (!production) {
    info.rollbackNote = "Rollback shows on production.";
  } else if (list.status === "fulfilled" && list.value) {
    info.rollback = pickRollback(list.value.deployments ?? [], deployment, full);
    if (!info.rollback) info.rollbackNote = "No earlier production deploy at another commit.";
  } else {
    complete = false;
    const why = list.status === "rejected" && list.reason instanceof Error ? ` (${list.reason.message})` : "";
    info.rollbackNote = `Vercel didn't return the deploy list${why}.`;
  }
  if (complete) kept = info;
  return info;
}
