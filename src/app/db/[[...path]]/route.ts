import { isAdmin } from "@/lib/admin-guard";
import { handleDb } from "@/lib/db-admin/handle";
import { publish } from "@/lib/relay";

export const dynamic = "force-dynamic";

/** Bartender-style database admin. Same session as /admin; signed out goes to the PIN page. */
async function gate(req: Request, parts: string[]) {
  if (!(await isAdmin())) {
    const next = "/db" + (parts.length ? `/${parts.join("/")}` : "") + new URL(req.url).search;
    return Response.redirect(new URL(`/admin/login?next=${encodeURIComponent(next)}`, req.url), 303);
  }
  return handleDb(req, parts);
}

export async function GET(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  return gate(req, path);
}

export async function POST(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  const res = await gate(req, path);
  // Any accepted /db write may change the menu: tell the TV (a no-op edit just costs one refresh).
  if (res.status < 400 && (await isAdmin())) publish("bar:menu", "db");
  return res;
}
