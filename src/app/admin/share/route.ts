import { NextResponse, type NextRequest } from "next/server";

/**
 * Share-target fallback. Normally /sw.js intercepts this POST, keeps the photo in the
 * browser (IndexedDB) and opens Add bottle. If the worker isn't running yet, the photo is
 * dropped (photos are never stored on the server) and we still open Add bottle.
 */
export async function POST(req: NextRequest) {
  return NextResponse.redirect(new URL("/admin/bottles/new?shared=0", req.url), 303);
}

export function GET(req: NextRequest) {
  return NextResponse.redirect(new URL("/admin/bottles/new", req.url), 303);
}
