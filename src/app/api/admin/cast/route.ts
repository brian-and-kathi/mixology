import { NextResponse } from "next/server";
import { adminApi } from "@/lib/admin-guard";
import { clearCast } from "@/lib/cast";

/** DELETE: admin "Clear TV" — take whatever is cast off the TV, no matter which item it is. */
export const DELETE = adminApi(async () => {
  await clearCast();
  return NextResponse.json({ cast: null, now: new Date().toISOString() });
});
