import { after } from "next/server";

// Realtime relay, server side (DESIGN §realtime, relay/README.md).
//
// After a write that a TV or phone is waiting to see, tell the relay "topic changed". The relay
// only fans out {topic, version, kind}; clients refetch through the normal API. This is
// fire-and-forget: it runs after the response is sent (next/server `after`), gives up after
// 1.5 s, and swallows every error, so a slow or missing relay never fails or slows the action.
// With RELAY_URL or RELAY_SECRET unset it does nothing, and clients keep polling as before.

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

/** Publish a "changed" notice. Never throws, never awaits the relay on the request path. */
export function publish(topic: RelayTopic, kind: string): void {
  const base = relayBase();
  const secret = process.env.RELAY_SECRET;
  if (!base || !secret) return;
  // Wall-clock version: stays monotonic even if the relay ever loses its stored state.
  const body = JSON.stringify({ topic, kind, version: Date.now() });
  const send = async () => {
    try {
      const res = await fetch(`${base}/publish`, {
        method: "POST",
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) console.warn(`relay: publish ${topic} answered ${res.status}`);
    } catch (err) {
      console.warn(`relay: publish ${topic} failed (${(err as Error)?.name ?? "error"})`);
    }
  };
  try {
    after(send);
  } catch {
    void send(); // outside a request scope (scripts): just start it
  }
}
