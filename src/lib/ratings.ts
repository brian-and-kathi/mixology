import { cookies } from "next/headers";
import { isUuid, query } from "@/lib/db";

/**
 * Guest star ratings (migration 022). One changeable vote per drink per device, where the device is
 * an anonymous random id in a long-lived httpOnly cookie, set on the first vote. No sign-in, and it's
 * a different cookie from the admin sign-in throttle's, so votes can't be linked to admin devices.
 * Pours and Cellar wines are bottles ("product"); cocktails are recipes ("recipe").
 */
export const GUEST_COOKIE = "mx_guest";
export const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 730; // two years
export type RatingKind = "product" | "recipe";
export type Rating = { avg: number | null; votes: number; mine: number | null };

/** This device's guest id from the cookie, or null before its first vote. */
export async function guestDevice(): Promise<string | null> {
  const v = (await cookies()).get(GUEST_COOKIE)?.value;
  return v && isUuid(v) ? v : null;
}

/** Average (one decimal), vote count, and this device's own vote, for a detail page. */
export async function loadRating(kind: RatingKind, id: string): Promise<Rating> {
  const device = await guestDevice();
  const [row] = await query<{ avg: string | null; votes: number; mine: number | null }>(
    `SELECT round(avg(stars), 1)::text AS avg, count(*)::int AS votes,
            max(stars) FILTER (WHERE device_id = $3::uuid)::int AS mine
       FROM drink_ratings WHERE item_kind = $1 AND item_id = $2`,
    [kind, id, device],
  ).catch(() => [undefined]); // ratings never break a detail page
  return { avg: row?.avg != null ? Number(row.avg) : null, votes: row?.votes ?? 0, mine: row?.mine ?? null };
}

/** Set (1-5) or clear (null) a vote. Null result: the drink isn't on the guest menu. */
export async function rateDrink(kind: RatingKind, id: string, device: string, stars: number | null): Promise<{ avg: number | null; votes: number } | null> {
  const [row] = await query<{ avg: string | null; votes: number }>(
    "SELECT avg_stars::text AS avg, votes FROM rate_drink($1, $2::uuid, $3::uuid, $4::smallint)",
    [kind, id, device, stars],
  );
  return row ? { avg: row.avg != null ? Number(row.avg) : null, votes: row.votes } : null;
}

// Light per-IP rate limit for the vote endpoint (per server instance), like the cast endpoints.
const hits = new Map<string, number[]>();
export function voteRateLimited(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 30;
}
