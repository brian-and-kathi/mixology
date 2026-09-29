import { execSync } from "node:child_process";
import { resolveCname, resolveNs } from "node:dns/promises";
import { query } from "@/lib/db";
import { VERCEL_PROJECT, VERCEL_TEAM } from "@/lib/host-usage";
import { commitRef } from "@/lib/version";

// The System tab's "what's running underneath": GitHub, Vercel, Neon, Cloudflare, the domain and the
// runtime. Sources, cheapest first:
//   - Vercel system env (VERCEL_ENV, VERCEL_GIT_*, VERCEL_URL, VERCEL_REGION, VERCEL_DEPLOYMENT_ID, ...)
//   - build stamps from next.config (BUILD_TIME, NEXT_VERSION, REACT_VERSION, COMMIT_TIME, COMMIT_AUTHOR)
//   - one SQL query per request (the Neon branch, endpoint and project are server settings on Neon)
//   - the tokens the usage cards already use (VERCEL_TOKEN, NEON_API_KEY, CLOUDFLARE_API_TOKEN) for names,
//     cached 10 minutes, and DNS lookups for the domain, cached the same
// Anything missing reads "unavailable"; nothing here can fail the page. Never shown: tokens, passwords,
// DATABASE_URL (only its endpoint id and region are read from the host name).

export type Fact = { label: string; value: string; sub?: string | null; mono?: boolean };
export type Link = { href: string; label: string };
export type Facts = { rows: Fact[]; links: Link[]; note?: string | null };

export type StackInfo = {
  where: "Production" | "Preview" | "Local";
  github: Facts;
  vercel: Facts;
  neon: Facts;
  cloudflare: Facts;
  web: Facts;
  diagram: { framework: string; region: string | null; neonBranch: string; postgres: string | null; relay: boolean; repo: string };
};

const UNAVAILABLE = "unavailable";
const FRESH_MS = 10 * 60 * 1000;
const RETRY_MS = 60 * 1000;
const TEAM_SLUG = process.env.VERCEL_TEAM_SLUG?.trim() || "brianandkathi";
const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || "9526fc0cabe18729bb55f7a831815d69";
const RELAY_WORKER = "mixology-relay";
const APEX = "brianandkathi.com";
const HOST = "speakeasy.brianandkathi.com";
/** Neon branch ids of this project, for when NEON_API_KEY can't name them. */
const NEON_BRANCHES: Record<string, string> = { "br-still-math-b553fohk": "main", "br-damp-lab-b54is1bd": "dev" };

const WHEN = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const et = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : `${WHEN.format(d)} ET`;
};
const env = (name: string) => process.env[name]?.trim() || null;
/** next.config build stamps: Next inlines only literal process.env.NAME reads, so these can't go through env(). */
const STAMP = {
  built: process.env.BUILD_TIME?.trim() || null,
  next: process.env.NEXT_VERSION?.trim() || null,
  react: process.env.REACT_VERSION?.trim() || null,
  commitTime: process.env.COMMIT_TIME?.trim() || null,
  commitAuthor: process.env.COMMIT_AUTHOR?.trim() || null,
};
const shortId = (id: string) => (id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id);

function git(args: string): string | null {
  try {
    return execSync(`git ${args}`, { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 2000 }).trim() || null;
  } catch {
    return null;
  }
}

