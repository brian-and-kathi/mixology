import { NextResponse } from "next/server";
import { adminApi } from "@/lib/admin-guard";
import { addSubstitution, deleteSubstitution } from "@/lib/admin-write";

export const POST = adminApi(async (req: Request) => NextResponse.json(await addSubstitution(await req.json())), { topic: "bar:menu", kind: "substitution" });
export const DELETE = adminApi(async (req: Request) => NextResponse.json(await deleteSubstitution(await req.json())), { topic: "bar:menu", kind: "substitution" });
