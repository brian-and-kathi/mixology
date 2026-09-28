import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { guestGate } from "@/lib/bar-status";
import { isUuid } from "@/lib/db";
import { publish } from "@/lib/relay";
import { GUEST_COOKIE, GUEST_COOKIE_MAX_AGE, loadAverage, rateDrink, voteRateLimited, type RatingKind } from "@/lib/ratings";

export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStore });
const ip = (req: NextRequest) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";

/**
 * GET ?kind=product|recipe&id=: the guests' average (2 decimals) and vote count, read by the TV cast
 * band when a cast appears. Read-only, no cookie; the same numbers every guest page already shows.
 */
export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get("kind");
  const id = req.nextUrl.searchParams.get("id");
  if ((kind !== "product" && kind !== "recipe") || !id || !isUuid(id)) return json({ error: "Send ?kind=product|recipe&id=." }, 400);
  const r = await loadAverage(kind, id).catch(() => undefined);
  return r ? json(r) : json({ error: "Ratings unavailable." }, 503);
}

/**
 * POST {kind: "product" | "recipe", id, stars: 1-5 | null}: this device's vote for a drink on the
 * guest menu (null clears it). Sets the anonymous guest cookie on the first vote. Answers the new
 * average and count, and this device's vote. While the bar is Closed, admins only (403).
 */
export async function POST(req: NextRequest) {
  if (!(await guestGate()).allowed) return json({ error: "The bar is closed." }, 403);
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return json({ error: "Cross-site votes aren't accepted." }, 403);
  if (voteRateLimited(ip(req))) return json({ error: "Too many votes. Try again in a minute." }, 429);
  const body = (await req.json().catch(() => null)) as { kind?: unknown; id?: unknown; stars?: unknown } | null;
  const kind: RatingKind | null = body?.kind === "product" || body?.kind === "recipe" ? body.kind : null;
  const id = typeof body?.id === "string" && isUuid(body.id) ? body.id : null;
  const stars = body?.stars === null ? null : Number.isInteger(body?.stars) && (body!.stars as number) >= 1 && (body!.stars as number) <= 5 ? (body!.stars as number) : undefined;
  if (!kind || !id || stars === undefined) return json({ error: "Send {kind: 'product' | 'recipe', id, stars: 1-5 or null}." }, 400);

  const existing = req.cookies.get(GUEST_COOKIE)?.value;
  const device = existing && isUuid(existing) ? existing : randomUUID();
  const result = await rateDrink(kind, id, device, stars).catch(() => undefined);
  if (result === undefined) return json({ error: "Couldn't save your rating. Try again." }, 503);
  if (result === null) return json({ error: "That drink isn't on the menu." }, 404);
  publish("bar:menu", "rating"); // the TV board shows averages
  const res = json({ ...result, mine: stars });
  if (device !== existing) {
    res.cookies.set(GUEST_COOKIE, device, {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: GUEST_COOKIE_MAX_AGE, secure: req.nextUrl.protocol === "https:",
    });
  }
  return res;
}
