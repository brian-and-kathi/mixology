import { after } from "next/server";
import { claimBarVersions, type BarClaim } from "@/lib/bar-versions";

// Realtime relay, server side (DESIGN §realtime, relay/README.md).
//
// After a write that a TV or phone is waiting to see, tell the relay "topic changed". The relay
// only fans out {topic, version, kind}; clients refetch through the normal API. This is
// fire-and-forget: it runs after the response is sent (next/server `after`), gives up after
// 1.5 s, and swallows every error, so a slow or missing relay never fails or slows the action.
// With RELAY_URL or RELAY_SECRET unset it does nothing, and clients keep polling as before.
//
// Database change signal (migration 028): triggers count every change the board or a pop-up shows,
// including direct SQL. Each publish first claims those counters, so one notice also covers any
// direct-SQL edit made before it, and the fallback sync (publishChanges) never re-announces a change
// the app already published.

export type RelayTopic = "bar:cast" | "bar:menu";

const TIMEOUT_MS = 1500;

function relayBase(): string | null {
  const url = process.env.RELAY_URL?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}

/** The browser's WebSocket endpoint, or null when the relay is off. Safe to expose. */
export function relaySocketUrl(): string | null {
  const base = relayBase();
  if (!base) return null;
  try {
    const url = new URL(`${base}/ws`);
    url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
    return url.toString();
  } catch {
    return null;
  }
}

async function send(base: string, secret: string, topic: RelayTopic, kind: string): Promise<boolean> {
  // Wall-clock version: stays monotonic even if the relay ever loses its stored state.
  const body = JSON.stringify({ topic, kind, version: Date.now() });
  try {
    const res = await fetch(`${base}/publish`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) console.warn(`relay: publish ${topic} answered ${res.status}`);
    return res.ok;
  } catch (err) {
    console.warn(`relay: publish ${topic} failed (${(err as Error)?.name ?? "error"})`);
    return false;
  }
}

/** Claim the database counters; any failure just means "nothing extra to announce". */
async function claim(): Promise<BarClaim | null> {
  try {
    return await claimBarVersions();
  } catch (err) {
    console.warn(`relay: claim failed (${(err as { code?: string })?.code ?? "error"})`);
    return null;
  }
}

const moved = (c: BarClaim | null): RelayTopic[] => (c ? [...(c.menuChanged ? ["bar:menu" as const] : []), ...(c.castChanged ? ["bar:cast" as const] : [])] : []);

/**
 * Publish a "changed" notice for `topic`, plus any other topic the database counters say moved.
 * Never throws, never awaits the relay on the request path.
 */
export function publish(topic: RelayTopic, kind: string): void {
  const base = relayBase();
  const secret = process.env.RELAY_SECRET;
  if (!base || !secret) return;
  const run = async () => {
    const topics = new Set<RelayTopic>([topic, ...moved(await claim())]);
    await Promise.all([...topics].map((t) => send(base, secret, t, kind)));
  };
  try {
    after(run);
  } catch {
    void run(); // outside a request scope (scripts): just start it
  }
}

/**
 * The sync step (POST /api/bar/sync: `npm run notify` after direct SQL, and the clients' slow
 * fallback check). Publishes only the topics that moved since the last publish, and waits for the
 * relay so the caller can report what went out. Returns the current versions (null without 028).
 */
export async function publishChanges(kind: string): Promise<{ versions: BarClaim | null; published: RelayTopic[] }> {
  const c = await claimBarVersions();
  const topics = moved(c);
  const base = relayBase();
  const secret = process.env.RELAY_SECRET;
  if (!base || !secret || !topics.length) return { versions: c, published: [] };
  const ok = await Promise.all(topics.map((t) => send(base, secret, t, kind)));
  return { versions: c, published: topics.filter((_, i) => ok[i]) };
}
