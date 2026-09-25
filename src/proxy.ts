import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

/**
 * Server-side gate for every admin page and admin API. Pages redirect to the sign-in page;
 * APIs answer 401. Open paths: the sign-in page, the sign-in POST, and the share-target
 * fallback (which stores nothing and only redirects to a protected page).
 */
const OPEN = new Set(["/admin/login", "/api/admin/login", "/admin/share"]);

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (OPEN.has(pathname)) return NextResponse.next();
  if (verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/admin", "/admin/:path*", "/api/admin", "/api/admin/:path*"] };
