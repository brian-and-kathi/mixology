import { NextResponse } from "next/server";
import { adminApi } from "@/lib/admin-guard";
import { setStock } from "@/lib/admin-write";

export const POST = adminApi(async (req: Request) => {
  const body = (await req.json()) as { id?: string; in_stock?: boolean; undo_of?: number | string };
  const u = Number(body.undo_of);
  const undo = Number.isInteger(u) && u > 0 ? u : undefined;
  return NextResponse.json(await setStock(String(body.id ?? ""), body.in_stock === true, undo));
}, { topic: "bar:menu", kind: "stock" });
