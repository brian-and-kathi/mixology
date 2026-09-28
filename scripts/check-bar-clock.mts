// Checks nextCloseAt() (src/lib/bar-clock.ts) with an injected clock, including both DST changes.
// Run: node scripts/check-bar-clock.mts  (Node 22.18+ strips the types; older: --experimental-strip-types)
import { nextCloseAt } from "../src/lib/bar-clock.ts";

const cases: [string, string, string][] = [
  // [now (UTC), expected close (UTC), what]
  ["2026-09-27T23:00:00Z", "2026-09-28T06:00:00Z", "7:00 PM EDT: 2:00 AM EDT tomorrow"],
  ["2026-09-28T04:30:00Z", "2026-09-28T06:00:00Z", "12:30 AM EDT: 2:00 AM tonight"],
  ["2026-09-28T05:59:59Z", "2026-09-28T06:00:00Z", "1:59:59 AM EDT: one second left"],
  ["2026-09-28T06:00:00Z", "2026-09-29T06:00:00Z", "exactly 2:00 AM: the next night"],
  ["2026-09-28T06:00:01Z", "2026-09-29T06:00:00Z", "just after 2:00 AM: the next night, never earlier"],
  ["2026-12-15T01:00:00Z", "2026-12-15T07:00:00Z", "winter, 8:00 PM EST: 2:00 AM EST = 07:00 UTC"],
  // Fall back: Sun 2026-11-01, 2:00 EDT -> 1:00 EST. 2:00 AM EST (07:00 UTC) happens once.
  ["2026-10-31T22:00:00Z", "2026-11-01T07:00:00Z", "fall back night, opened 6:00 PM EDT: 2:00 AM EST"],
  ["2026-11-01T05:30:00Z", "2026-11-01T07:00:00Z", "fall back, 1:30 AM EDT (first 1:30): 2:00 AM EST"],
  ["2026-11-01T06:30:00Z", "2026-11-01T07:00:00Z", "fall back, 1:30 AM EST (second 1:30): 2:00 AM EST"],
  // Spring forward: Sun 2027-03-14, 2:00 EST -> 3:00 EDT. 2:00 AM doesn't exist; close at the jump (07:00 UTC).
  ["2027-03-13T23:00:00Z", "2027-03-14T07:00:00Z", "spring forward night, 6:00 PM EST: the 2 to 3 AM jump"],
  ["2027-03-14T06:59:00Z", "2027-03-14T07:00:00Z", "spring forward, 1:59 AM EST: the jump"],
  ["2027-03-14T07:00:00Z", "2027-03-15T06:00:00Z", "spring forward, 3:00 AM EDT: 2:00 AM EDT next night"],
];

let failed = 0;
for (const [now, want, what] of cases) {
  const got = nextCloseAt(new Date(now)).toISOString().replace(".000Z", "Z");
  const ok = got === want;
  if (!ok) failed++;
  const et = new Date(got).toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" });
  console.log(`${ok ? "ok  " : "FAIL"} ${what}: now ${now} -> ${got} (${et})${ok ? "" : `, want ${want}`}`);
}
if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log(`all ${cases.length} passed`);
