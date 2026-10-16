import { NextResponse } from "next/server";
import { parseGameSource, readTvGame } from "@/lib/tv-game";

export const dynamic = "force-dynamic";

/**
 * GET: what the TV should poll for a Shindig game (migration 041). Public like /tv itself; it reveals only the
 * Shindig TV link the screen already shows. {target: {base, token} | null, dismissedAt}. Any failure reads as off.
 */
export async function GET() {
  const row = await readTvGame().catch(() => null);
  return NextResponse.json(
    { target: parseGameSource(row?.source), dismissedAt: row?.dismissed_at ?? null },
    { headers: { "cache-control": "no-store" } },
  );
}
