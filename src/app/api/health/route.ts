import { query } from "@/lib/db";
import { commitHash } from "@/lib/version";

export const dynamic = "force-dynamic";

/** Liveness + DB check for the container healthcheck. Never echoes connection details. */
export async function GET() {
  try {
    await query("SELECT 1");
    return Response.json({ ok: true, db: true, commit: commitHash() });
  } catch {
    return Response.json({ ok: false, db: false, commit: commitHash() }, { status: 503 });
  }
}