/** Keeps a good answer for 10 minutes and a failed one for 1, per server instance. */
function cached<T>(load: () => Promise<{ value: T; ok: boolean }>): () => Promise<T> {
  let hold: { value: T; until: number } | null = null;
  let pending: Promise<T> | null = null;
  return async () => {
    if (hold && hold.until > Date.now()) return hold.value;
    pending ??= load()
      .then(({ value, ok }) => {
        hold = { value, until: Date.now() + (ok ? FRESH_MS : RETRY_MS) };
        return value;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
}

async function getJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, signal: AbortSignal.timeout(5000), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

const settle = <T>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

// ---- Vercel names (team, project, domains) ----
type VercelNames = { team: string | null; slug: string | null; project: string | null; framework: string | null; node: string | null; domains: string[] | null };
const vercelNames = cached<VercelNames | null>(async () => {
  const token = env("VERCEL_TOKEN");
  if (!token) return { value: null, ok: true };
  const q = `teamId=${VERCEL_TEAM}`;
  const [team, project, domains] = await Promise.all([
    settle(getJson<{ name?: string; slug?: string }>(`https://api.vercel.com/v2/teams/${VERCEL_TEAM}`, token)),
    settle(getJson<{ name?: string; framework?: string; nodeVersion?: string }>(`https://api.vercel.com/v9/projects/${VERCEL_PROJECT}?${q}`, token)),
    settle(getJson<{ domains?: { name?: string }[] }>(`https://api.vercel.com/v9/projects/${VERCEL_PROJECT}/domains?${q}`, token)),
  ]);
  const value: VercelNames = {
    team: team?.name ?? null,
    slug: team?.slug ?? null,
    project: project?.name ?? null,
    framework: project?.framework ?? null,
    node: project?.nodeVersion ?? null,
    domains: domains?.domains ? domains.domains.map((d) => d.name ?? "").filter(Boolean) : null,
  };
  return { value, ok: !!(team && project && domains) };
});

// ---- Neon names (org, project, branch) ----
type NeonNames = { org: string | null; project: string | null; region: string | null; branch: string | null; primary: boolean | null };
function neonNames(projectId: string, branchId: string | null) {
  return neonCache(`${projectId}/${branchId ?? ""}`, async () => {
    const key = env("NEON_API_KEY");
    if (!key) return { value: null, ok: true };
    const base = `https://console.neon.tech/api/v2/projects/${projectId}`;
    const [project, branch] = await Promise.all([
      settle(getJson<{ project?: { name?: string; region_id?: string; owner?: { name?: string } } }>(base, key)),
      branchId ? settle(getJson<{ branch?: { name?: string; default?: boolean; primary?: boolean } }>(`${base}/branches/${branchId}`, key)) : Promise.resolve(null),
    ]);
    const value: NeonNames = {
      org: project?.project?.owner?.name ?? null,
      project: project?.project?.name ?? null,
      region: project?.project?.region_id ?? null,
      branch: branch?.branch?.name ?? null,
      primary: branch?.branch ? !!(branch.branch.default ?? branch.branch.primary) : null,
    };
    return { value, ok: !!project && (!branchId || !!branch) };
  });
}
const neonLoaders = new Map<string, () => Promise<NeonNames | null>>();
function neonCache(key: string, load: () => Promise<{ value: NeonNames | null; ok: boolean }>) {
  let fn = neonLoaders.get(key);
  if (!fn) {
    fn = cached(load);
    neonLoaders.set(key, fn);
  }
  return fn();
}

// ---- Cloudflare account name ----
const cloudflareAccount = cached<string | null>(async () => {
  const token = env("CLOUDFLARE_API_TOKEN");
  if (!token) return { value: null, ok: true };
  const body = await settle(getJson<{ result?: { name?: string } }>(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}`, token));
  // The usage token only needs Account Analytics: Read, so a refusal here is normal and cached like success.
  return { value: body?.result?.name ?? null, ok: true };
});

// ---- DNS ----
type Dns = { cname: string[] | null; ns: string[] | null };
const withTimeout = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
const dnsLookup = cached<Dns>(async () => {
  const [cname, ns] = await Promise.all([settle(withTimeout(resolveCname(HOST), 2000)), settle(withTimeout(resolveNs(APEX), 2000))]);
  return { value: { cname: cname ?? null, ns: ns ? [...ns].sort() : null }, ok: !!(cname && ns) };
});

// ---- Database (per request) ----
type DbRow = { db: string; pg: string; project: string | null; branch: string | null; endpoint: string | null; migration: string | null; applied: string | null; migrations: string };
async function dbFacts(): Promise<DbRow | null> {
  try {
    const [row] = await query<DbRow>(
      `SELECT current_database() AS db, current_setting('server_version') AS pg,
              current_setting('neon.project_id', true) AS project, current_setting('neon.branch_id', true) AS branch,
              current_setting('neon.endpoint_id', true) AS endpoint,
              m.version AS migration, m.applied_at::text AS applied,
              (SELECT count(*) FROM schema_migrations)::text AS migrations
         FROM (SELECT 1) one
         LEFT JOIN LATERAL (SELECT version, applied_at FROM schema_migrations ORDER BY version DESC LIMIT 1) m ON true`,
    );
    return row ?? null;
  } catch {
    return null;
  }
}

/** Endpoint id, region and pooling from DATABASE_URL's host name only; the rest of the URL is never read. */
function dbHost(): { endpoint: string | null; region: string | null; pooled: boolean } {
  try {
    const host = new URL(process.env.DATABASE_URL ?? "").hostname;
    const endpoint = /^(ep-[a-z0-9-]+?)(-pooler)?\./.exec(host)?.[1] ?? null;
    const region = /\.([a-z]{2}-[a-z]+-\d)\.(aws|azure)\.neon\.tech$/.exec(host);
    return { endpoint, region: region ? `${region[2]}-${region[1]}` : null, pooled: host.includes("-pooler.") };
  } catch {
    return { endpoint: null, region: null, pooled: false };
  }
}

function relayHost(): string | null {
  try {
    const url = env("RELAY_URL");
    return url ? new URL(url).host : null;
  } catch {
    return null;
  }
}

export async function loadStackInfo(): Promise<StackInfo> {
  const vercelEnv = env("VERCEL_ENV");
  const where: StackInfo["where"] = vercelEnv === "production" ? "Production" : vercelEnv === "preview" ? "Preview" : "Local";
  const { short, full } = commitRef();
  const host = dbHost();
  const [db, vNames, cfName, dns] = await Promise.all([dbFacts(), vercelNames().catch(() => null), cloudflareAccount().catch(() => null), dnsLookup().catch(() => null)]);
  const neonProject = db?.project || env("NEON_PROJECT_ID") || "green-snow-21814330";
  const branchId = db?.branch ?? null;
  const nNames = await neonNames(neonProject, branchId).catch(() => null);

  // GitHub
  const owner = env("VERCEL_GIT_REPO_OWNER") ?? "bhwithun";
  const repo = env("VERCEL_GIT_REPO_SLUG") ?? "mixology";
  const branch = env("VERCEL_GIT_COMMIT_REF") ?? git("rev-parse --abbrev-ref HEAD") ?? UNAVAILABLE;
  const author = env("VERCEL_GIT_COMMIT_AUTHOR_NAME") ?? STAMP.commitAuthor ?? git("log -1 --format=%an") ?? UNAVAILABLE;
  const login = env("VERCEL_GIT_COMMIT_AUTHOR_LOGIN");
  const committed = et(STAMP.commitTime ?? git("log -1 --format=%cI"));
  const repoUrl = `https://github.com/${owner}/${repo}`;
  const github: Facts = {
    rows: [
      { label: "Owner", value: owner },
      { label: "Repo", value: `${owner}/${repo}`, sub: "private" },
      { label: "Branch", value: branch, mono: true },
      { label: "Author", value: author, sub: login && login !== author ? `@${login}` : null },
      { label: "Committed", value: committed ?? UNAVAILABLE },
    ],
    links: [
      ...(full ? [{ href: `${repoUrl}/commit/${full}`, label: `Commit ${short}` }] : []),
      { href: repoUrl, label: "Repo" },
      ...(branch !== UNAVAILABLE && branch !== "HEAD" ? [{ href: `${repoUrl}/tree/${branch}`, label: "Branch" }] : []),
    ],
  };

  // Vercel
  const slug = vNames?.slug ?? TEAM_SLUG;
  const projectName = vNames?.project ?? "mixology";
  const deployment = env("VERCEL_DEPLOYMENT_ID");
  const url = env("VERCEL_URL");
  const region = env("VERCEL_REGION");
  const domains = vNames?.domains ?? [env("VERCEL_PROJECT_PRODUCTION_URL") ?? HOST];
  const projectUrl = `https://vercel.com/${slug}/${projectName}`;
  const vercel: Facts = {
    rows: [
      { label: "Team", value: vNames?.team ?? slug, sub: vNames?.team && vNames.team !== slug ? slug : null },
      { label: "Project", value: projectName, sub: VERCEL_PROJECT, mono: false },
      { label: "Environment", value: vercelEnv ? vercelEnv[0].toUpperCase() + vercelEnv.slice(1) : "Local (not on Vercel)" },
      { label: "Deployment", value: deployment ?? (where === "Local" ? "none (local)" : UNAVAILABLE), mono: !!deployment },
      { label: "URL", value: url ?? (where === "Local" ? "none (local)" : UNAVAILABLE), mono: !!url },
      { label: "Region", value: region ?? (where === "Local" ? "none (local)" : UNAVAILABLE), mono: !!region },
      { label: "Framework", value: vNames?.framework && vNames.framework !== "nextjs" ? vNames.framework : STAMP.next ? `Next.js ${STAMP.next}` : "Next.js", sub: vNames?.node ? `Node ${vNames.node} (project setting)` : null },
      { label: "Domains", value: domains.join(", ") },
    ],
    links: [
      { href: projectUrl, label: "Project" },
      ...(deployment ? [{ href: `${projectUrl}/${deployment.replace(/^dpl_/, "")}`, label: "This deployment" }] : []),
    ],
    note: env("VERCEL_TOKEN") ? (vNames && vNames.team ? null : "Vercel didn't return the team or project names right now.") : where === "Local" ? null : "Team and domain names need VERCEL_TOKEN.",
  };

  // Neon
  const branchName = nNames?.branch ?? (branchId ? NEON_BRANCHES[branchId] ?? null : null);
  const endpoint = db?.endpoint || host.endpoint;
  const pg = db?.pg ? db.pg.split(/\s/, 1)[0] : null;
  const neon: Facts = {
    rows: [
      { label: "Org", value: nNames?.org ?? "BrianAndKathi" },
      { label: "Project", value: nNames?.project ?? "mixology", sub: neonProject },
      { label: "Branch", value: branchName ?? (branchId ? "unknown name" : UNAVAILABLE), sub: branchId ? `${branchId}${nNames?.primary ? " · default" : ""}` : null },
      { label: "Endpoint", value: endpoint ?? UNAVAILABLE, mono: !!endpoint, sub: host.pooled ? "pooled connection" : null },
      { label: "Region", value: nNames?.region ?? host.region ?? UNAVAILABLE, mono: true },
      { label: "Postgres", value: pg ?? UNAVAILABLE },
      { label: "Database", value: db?.db ?? UNAVAILABLE, mono: !!db },
      { label: "Last migration", value: db?.migration?.replace(/\.sql$/, "") ?? UNAVAILABLE, mono: !!db?.migration, sub: db?.applied ? `applied ${et(db.applied)} · ${db.migrations} total` : null },
    ],
    links: [
      { href: branchId ? `https://console.neon.tech/app/projects/${neonProject}/branches/${branchId}` : `https://console.neon.tech/app/projects/${neonProject}`, label: branchId ? "Branch in console" : "Neon console" },
    ],
    note: db ? null : "The database didn't answer, so the branch and migration are unknown.",
  };

  // Cloudflare
  const relay = relayHost();
  const cloudflare: Facts = {
    rows: [
      { label: "Account", value: cfName ?? shortId(CF_ACCOUNT), mono: !cfName },
      { label: "Worker", value: RELAY_WORKER, mono: true, sub: relay ?? (where === "Local" ? "relay off locally (RELAY_URL not set)" : "RELAY_URL not set, so the relay is off") },
      { label: "Durable Object", value: "Topic", mono: true, sub: "binding TOPIC · SQLite storage" },
      { label: "Topics", value: "bar:cast, bar:menu, bar:status", mono: true },
    ],
    links: [{ href: `https://dash.cloudflare.com/${CF_ACCOUNT}/workers/services/view/${RELAY_WORKER}/production`, label: "Worker dashboard" }],
  };

  // Domain and runtime
  const cname = dns?.cname?.[0] ?? null;
  const web: Facts = {
    rows: [
      { label: "Domain", value: APEX, sub: "registrar Network Solutions" },
      { label: "Name servers", value: dns?.ns ? dns.ns.join(", ") : UNAVAILABLE, mono: !!dns?.ns },
      { label: HOST.split(".")[0], value: cname ? "Vercel" : UNAVAILABLE, sub: cname ? `CNAME ${cname}` : null },
      { label: "Next.js", value: STAMP.next ?? UNAVAILABLE },
      { label: "React", value: STAMP.react ?? UNAVAILABLE },
      { label: "Node", value: process.version },
      { label: "Built", value: et(STAMP.built) ?? UNAVAILABLE },
    ],
    links: [],
  };

  return {
    where,
    github,
    vercel,
    neon,
    cloudflare,
    web,
    diagram: {
      framework: STAMP.next ? `Next.js ${STAMP.next}` : "Next.js",
      region,
      neonBranch: branchName ?? branchId ?? "unknown branch",
      postgres: pg ? pg.split(".")[0] : null,
      relay: !!relay,
      repo: `${owner}/${repo}`,
    },
  };
}
