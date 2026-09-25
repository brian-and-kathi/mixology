import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Admin auth: one shared password (ADMIN_PASSWORD) and a signed, long-lived session cookie.
 * The cookie-signing key is derived from SESSION_SECRET when set, otherwise from ADMIN_PASSWORD
 * (HMAC-SHA256 with a fixed app label), so changing the password signs everyone out.
 * Fails closed: with no ADMIN_PASSWORD nobody can sign in and every session is invalid.
 */
export const SESSION_COOKIE = "mx_admin";
export const SESSION_DAYS = 180;
const LABEL = "mixology-admin-session-v1";

export const adminConfigured = () => Boolean(process.env.ADMIN_PASSWORD);

function signingKey(): Buffer | null {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return null;
  const base = process.env.SESSION_SECRET || password;
  return createHmac("sha256", base).update(LABEL).digest();
}

const b64url = (b: Buffer) => b.toString("base64url");

function sign(payload: string, key: Buffer) {
  return b64url(createHmac("sha256", key).update(payload).digest());
}

/** Constant-time password check (compares SHA-256 digests, so lengths never leak). */
export function passwordMatches(candidate: string): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  const a = createHash("sha256").update(candidate, "utf8").digest();
  const b = createHash("sha256").update(password, "utf8").digest();
  return timingSafeEqual(a, b);
}

/** New session token: v1.<expires epoch seconds>.<nonce>.<signature>. */
export function newSessionToken(now = Date.now()): string | null {
  const key = signingKey();
  if (!key) return null;
  const exp = Math.floor(now / 1000) + SESSION_DAYS * 86400;
  const payload = `v1.${exp}.${b64url(randomBytes(12))}`;
  return `${payload}.${sign(payload, key)}`;
}

export function verifySessionToken(token: string | undefined | null, now = Date.now()): boolean {
  const key = signingKey();
  if (!key || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp * 1000 < now) return false;
  const expected = Buffer.from(sign(parts.slice(0, 3).join("."), key));
  const given = Buffer.from(parts[3]);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 86400,
};

// Basic login throttling, per client IP, per server instance. Good enough for one home bar:
// every failure costs a delay, and 8 failures in 15 minutes locks that IP out for 15 minutes.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 8;
const fails = new Map<string, { count: number; first: number }>();

export function loginLocked(ip: string, now = Date.now()): boolean {
  const f = fails.get(ip);
  if (!f) return false;
  if (now - f.first > WINDOW_MS) {
    fails.delete(ip);
    return false;
  }
  return f.count >= MAX_FAILS;
}

export function recordLoginFailure(ip: string, now = Date.now()): number {
  const f = fails.get(ip);
  if (!f || now - f.first > WINDOW_MS) fails.set(ip, { count: 1, first: now });
  else f.count += 1;
  return fails.get(ip)!.count;
}

export const clearLoginFailures = (ip: string) => fails.delete(ip);
