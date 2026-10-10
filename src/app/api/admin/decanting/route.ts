import { NextResponse } from "next/server";
import { adminApi } from "@/lib/admin-guard";
import { setDecanting } from "@/lib/admin-write";

/**
 * The TV board and a live cast both show the decanter. Publishing the cast also claims the menu
 * topic, because decanting bumps menu_version (migration 039).
 */
export const POST = adminApi(async (req: Request) => {
  const body = (await req.json()) as { id?: string; decanting?: boolean };
  return NextResponse.json(await setDecanting(String(body.id ?? ""), body.decanting === true));
}, { topic: "bar:cast", kind: "decanting" });
