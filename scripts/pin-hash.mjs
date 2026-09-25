#!/usr/bin/env node
// Prints an ADMIN_PIN_HASH value for a 4-digit PIN read from stdin (never from argv, so it stays out of
// shell history and process lists). Format: scrypt:N:r:p:<salt>:<key>, base64url; salt and params travel with it (no "$", which
// .env loaders would try to expand).
// Usage: printf '%s' "$PIN" | node scripts/pin-hash.mjs
import { randomBytes, scryptSync } from "node:crypto";

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const pin = Buffer.concat(chunks).toString("utf8").trim();
if (!/^\d{4}$/.test(pin)) {
  console.error("Expected exactly 4 digits on stdin.");
  process.exit(1);
}
const N = 16384, r = 8, p = 1;
const salt = randomBytes(16);
const key = scryptSync(pin, salt, 32, { N, r, p, maxmem: 64 * 1024 * 1024 });
process.stdout.write(`scrypt:${N}:${r}:${p}:${salt.toString("base64url")}:${key.toString("base64url")}\n`);
