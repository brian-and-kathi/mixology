import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual, createHash } from "node:crypto";
import { readBarStatus } from "@/lib/bar-status";
import { loungeExpires, tonightKnock } from "@/lib/night";

export const dynamic = "force-dynamic";

/**
 * Shindig "Secret" tab (Brian via Vincent, 2026-10-16). Server-to-server only: Authorization: Bearer
 * <SHINDIG_TV_SECRET>, compared in constant time. Returns today's knock and whether the bar is open:
 * {day, generation, glasses: [3 ids], open, expiresAt}. Never the lounge password: tonightKnock() doesn't derive it.
 * Nothing about the values is logged.
 */
const h = (s: string) => createHash("sha256").update(s).digest();
const NO_STORE = { "cache-control": "no-store" };
function authed(req: NextRequest) {
  const secret = process.env.SHINDIG_TV_SECRET;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return !!secret && secret.length >= 32 && timingSafeEqual(h(got), h(secret));
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  const now = new Date();
  const [knock, status] = await Promise.all([tonightKnock(now), readBarStatus()]);
  if (!knock) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  return NextResponse.json(
    { day: knock.day, generation: knock.generation, glasses: knock.glasses, open: status.open, expiresAt: loungeExpires(now).toISOString() },
    { headers: NO_STORE },
  );
}
