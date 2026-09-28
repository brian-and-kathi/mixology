#!/usr/bin/env node
// After editing the menu directly in SQL, run `npm run notify` so open TVs and phones refresh now
// instead of at their next 15-minute check (DESIGN §4.6, database change signal).
//
//   npm run notify                      production (https://speakeasy.brianandkathi.com)
//   npm run notify -- http://localhost:3000
//   MIXOLOGY_URL=https://… npm run notify
//
// It calls POST /api/bar/sync, which reads the change counters the database triggers keep
// (migration 028) and publishes only what moved since the last publish. No secret needed; running
// it twice is harmless. Point it at the app that uses the database you edited (production = Neon main).
// Previews sit behind Vercel sign-in, so this script can't reach them.

const base = (process.argv[2] || process.env.MIXOLOGY_URL || "https://speakeasy.brianandkathi.com").replace(/\/+$/, "");
const started = Date.now();
try {
  const res = await fetch(`${base}/api/bar/sync`, { method: "POST", signal: AbortSignal.timeout(15_000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`notify: ${base} answered ${res.status}${body.error ? `: ${body.error}` : ""}`);
    process.exit(1);
  }
  const ms = Date.now() - started;
  if (body.menu == null) console.log(`notify: ${base} has no change counters yet (migration 028 not applied). Nothing sent. (${ms} ms)`);
  else if (!body.published.length) console.log(`notify: nothing new to announce (menu v${body.menu}, cast v${body.cast}). (${ms} ms)`);
  else console.log(`notify: told the relay ${body.published.join(" and ")} changed (menu v${body.menu}, cast v${body.cast}). (${ms} ms)`);
} catch (err) {
  console.error(`notify: could not reach ${base} (${err?.name ?? err})`);
  process.exit(1);
}
