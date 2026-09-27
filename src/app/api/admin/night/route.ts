import { NextResponse } from "next/server";
import { adminApi, UserError } from "@/lib/admin-guard";
import { rollNight } from "@/lib/night";

/** Replace tonight's knock and phrase. Prior lounge cookies stop working. */
export const POST = adminApi(async () => {
  try {
    const night = await rollNight();
    return NextResponse.json({
      ok: true,
      generation: night.generation,
      words: night.words,
    });
  } catch (err) {
    const message = (err as { message?: string })?.message ?? "";
    if (/night_roll/.test(message) && /does not exist/i.test(message)) {
      throw new UserError("Couldn't replace the code. This database doesn't have the night roll table yet.");
    }
    throw err;
  }
});
