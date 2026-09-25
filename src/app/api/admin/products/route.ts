import { NextResponse } from "next/server";
import { adminApi } from "@/lib/admin-guard";
import { saveProduct } from "@/lib/admin-write";

export const POST = adminApi(async (req: Request) => NextResponse.json(await saveProduct(null, await req.json())));
