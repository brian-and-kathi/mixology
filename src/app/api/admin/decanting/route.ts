import { NextResponse } from "next/server";
import { adminApi } from "@/lib/admin-guard";
import { setDecanting } from "@/lib/admin-write";

/** A live recipe on the TV marks the bottle, so this publishes the cast, not the menu board. */
export const POST = adminApi(async (req: Request) => {
  const body = (await req.json()) as { id?: string; decanting?: boolean };
  return NextResponse.json(await setDecanting(String(body.id ?? ""), body.decanting === true));
}, { topic: "bar:cast", kind: "decanting" });
