import { NextResponse, type NextRequest } from "next/server";
import { castRateLimited } from "@/lib/cast";
import { publishChanges } from "@/lib/relay";

export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" };

/**
 * POST: announce database changes that no app write announced (DESIGN §4.6, database change signal).
 * Direct-SQL editors run `npm run notify` afterwards; open TVs and phones call it on their slow
 * fallback check. It claims bar_versions (migration 028) and publishes only the topics that moved
 * since the last publish, so calling it again, or from many clients, sends nothing new.
 * Public on purpose (it carries no data and can only repeat what the database already says);
 * lightly rate-limited per IP like the cast endpoints.
 * Answers {menu, cast, published}: the current versions (null before migration 028) and the topics sent.
 */
export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (castRateLimited(`sync:${ip}`)) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429, headers: noStore });
  try {
    const { versions, published } = await publishChanges("sql");
    return NextResponse.json({ menu: versions?.menu ?? null, cast: versions?.cast ?? null, published }, { headers: noStore });
  } catch (err) {
    console.error("bar sync failed", err);
    return NextResponse.json({ error: "Could not read the database." }, { status: 503, headers: noStore });
  }
}
