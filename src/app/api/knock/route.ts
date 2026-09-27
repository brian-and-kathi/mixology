import { NextResponse, type NextRequest } from "next/server";
import { knockMatches, loungeExpires, loungeMaxAge, loungeToken, LOUNGE_COOKIE, tonight } from "@/lib/night";

/** Check the three-glass knock. A match sets the lounge cookie until the next 8:00am Eastern roll. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { glasses?: unknown } | null;
  const glasses = Array.isArray(body?.glasses) ? body.glasses.filter((item): item is string => typeof item === "string") : [];
  const night = tonight();
  if (!night) return NextResponse.json({ ok: false }, { status: 503 });
  if (!knockMatches(glasses)) return NextResponse.json({ ok: false }, { status: 401 });
  const token = loungeToken(night.day);
  if (!token) return NextResponse.json({ ok: false }, { status: 503 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(LOUNGE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/lounge",
    expires: loungeExpires(),
    maxAge: loungeMaxAge(),
  });
  return res;
}
