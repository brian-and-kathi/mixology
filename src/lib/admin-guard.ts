import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

/** Server-side session check for admin route handlers (defense in depth behind proxy.ts). */
export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

export const unauthorized = () => NextResponse.json({ error: "Sign in required" }, { status: 401 });

/** Wraps an admin API handler: 401 without a valid session, friendly JSON errors otherwise. */
export function adminApi<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    if (!(await isAdmin())) return unauthorized();
    try {
      return await handler(...args);
    } catch (err) {
      const message = err instanceof UserError ? err.message : dbMessage(err);
      const status = err instanceof UserError ? 400 : 500;
      if (status === 500) console.error("admin api error", err);
      return NextResponse.json({ error: message }, { status });
    }
  };
}

export class UserError extends Error {}

/** Turn a Postgres error into a short sentence a bartender can act on. */
function dbMessage(err: unknown): string {
  const e = err as { code?: string; message?: string };
  if (e?.code === "23505") return "That name is already taken.";
  if (e?.code === "23514" || e?.code === "P0001") {
    const msg = (e.message ?? "That change isn't allowed.").replace(/ \(DESIGN §10\)\.?$/, ".").replace(/\bspecs?\b/g, "ingredient");
    return msg.charAt(0).toUpperCase() + msg.slice(1);
  }
  if (e?.code === "23503") return "That item is still in use.";
  return "Couldn't save. Try again.";
}
