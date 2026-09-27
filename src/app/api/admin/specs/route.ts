import { NextResponse } from "next/server";
import { adminApi } from "@/lib/admin-guard";
import { createSpec } from "@/lib/admin-write";

export const POST = adminApi(async (req: Request) => NextResponse.json(await createSpec(await req.json())), { topic: "bar:menu", kind: "spec" });
