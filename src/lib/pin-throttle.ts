import { createHmac } from "node:crypto";
import { query } from "@/lib/db";
import { throttleKey } from "@/lib/auth";

/**
 * Wrong-PIN throttle, stored in Neon (admin_login_attempts, migration 019) so it holds across server
 * instances and restarts. Every attempt is counted against two keys: the client IP and the device-id
 * cookie. Either key being locked blocks the attempt, so clearing the cookie or reloading doesn't reset
 * the IP count. 5 wrong in a row lock the key for 5 min, then 15 min, then 1 h (the ladder is in the SQL
 * function admin_login_fail). A correct PIN deletes both rows. Keys are stored as HMAC digests only.
 */
export type ThrottleKeys = { kind: "ip" | "device"; key: Buffer }[];

export function throttleKeys(ip: string, deviceId: string | null): ThrottleKeys {
  const k = throttleKey();
  const digest = (v: string) => createHmac("sha256", k).update(v).digest();
  const keys: ThrottleKeys = [{ kind: "ip", key: digest(`ip:${ip}`) }];
  if (deviceId) keys.push({ kind: "device", key: digest(`device:${deviceId}`) });
  return keys;
}

const secondsUntil = (t: string | Date | null) => (t ? Math.max(0, Math.ceil((new Date(t).getTime() - Date.now()) / 1000)) : 0);

/** Seconds until every key is unlocked (0 when none is locked). Uses the database clock. */
export async function lockedSeconds(keys: ThrottleKeys): Promise<number> {
  const rows = await query<{ s: number | null }>(
    `SELECT ceil(extract(epoch FROM max(locked_until) - now()))::int AS s
       FROM admin_login_attempts
      WHERE locked_until > now() AND (kind, key_hash) IN (SELECT * FROM unnest($1::text[], $2::bytea[]))`,
    [keys.map((k) => k.kind), keys.map((k) => `\\x${k.key.toString("hex")}`)],
  );
  return Math.max(0, rows[0]?.s ?? 0);
}

/** Counts one wrong PIN against every key; returns seconds locked (0 if this try didn't lock anything). */
export async function recordFailure(keys: ThrottleKeys): Promise<number> {
  let seconds = 0;
  for (const k of keys) {
    const [row] = await query<{ until: string | null; s: number | null }>(
      "SELECT ceil(extract(epoch FROM u - now()))::int AS s, u AS until FROM admin_login_fail($1, $2::bytea) AS u",
      [k.kind, `\\x${k.key.toString("hex")}`],
    );
    seconds = Math.max(seconds, row?.s ?? secondsUntil(row?.until ?? null));
  }
  return seconds;
}

/** Correct PIN: forget both keys (count and lockout ladder start over). */
export async function clearFailures(keys: ThrottleKeys): Promise<void> {
  await query(
    "DELETE FROM admin_login_attempts WHERE (kind, key_hash) IN (SELECT * FROM unnest($1::text[], $2::bytea[]))",
    [keys.map((k) => k.kind), keys.map((k) => `\\x${k.key.toString("hex")}`)],
  );
}

/** Client IP as Vercel reports it (it overwrites these headers, so clients can't spoof them). */
export function clientIp(h: Headers): string {
  return h.get("x-real-ip")?.trim() || (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
}
