import { query } from "@/lib/db";

/** Hobby allowances for this app's Vercel team. Used when the billing API is quiet. */
const VERCEL_HOBBY = [
  { label: "Fast data transfer", limit: 100 * 1e9, limitLabel: "100 GB", unit: "bytes" as const },
  { label: "Function invocations", limit: 1_000_000, limitLabel: "1,000,000", unit: "count" as const },
  { label: "Active CPU", limit: 4 * 3600, limitLabel: "4 hr", unit: "seconds" as const },
  { label: "Provisioned memory", limit: 360, limitLabel: "360 GB-hr", unit: "gb-hours" as const },
  { label: "Fast origin transfer", limit: 10 * 1e9, limitLabel: "10 GB", unit: "bytes" as const },
];

const NEON_PROJECT = process.env.NEON_PROJECT_ID?.trim() || "green-snow-21814330";
const VERCEL_TEAM = process.env.VERCEL_TEAM_ID?.trim() || "team_tiRwsxJAo2wmRvzJ2GToaYnZ";
const VERCEL_PROJECT = process.env.VERCEL_PROJECT_ID?.trim() || "prj_BQ8ioCaCKTUz0pnMFW0SlGw9l5IZ";
/** Team usage page on the Vercel dashboard (the team is brianandkathi). */
const VERCEL_USAGE_URL = process.env.VERCEL_USAGE_URL?.trim() || "https://vercel.com/brianandkathi/~/usage";

export type Meter = {
  label: string;
  used: string;
  limit: string | null;
  /** 0–1 when both sides are known. */
  ratio: number | null;
  /** Shown while the card is collapsed; the rest wait under "All limits" unless they reach 80%. */
  tight?: boolean;
  /** The host doesn't report this figure (not an error): `used` is drawn muted. */
  unavailable?: boolean;
};

export type HostPanel = {
  title: string;
  detail: string | null;
  note: string | null;
  /** Optional link after the note, opened in a new tab. */
  link?: { href: string; label: string };
  meters: Meter[];
};

type NeonProject = {
  synthetic_storage_size?: number;
  compute_time_seconds?: number;
  data_transfer_bytes?: number;
  branch_logical_size_limit_bytes?: number;
  consumption_period_end?: string;
  default_endpoint_settings?: { autoscaling_limit_min_cu?: number; autoscaling_limit_max_cu?: number };
  owner?: { subscription_type?: string; branches_limit?: number };
};

export function bytes(n: number): string {
  if (n < 1024) return `${Math.round(n)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

function hours(seconds: number): string {
  const h = seconds / 3600;
  return `${h >= 10 ? h.toFixed(0) : h.toFixed(1)} hr`;
}

export function count(n: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

export function meter(label: string, used: number, limit: number | null, format: (n: number) => string): Meter {
  return {
    label,
    used: format(used),
    limit: limit == null ? null : format(limit),
    ratio: limit && limit > 0 ? Math.min(1, used / limit) : null,
  };
}

async function neonProject(): Promise<{ project: NeonProject; branches: number | null } | null> {
  const key = process.env.NEON_API_KEY?.trim();
  if (!key) return null;
  const headers = { authorization: `Bearer ${key}`, accept: "application/json" };
  const signal = AbortSignal.timeout(8000);
  const [projectRes, branchRes] = await Promise.all([
    fetch(`https://console.neon.tech/api/v2/projects/${NEON_PROJECT}`, { headers, signal, cache: "no-store" }),
    fetch(`https://console.neon.tech/api/v2/projects/${NEON_PROJECT}/branches`, { headers, signal, cache: "no-store" }),
  ]);
  if (!projectRes.ok) return null;
  const body = (await projectRes.json()) as { project?: NeonProject };
  const project = body.project ?? (body as NeonProject);
  let branches: number | null = null;
  if (branchRes.ok) {
    const listed = (await branchRes.json()) as { branches?: unknown[] };
    branches = Array.isArray(listed.branches) ? listed.branches.length : null;
  }
  return { project, branches };
}

async function databaseBytes(): Promise<{ bytes: number; name: string } | null> {
  try {
    const [row] = await query<{ bytes: string; name: string }>(
      "SELECT pg_database_size(current_database())::bigint AS bytes, current_database() AS name",
    );
    if (!row) return null;
    return { bytes: Number(row.bytes), name: row.name };
  } catch {
    return null;
  }
}

/** Storage, compute, and transfer for the Neon project, against the Free plan caps. */
export async function loadNeonPanel(): Promise<HostPanel> {
  const live = await neonProject().catch(() => null);
  const db = await databaseBytes();
  const project = live?.project;
  const plan = project?.owner?.subscription_type === "free_v3" || !project ? "Free" : project.owner?.subscription_type ?? "Neon";
  const storageCap = project?.branch_logical_size_limit_bytes ?? 512 * 1024 * 1024;
  const meters: Meter[] = [];
  if (project?.synthetic_storage_size != null) {
    meters.push(meter("Project storage", project.synthetic_storage_size, storageCap, bytes));
  } else if (db) {
    meters.push(meter(`Database ${db.name}`, db.bytes, storageCap, bytes));
  }
  if (project?.compute_time_seconds != null) {
    meters.push(meter("Compute", project.compute_time_seconds, 100 * 3600, hours));
  }
  if (project?.data_transfer_bytes != null) {
    meters.push(meter("Public transfer", project.data_transfer_bytes, 5 * 1024 * 1024 * 1024, bytes));
  }
  const min = project?.default_endpoint_settings?.autoscaling_limit_min_cu;
  const max = project?.default_endpoint_settings?.autoscaling_limit_max_cu;
  if (min != null && max != null) {
    meters.push({ label: "Compute size", used: min === max ? `${min} CU` : `${min}–${max} CU`, limit: "2 CU", ratio: max / 2 });
  }
  const branchLimit = project?.owner?.branches_limit ?? 10;
  if (live?.branches != null) {
    meters.push(meter("Branches", live.branches, branchLimit, count));
  }
  const until = project?.consumption_period_end ? `Resets ${project.consumption_period_end.slice(0, 10)}` : null;
  const note = project
    ? null
    : "Compute hours and transfer need NEON_API_KEY. Storage here is this database, measured against the 512 MB project cap.";
  return { title: `Neon · ${plan}`, detail: until, note, meters };
}

