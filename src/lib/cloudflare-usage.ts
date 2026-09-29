import { bytes, count, meter, type HostPanel, type Meter } from "@/lib/host-usage";

/**
 * Today's Cloudflare usage for the whole account, against the Workers Free plan.
 * Free allowances reset daily at 00:00 UTC (storage is a running total).
 * Sources: developers.cloudflare.com/workers/platform/limits/,
 * /durable-objects/platform/pricing/, /workers/platform/pricing/ (KV).
 * The token needs Account > Account Analytics > Read and nothing else.
 */
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || "9526fc0cabe18729bb55f7a831815d69";
const RELAY = "mixology-relay";
const GRAPHQL = "https://api.cloudflare.com/client/v4/graphql";
const FRESH_MS = 5 * 60 * 1000;
const RETRY_MS = 60 * 1000;
const GB = 1024 ** 3;

const FREE = {
  workerRequests: 100_000,
  doRequests: 100_000,
  doGbSeconds: 13_000,
  rowsRead: 5_000_000,
  rowsWritten: 100_000,
  sqlBytes: 5 * GB,
  kvReads: 100_000,
  kvWrites: 1_000,
  kvDeletes: 1_000,
  kvLists: 1_000,
  kvBytes: 1 * GB,
};

/** Hibernated WebSocket messages are billed at 20 incoming messages per request. */
const WS_MESSAGES_PER_REQUEST = 20;
const AUTH_ERROR = /authenticat|authoriz|permission|access/i;

const QUERY = `query CloudflareUsage($account: string!, $start: Time!, $end: Time!, $storageFrom: Time!) {
  viewer {
    accounts(filter: {accountTag: $account}) {
      workers: workersInvocationsAdaptive(limit: 1000, filter: {datetime_geq: $start, datetime_lt: $end}) {
        sum { requests }
        dimensions { scriptName }
      }
      doInvocations: durableObjectsInvocationsAdaptiveGroups(limit: 1000, filter: {datetime_geq: $start, datetime_lt: $end}) {
        sum { requests }
        dimensions { type }
      }
      doPeriodic: durableObjectsPeriodicGroups(limit: 1000, filter: {datetime_geq: $start, datetime_lt: $end}) {
        sum { duration rowsRead rowsWritten }
      }
      doSql: durableObjectsSqlStorageGroups(limit: 1000, filter: {datetime_geq: $storageFrom, datetime_lt: $end}, orderBy: [datetime_DESC]) {
        max { storedBytes }
        dimensions { namespaceId datetime }
      }
      kvOps: kvOperationsAdaptiveGroups(limit: 1000, filter: {datetime_geq: $start, datetime_lt: $end}) {
        sum { requests }
        dimensions { actionType }
      }
      kvStorage: kvStorageAdaptiveGroups(limit: 1000, filter: {datetime_geq: $storageFrom, datetime_lt: $end}, orderBy: [datetime_DESC]) {
        max { byteCount }
        dimensions { namespaceId datetime }
      }
    }
  }
}`;

type Sum<T> = { sum?: Partial<T> | null };
type Account = {
  workers?: (Sum<{ requests: number }> & { dimensions?: { scriptName?: string } })[];
  doInvocations?: (Sum<{ requests: number }> & { dimensions?: { type?: string } })[];
  doPeriodic?: Sum<{ duration: number; rowsRead: number; rowsWritten: number }>[];
  doSql?: { max?: { storedBytes?: number } | null; dimensions?: { namespaceId?: string } }[];
  kvOps?: (Sum<{ requests: number }> & { dimensions?: { actionType?: string } })[];
  kvStorage?: { max?: { byteCount?: number } | null; dimensions?: { namespaceId?: string } }[];
};
type GraphqlBody = {
  data?: { viewer?: { accounts?: Account[] } } | null;
  errors?: { message?: string; extensions?: { code?: string | number } }[] | null;
};

export type CloudflareUsage = {
  workerRequests: number;
  relayRequests: number;
  scripts: number;
  doRequests: number;
  doGbSeconds: number;
  rowsRead: number;
  rowsWritten: number;
  sqlBytes: number;
  kvReads: number;
  kvWrites: number;
  kvDeletes: number;
  kvLists: number;
  kvBytes: number;
};

function total<T extends Record<string, number>>(rows: Sum<T>[] | undefined, key: keyof T, keep?: (row: Sum<T>) => boolean): number {
  return (rows ?? []).filter((row) => (keep ? keep(row) : true)).reduce((sum, row) => sum + Number(row.sum?.[key] ?? 0), 0);
}

/** Storage samples arrive newest first; keep the latest per namespace and add them up. */
function latestPerNamespace<R extends { dimensions?: { namespaceId?: string } }>(rows: R[] | undefined, value: (row: R) => number): number {
  const seen = new Set<string>();
  let sum = 0;
  for (const row of rows ?? []) {
    const id = row.dimensions?.namespaceId ?? "";
    if (seen.has(id)) continue;
    seen.add(id);
    sum += value(row);
  }
  return sum;
}

