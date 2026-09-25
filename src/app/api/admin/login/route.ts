import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE, adminConfigured, clearLoginFailures, loginLocked, newSessionToken, passwordMatches,
  recordLoginFailure, sessionCookieOptions,
} from "@/lib/auth";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const safeNext = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/admin") && !s.startsWith("//") && !s.startsWith("/admin/login") ? s : "/admin";
};

/** Sign-in form POST. Plain form + 303 redirect, so it works without client JS. */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const next = safeNext(form?.get("next") ?? null);
  const back = (error: string) => {
    const url = new URL("/admin/login", req.url);
    url.searchParams.set("error", error);
    if (next !== "/admin") url.searchParams.set("next", next);
    return NextResponse.redirect(url, 303);
  };
  if (!adminConfigured()) return back("config");
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (loginLocked(ip)) {
    await sleep(1000);
    return back("locked");
  }
  const password = form?.get("password");
  if (typeof password !== "string" || !passwordMatches(password)) {
    const n = recordLoginFailure(ip);
    await sleep(Math.min(400 * n, 3000));
    return back("wrong");
  }
  clearLoginFailures(ip);
  const token = newSessionToken();
  if (!token) return back("config");
  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}
