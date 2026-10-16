import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual, createHash } from "node:crypto";
import { query } from "@/lib/db";
import { readTvGame, parseGameSource } from "@/lib/tv-game";

export const dynamic = "force-dynamic";

/**
 * Shindig -> bar TV targeting (preview, Brian via Vincent 2026-10-16). Server-to-server only:
 * Authorization: Bearer <SHINDIG_TV_SECRET>, compared in constant time. Accepts a bare Shindig TV token only, never a URL.
 * GET: {token, dismissedAt}. PUT {token}: show that game (same write + change_log as the admin save; clears "Back to menu").
 * PUT {clear: true, ifToken}: turn off, only when the bar still points at ifToken (never clobbers a newer game).
 * The admin "Show White Elephant from" field and "Back to menu" keep working as before.
 */
const TOKEN = /^[A-Za-z0-9_-]{4,128}$/;
const h = (s: string) => createHash("sha256").update(s).digest();
function authed(req: NextRequest) {
  const secret = process.env.SHINDIG_TV_SECRET;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return !!secret && secret.length >= 32 && timingSafeEqual(h(got), h(secret));
}
const no = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { "cache-control": "no-store" } });
const current = async () => {
  const row = await readTvGame();
  const t = parseGameSource(row?.source);
  return { token: t?.token ?? null, dismissedAt: row?.dismissed_at ?? null };
};

export async function GET(req: NextRequest) {
  if (!authed(req)) return no(401, "unauthorized");
  return NextResponse.json(await current(), { headers: { "cache-control": "no-store" } });
}

export async function PUT(req: NextRequest) {
  if (!authed(req)) return no(401, "unauthorized");
  const b = (await req.json().catch(() => null)) as { token?: unknown; clear?: unknown; ifToken?: unknown } | null;
  if (b?.clear === true) {
    if (typeof b.ifToken !== "string" || !TOKEN.test(b.ifToken)) return no(400, "ifToken required");
    const cur = await current();
    if (cur.token !== b.ifToken) return NextResponse.json({ ...cur, cleared: false });
    await query(
      `WITH up AS (UPDATE tv_game SET source = NULL, dismissed_at = NULL, changed_at = now() WHERE id = 1 AND source = $1 RETURNING 1)
       INSERT INTO change_log (entity, entity_id, action, summary, after)
       SELECT 'bar', 'tv_game', 'update', 'TV: Shindig game off (Shindig ended)', jsonb_build_object('source', NULL::text) FROM up`,
      [(await readTvGame())?.source ?? ""],
    );
    return NextResponse.json({ ...(await current()), cleared: true });
  }
  if (typeof b?.token !== "string" || !TOKEN.test(b.token)) return no(400, "token must be a Shindig TV token");
  await query(
    `WITH up AS (UPDATE tv_game SET source = $1, dismissed_at = NULL, changed_at = now() WHERE id = 1 RETURNING 1)
     INSERT INTO change_log (entity, entity_id, action, summary, after)
     SELECT 'bar', 'tv_game', 'update', $2, jsonb_build_object('source', $1::text) FROM up`,
    [b.token, "TV: show Shindig game (Shindig started)"],
  );
  return NextResponse.json(await current());
}
