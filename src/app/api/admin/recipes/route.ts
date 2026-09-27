import { NextResponse } from "next/server";
import { adminApi } from "@/lib/admin-guard";
import { saveRecipe } from "@/lib/admin-write";

export const POST = adminApi(async (req: Request) => NextResponse.json(await saveRecipe(null, await req.json())), { topic: "bar:menu", kind: "recipe" });
