import { NextResponse } from "next/server";
import { publicStatus, readBarStatus } from "@/lib/bar-status";

export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" };

/**
 * GET: {open, openUntil, now} for open screens (DESIGN §3.1). Guest phones, the TV, the knock page and
 * the admin menu call it on a bar:status relay notice, on their poll, and when openUntil passes.
 * If the status can't be read (outage), it answers 503 instead of "closed", so a screen keeps its last
 * known state through a blip (its own grace window) rather than flashing Closed; the pages themselves
 * still fail closed on the server.
 */
export async function GET() {
  const status = await readBarStatus();
  if (status.source === "outage") return NextResponse.json({ error: "Status unavailable." }, { status: 503, headers: noStore });
  return NextResponse.json(publicStatus(status), { headers: noStore });
}