export type Charge = {
  ChargeCategory?: string;
  ConsumedQuantity?: number | string | null;
  ConsumedUnit?: string | null;
  ServiceName?: string;
  Tags?: { ProjectId?: string; projectId?: string };
};

function chargeUsed(rows: Charge[], service: string): number | null {
  const hits = rows.filter((row) => {
    if (row.ChargeCategory && row.ChargeCategory !== "Usage") return false;
    if ((row.ServiceName ?? "").toLowerCase() !== service.toLowerCase()) return false;
    const project = row.Tags?.ProjectId ?? row.Tags?.projectId;
    return !project || project === VERCEL_PROJECT;
  });
  if (hits.length === 0) return null;
  return hits.reduce((sum, row) => sum + Number(row.ConsumedQuantity ?? 0), 0);
}

/** This month's Vercel usage for the mixology project, against Hobby allowances. */
export async function loadVercelPanel(): Promise<HostPanel> {
  // Local screenshots only: `USAGE_MOCK=1 next dev`. Production builds drop this branch and the module.
  if (process.env.NODE_ENV === "development" && (process.env.USAGE_MOCK === "1" || process.env.USAGE_MOCK === "vercel-hobby")) {
    const mock = await import("@/lib/usage-mock");
    return process.env.USAGE_MOCK === "vercel-hobby" ? mock.mockVercelHobbyPanel() : mock.mockVercelPanel();
  }
  const token = process.env.VERCEL_TOKEN?.trim();
  const from = new Date();
  from.setUTCDate(1);
  from.setUTCHours(0, 0, 0, 0);
  // The charges API works in whole UTC days: end at the next midnight.
  const to = new Date();
  to.setUTCHours(0, 0, 0, 0);
  to.setUTCDate(to.getUTCDate() + 1);
  let rows: Charge[] | null = null;
  let note: string | null = null;
  if (!token) {
    note = "Set VERCEL_TOKEN to read this month's usage. The allowances are the Hobby plan.";
  } else {
    try {
      const url = `https://api.vercel.com/v1/billing/charges?teamId=${VERCEL_TEAM}&from=${from.toISOString()}&to=${to.toISOString()}`;
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${token}`, accept: "application/jsonl" },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      if (res.status === 404) {
        // Hobby teams have no billing subscription, so the charges API has nothing to return.
        return vercelHobbyPanel();
      }
      if (!res.ok) {
        note =
          res.status === 401 || res.status === 403
            ? `Vercel refused VERCEL_TOKEN (HTTP ${res.status}). It needs access to the brianandkathi team, not one project.`
            : `Vercel did not return this month's usage (HTTP ${res.status}).`;
      } else {
        const text = await res.text();
        rows = text
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => JSON.parse(line) as Charge);
      }
    } catch (error) {
      note =
        error instanceof SyntaxError
          ? "Vercel's usage reply could not be read."
          : "Vercel did not return this month's usage.";
    }
  }
  return vercelPanel(rows, note);
}

/** Hobby: Vercel keeps usage on its dashboard only. Same five rows, marked "not shared", and a link there. */
export function vercelHobbyPanel(): HostPanel {
  return {
    title: "Vercel · Hobby",
    detail: "This month",
    note: "Vercel doesn't share live usage on the Hobby plan.",
    link: { href: VERCEL_USAGE_URL, label: "See usage on vercel.com" },
    meters: VERCEL_HOBBY.map((item) => ({ label: item.label, used: "not shared", limit: item.limitLabel, ratio: null, unavailable: true })),
  };
}

/** Five rows in every state; "—" where the charges have no matching line. */
export function vercelPanel(rows: Charge[] | null, note: string | null): HostPanel {
  const meters = VERCEL_HOBBY.map((item) => {
    const used = rows ? chargeUsed(rows, item.label) : null;
    if (used == null) return { label: item.label, used: "—", limit: item.limitLabel, ratio: null };
    // Allowances are decimal (100 GB = 100e9 B); print the plan's own label, not a binary conversion.
    return { ...meter(item.label, used, item.limit, (n) => formatUnit(n, item.unit)), limit: item.limitLabel };
  });
  if (!note && rows && rows.length > 0 && meters.every((m) => m.ratio == null)) {
    note = "Vercel returned charges, but none matched these meters.";
  }
  return { title: "Vercel · Hobby", detail: "This month", note, meters };
}

function formatUnit(n: number, unit: "bytes" | "count" | "seconds" | "gb-hours"): string {
  if (unit === "bytes") return decimalBytes(n);
  if (unit === "seconds") return hours(n);
  if (unit === "gb-hours") return `${n >= 10 ? n.toFixed(0) : n.toFixed(1)} GB-hr`;
  return count(n);
}

/** Vercel meters transfer in decimal units (1 GB = 1e9 B), like its allowances. */
function decimalBytes(n: number): string {
  if (n < 1000) return `${Math.round(n)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1000;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}
