import { NextResponse, type NextRequest } from "next/server";
import { castRateLimited, castRevision, currentCast, isCastType, setCastServings, startCast, stopCast, type CastType } from "@/lib/cast";
import { clampServings } from "@/lib/format";
import { barStatus } from "@/lib/bar-status";
import { isUuid } from "@/lib/db";
import { publish } from "@/lib/relay";

export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStore });

/**
 * GET: what the TV should show right now. The TV polls this every 4 seconds (every 15 minutes, plus
 * on each relay notice, while the realtime relay is live).
 * If-None-Match with the previous ETag (the cast revision, or "none") gets a 304 and does not
 * rebuild the recipe or pour. The revision includes the database cast_version (migration 028), so a
 * changed tasting note or method also gets a fresh payload. x-now is the server clock, including on a 304.
 */
export async function GET(req: NextRequest) {
  const rev = await castRevision();
  const etag = `"${rev}"`;
  const now = new Date().toISOString();
  const headers = { ...noStore, etag, "x-now": now };
  if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers });
  return NextResponse.json({ cast: await currentCast(), now }, { headers });
}

async function parse(req: NextRequest): Promise<{ type: CastType; id: string; started_at: string | null; servings: number; keep: boolean } | null> {
  const body = (await req.json().catch(() => null)) as { type?: unknown; id?: unknown; started_at?: unknown; servings?: unknown; keep?: unknown } | null;
  const type = isCastType(body?.type) ? body.type : null;
  const id = typeof body?.id === "string" && isUuid(body.id) ? body.id : null;
  const started_at = typeof body?.started_at === "string" && body.started_at ? body.started_at : null;
  if (body?.servings !== undefined && clampServings(body.servings) !== Number(body.servings)) return null;
  return type && id ? { type, id, started_at, servings: clampServings(body?.servings), keep: body?.keep === true } : null;
}

const ip = (req: NextRequest) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";

/**
 * POST {type, id, servings?}: show a cocktail, pour or Cellar wine on the TV (replaces whatever is showing).
 * A recipe may include servings 1–6; the TV scales its measured lines. `{keep: true}` changes servings
 * on the recipe already up, without restarting its 10 minutes. While the bar is Closed, nobody can
 * cast, an admin included (403). Taking a cast off (DELETE) still works.
 */
export async function POST(req: NextRequest) {
  if (!(await barStatus()).open) return json({ error: "The bar is closed." }, 403);
  if (castRateLimited(ip(req))) return json({ error: "Too many requests. Try again in a minute." }, 429);
  const item = await parse(req);
  if (!item) return json({ error: "Send {type: 'recipe' | 'pour' | 'wine', id}." }, 400);
  if (item.keep) {
    const cast = item.type === "recipe" ? await setCastServings(item.id, item.servings) : null;
    if (cast) publish("bar:cast", "servings");
    return json({ cast: cast ?? await currentCast(), now: new Date().toISOString() });
  }
  const cast = await startCast(item.type, item.id, item.servings);
  if (!cast) return json({ error: "That item isn't on the menu." }, 404);
  publish("bar:cast", "cast"); // after the response; TVs and phones refetch GET (lib/relay)
  return json({ cast, now: new Date().toISOString() });
}

/** DELETE {type, id}: take that item off the TV (no-op if something else is showing). */
export async function DELETE(req: NextRequest) {
  if (castRateLimited(ip(req))) return json({ error: "Too many requests. Try again in a minute." }, 429);
  const item = await parse(req);
  if (!item) return json({ error: "Send {type: 'recipe' | 'pour' | 'wine', id}." }, 400);
  const stopped = await stopCast(item.type, item.id, item.started_at);
  if (stopped) publish("bar:cast", "clear");
  return json({ stopped, cast: await currentCast(), now: new Date().toISOString() });
}
