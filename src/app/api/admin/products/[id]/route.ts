import { NextResponse } from "next/server";
import { adminApi } from "@/lib/admin-guard";
import { saveProduct } from "@/lib/admin-write";

type Ctx = { params: Promise<{ id: string }> };
export const PUT = adminApi(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return NextResponse.json(await saveProduct(id, await req.json()));
}, { topic: "bar:menu", kind: "product" });
