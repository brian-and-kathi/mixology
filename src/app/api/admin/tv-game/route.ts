import { NextResponse, type NextRequest } from "next/server";
import { adminApi, UserError } from "@/lib/admin-guard";
import { query } from "@/lib/db";
import { parseGameSource, readTvGame } from "@/lib/tv-game";

export const dynamic = "force-dynamic";

const view = async () => {
  const row = await readTvGame();
  return { source: row?.source ?? "", target: parseGameSource(row?.source), dismissedAt: row?.dismissed_at ?? null };
};

/** GET: the "Show Shindig game from" setting. */
export const GET = adminApi(async () => NextResponse.json(await view()));

/** PUT {source}: a Shindig TV token or URL; blank turns it off. */
export const PUT = adminApi(async (req: NextRequest) => {
  const body = (await req.json().catch(() => null)) as { source?: unknown } | null;
  const source = typeof body?.source === "string" ? body.source.trim() : "";
  if (source && !parseGameSource(source)) throw new UserError("Paste the Shindig TV link (…/tv/<token>) or just the token.");
  await query(
    `WITH up AS (UPDATE tv_game SET source = $1, dismissed_at = NULL, changed_at = now() WHERE id = 1 RETURNING 1)
     INSERT INTO change_log (entity, entity_id, action, summary, after)
     SELECT 'bar', 'tv_game', 'update', $2, jsonb_build_object('source', $1::text) FROM up`,
    [source || null, source ? "TV: show Shindig game" : "TV: Shindig game off"],
  );
  return NextResponse.json(await view());
});

/** POST {dismiss: true}: "Back to menu". The TV leaves the current game and ignores it until it stops being live. */
export const POST = adminApi(async (req: NextRequest) => {
  const body = (await req.json().catch(() => null)) as { dismiss?: unknown } | null;
  if (body?.dismiss !== true) throw new UserError("Send {dismiss: true}.");
  await query("UPDATE tv_game SET dismissed_at = now(), changed_at = now() WHERE id = 1");
  return NextResponse.json(await view());
});