export function summarize(account: Account): CloudflareUsage {
  const kv = (action: string) => total(account.kvOps, "requests", (row) => (row as { dimensions?: { actionType?: string } }).dimensions?.actionType === action);
  const hibernated = total(account.doInvocations, "requests", (row) => (row as { dimensions?: { type?: string } }).dimensions?.type === "hibernation");
  const direct = total(account.doInvocations, "requests") - hibernated;
  return {
    workerRequests: total(account.workers, "requests"),
    relayRequests: total(account.workers, "requests", (row) => (row as { dimensions?: { scriptName?: string } }).dimensions?.scriptName === RELAY),
    scripts: new Set((account.workers ?? []).map((row) => row.dimensions?.scriptName ?? "")).size,
    doRequests: direct + Math.ceil(hibernated / WS_MESSAGES_PER_REQUEST),
    doGbSeconds: total(account.doPeriodic, "duration"),
    rowsRead: total(account.doPeriodic, "rowsRead"),
    rowsWritten: total(account.doPeriodic, "rowsWritten"),
    sqlBytes: latestPerNamespace(account.doSql, (row) => Number(row.max?.storedBytes ?? 0)),
    kvReads: kv("read"),
    kvWrites: kv("write"),
    kvDeletes: kv("delete"),
    kvLists: kv("list"),
    kvBytes: latestPerNamespace(account.kvStorage, (row) => Number(row.max?.byteCount ?? 0)),
  };
}

function gbSeconds(n: number): string {
  if (n === 0) return "0 GB-s";
  if (n < 10) return `${n.toFixed(n < 1 ? 2 : 1)} GB-s`;
  return `${count(n)} GB-s`;
}

/** The allowances that run out first for this app; the rest sit under "All limits". */
const ROWS: { key: keyof typeof FREE; label: string; format: (n: number) => string; tight?: boolean }[] = [
  { key: "workerRequests", label: "Workers requests", format: count, tight: true },
  { key: "doRequests", label: "Durable Object requests", format: count },
  { key: "doGbSeconds", label: "Durable Object duration", format: gbSeconds },
  { key: "rowsRead", label: "SQLite rows read", format: count },
  { key: "rowsWritten", label: "SQLite rows written", format: count, tight: true },
  { key: "sqlBytes", label: "SQLite storage", format: bytes },
  { key: "kvReads", label: "KV reads", format: count },
  { key: "kvWrites", label: "KV writes", format: count, tight: true },
  { key: "kvDeletes", label: "KV deletes", format: count },
  { key: "kvLists", label: "KV lists", format: count, tight: true },
  { key: "kvBytes", label: "KV storage", format: bytes },
];

/** Same rows, same order, in every state; "—" until there is a reading. */
function meters(usage: CloudflareUsage | null): Meter[] {
  return ROWS.map((row) => {
    const limit = FREE[row.key];
    const m: Meter = usage
      ? meter(row.label, usage[row.key], limit, row.format)
      : { label: row.label, used: "—", limit: row.format(limit), ratio: null };
    return row.tight ? { ...m, tight: true } : m;
  });
}

/** Free allowances reset at 00:00 UTC; say when that is in Brian's time (8 PM EDT, 7 PM EST). */
export function resetLabel(now = new Date()): string {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  const at = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "numeric" })
    .format(next)
    .replace(":00", "");
  return `Today · resets ${at} ET`;
}

export function panel(usage: CloudflareUsage | null, note: string | null): HostPanel {
  return { title: "Cloudflare · Workers Free", detail: resetLabel(), note, meters: meters(usage) };
}

function shareNote(usage: CloudflareUsage): string {
  const active = usage.scripts === 1 ? "1 Worker" : `${usage.scripts} Workers`;
  return `Whole account, ${active} active today. ${RELAY} made ${count(usage.relayRequests)} of the Workers requests.`;
}

async function fetchUsage(token: string): Promise<HostPanel> {
  const now = new Date();
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const storageFrom = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  let res: Response;
  try {
    res = await fetch(GRAPHQL, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        query: QUERY,
        variables: { account: ACCOUNT, start: start.toISOString(), end: now.toISOString(), storageFrom: storageFrom.toISOString() },
      }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
  } catch {
    return panel(null, "Cloudflare did not return today's usage.");
  }
  let body: GraphqlBody | null = null;
  try {
    body = (await res.json()) as GraphqlBody;
  } catch {
    body = null;
  }
  const errors = body?.errors ?? [];
  const refused =
    res.status === 401 ||
    res.status === 403 ||
    errors.some((e) => [9106, 9109, 10000].includes(Number(e.extensions?.code ?? (e as { code?: number }).code)) || AUTH_ERROR.test(e.message ?? ""));
  const account = res.ok ? body?.data?.viewer?.accounts?.[0] : undefined;
  if (!account) {
    return panel(
      null,
      refused
        ? "Cloudflare refused CLOUDFLARE_API_TOKEN. It needs Account Analytics: Read on this account."
        : "Cloudflare did not return today's usage.",
    );
  }
  const usage = summarize(account);
  const partial = errors.length > 0 ? " Some figures were missing from Cloudflare's reply." : "";
  return panel(usage, shareNote(usage) + partial);
}

let cached: { at: number; ttl: number; token: string; panel: HostPanel } | null = null;
let inflight: Promise<HostPanel> | null = null;

/** Cached for five minutes per server instance so the admin page stays quick; failures retry after a minute. */
export async function loadCloudflarePanel(): Promise<HostPanel> {
  // Local screenshots only: `USAGE_MOCK=1 next dev`. Production builds drop this branch and the module.
  if (process.env.NODE_ENV === "development" && process.env.USAGE_MOCK === "1") {
    return (await import("@/lib/usage-mock")).mockCloudflarePanel();
  }
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!token) {
    return panel(null, "Set CLOUDFLARE_API_TOKEN to read today's usage. The allowances are the Workers Free plan.");
  }
  if (cached && cached.token === token && Date.now() - cached.at < cached.ttl) return cached.panel;
  if (!inflight) {
    inflight = fetchUsage(token)
      .then((result) => {
        const ok = result.meters.some((m) => m.ratio != null);
        cached = { at: Date.now(), ttl: ok ? FRESH_MS : RETRY_MS, token, panel: result };
        return result;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}
