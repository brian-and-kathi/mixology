import { NextResponse } from "next/server";
import { adminApi } from "@/lib/admin-guard";
import { duplicateRecipe } from "@/lib/admin-write";

type Ctx = { params: Promise<{ id: string }> };
export const POST = adminApi(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return NextResponse.json(await duplicateRecipe(id));
});
