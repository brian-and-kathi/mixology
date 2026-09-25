import { NextResponse, type NextRequest } from "next/server";
import {
  DEVICE_COOKIE, SESSION_COOKIE, adminConfigured, deviceCookieOptions, newDeviceId, newSessionToken, pinMatches,
  sessionCookieOptions,
} from "@/lib/auth";
import { clearFailures, clientIp, lockedSeconds, recordFailure, throttleKeys } from "@/lib/pin-throttle";
import { safeAdminNext } from "@/lib/safe-next";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * PIN sign-in (JSON, from the keypad). Body: { pin, next }.
 * 200 { ok, next } + session cookie · 401 { error: "wrong" } · 429 { error: "locked", retryAfter }
 * · 503 { error: "config" | "unavailable" }. Never echoes the PIN. Sets a device-id cookie if missing,
 * so wrong tries are counted per device as well as per IP.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { pin?: unknown; next?: unknown } | null;
  const next = safeAdminNext(body?.next ?? null);
  const existing = req.cookies.get(DEVICE_COOKIE)?.value;
  const deviceId = existing && /^[A-Za-z0-9_-]{16,64}$/.test(existing) ? existing : newDeviceId();
  const reply = (data: object, status: number, headers?: Record<string, string>) => {
    const res = NextResponse.json(data, { status, headers: { "cache-control": "no-store", ...headers } });
    if (deviceId !== existing) res.cookies.set(DEVICE_COOKIE, deviceId, deviceCookieOptions);
    return res;
  };
  if (!adminConfigured()) return reply({ error: "config" }, 503);

  const keys = throttleKeys(clientIp(req.headers), deviceId);
  try {
    const locked = await lockedSeconds(keys);
    if (locked > 0) return reply({ error: "locked", retryAfter: locked }, 429, { "retry-after": String(locked) });

    if (!(await pinMatches(body?.pin))) {
      const lockedNow = await recordFailure(keys);
      await sleep(350);
      if (lockedNow > 0) return reply({ error: "locked", retryAfter: lockedNow }, 429, { "retry-after": String(lockedNow) });
      return reply({ error: "wrong" }, 401);
    }

    await clearFailures(keys);
  } catch (err) {
    // Fail closed: without the throttle we don't check PINs at all.
    console.error("admin login throttle error", err);
    return reply({ error: "unavailable" }, 503);
  }
  const token = newSessionToken();
  if (!token) return reply({ error: "config" }, 503);
  const res = reply({ ok: true, next }, 200);
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}
