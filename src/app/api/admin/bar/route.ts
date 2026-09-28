import { NextResponse, type NextRequest } from "next/server";
import { adminApi, UserError } from "@/lib/admin-guard";
import { adminStatus, readBarStatus, setBarOpen } from "@/lib/bar-status";
import { publish } from "@/lib/relay";

export const dynamic = "force-dynamic";

/** GET: the bar's status for the admin switch (menu and Establishment), with when it opened or closed. */
export const GET = adminApi(async () => {
  const status = await readBarStatus();
  if (status.source === "outage") return NextResponse.json({ error: "Status unavailable." }, { status: 503 });
  return NextResponse.json(adminStatus(status));
});

/**
 * PATCH {open: boolean}: the admin menu's switch. Opening runs until the next 2:00 AM Eastern; closing
 * also clears the TV cast. Tells open screens through the relay (bar:status, plus bar:cast when a cast
 * was taken down).
 */
export const PATCH = adminApi(async (req: NextRequest) => {
  const body = (await req.json().catch(() => null)) as { open?: unknown } | null;
  if (typeof body?.open !== "boolean") throw new UserError("Send {open: true | false}.");
  const { status, castCleared } = await setBarOpen(body.open);
  publish("bar:status", status.open ? "open" : "close");
  if (castCleared) publish("bar:cast", "clear");
  return NextResponse.json({ ...adminStatus(status), castCleared });
});
