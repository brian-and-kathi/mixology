import { NextResponse, type NextRequest } from "next/server";
import { castRateLimited, currentCast, startCast, stopCast, type CastType } from "@/lib/cast";
import { isUuid } from "@/lib/db";

export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStore });

/** GET: what the TV should show right now. The TV polls this every 2 seconds. */
export async function GET() {
  return json({ cast: await currentCast(), now: new Date().toISOString() });
}

async function parse(req: NextRequest): Promise<{ type: CastType; id: string } | null> {
  const body = (await req.json().catch(() => null)) as { type?: unknown; id?: unknown } | null;
  const type = body?.type === "recipe" || body?.type === "pour" ? body.type : null;
  const id = typeof body?.id === "string" && isUuid(body.id) ? body.id : null;
  return type && id ? { type, id } : null;
}

const ip = (req: NextRequest) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";

/** POST {type, id}: show a cocktail or pour on the TV (replaces whatever is showing). */
export async function POST(req: NextRequest) {
  if (castRateLimited(ip(req))) return json({ error: "Too many requests. Try again in a minute." }, 429);
  const item = await parse(req);
  if (!item) return json({ error: "Send {type: 'recipe' | 'pour', id}." }, 400);
  const cast = await startCast(item.type, item.id);
  if (!cast) return json({ error: "That item isn't on the menu." }, 404);
  return json({ cast, now: new Date().toISOString() });
}

/** DELETE {type, id}: take that item off the TV (no-op if something else is showing). */
export async function DELETE(req: NextRequest) {
  if (castRateLimited(ip(req))) return json({ error: "Too many requests. Try again in a minute." }, 429);
  const item = await parse(req);
  if (!item) return json({ error: "Send {type: 'recipe' | 'pour', id}." }, 400);
  const stopped = await stopCast(item.type, item.id);
  return json({ stopped, cast: await currentCast(), now: new Date().toISOString() });
}
