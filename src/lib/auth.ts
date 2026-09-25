import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Admin auth: one shared 4-digit PIN, stored only as an scrypt hash (ADMIN_PIN_HASH, format
 * scrypt:N:r:p:<salt>:<key>, base64url; see scripts/pin-hash.mjs), and a signed, long-lived session cookie.
 * The cookie-signing key is derived from SESSION_SECRET when set, otherwise from ADMIN_PASSWORD (kept for
 * now so sessions signed before the PIN keep working), otherwise from ADMIN_PIN_HASH, via HMAC-SHA256 with
 * a fixed app label. Fails closed: with no valid ADMIN_PIN_HASH nobody can sign in and every session is
 * invalid. Wrong-PIN throttling lives in the database (see pin-throttle.ts, migration 019).
 */
export const SESSION_COOKIE = "mx_admin";
export const SESSION_DAYS = 180;
const LABEL = "mixology-admin-session-v1";

type PinHash = { N: number; r: number; p: number; salt: Buffer; key: Buffer };

function parsePinHash(v: string | undefined): PinHash | null {
  const m = /^scrypt:(\d+):(\d+):(\d+):([A-Za-z0-9_-]{16,}):([A-Za-z0-9_-]{32,})$/.exec((v ?? "").trim());
  if (!m) return null;
  const [N, r, p] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Sane scrypt cost bounds (N a power of two), so a bad value can't hang or exhaust a function.
  if (N < 1024 || N > 1 << 20 || (N & (N - 1)) !== 0 || r < 1 || r > 32 || p < 1 || p > 4) return null;
  return { N, r, p, salt: Buffer.from(m[4], "base64url"), key: Buffer.from(m[5], "base64url") };
}

export const adminConfigured = () => parsePinHash(process.env.ADMIN_PIN_HASH) !== null;

function signingKey(): Buffer | null {
  if (!adminConfigured()) return null;
  const base = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || process.env.ADMIN_PIN_HASH!;
  return createHmac("sha256", base).update(LABEL).digest();
}

const scryptAsync = (pin: string, h: PinHash) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(pin, h.salt, h.key.length, { N: h.N, r: h.r, p: h.p, maxmem: 256 * h.N * h.r + 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))),
  );

/** Checks a PIN against ADMIN_PIN_HASH (scrypt, constant-time compare). Anything but 4 digits is wrong. */
export async function pinMatches(candidate: unknown): Promise<boolean> {
  const h = parsePinHash(process.env.ADMIN_PIN_HASH);
  if (!h || typeof candidate !== "string" || !/^\d{4}$/.test(candidate)) return false;
  const key = await scryptAsync(candidate, h);
  return key.length === h.key.length && timingSafeEqual(key, h.key);
}

/** HMAC key for throttle digests (so stored keys can't be reversed to IPs by brute force). */
export function throttleKey(): Buffer {
  return createHmac("sha256", process.env.ADMIN_PIN_HASH ?? "").update("mixology-admin-throttle-v1").digest();
}

const b64url = (b: Buffer) => b.toString("base64url");

function sign(payload: string, key: Buffer) {
  return b64url(createHmac("sha256", key).update(payload).digest());
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

/** Random per-device id for the wrong-PIN throttle (counted alongside the IP). */
export const DEVICE_COOKIE = "mx_device";
export const newDeviceId = () => b64url(randomBytes(18));
export const deviceCookieOptions = { ...sessionCookieOptions, maxAge: 400 * 86400 };
