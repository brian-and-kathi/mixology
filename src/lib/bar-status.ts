import { cache } from "react";
import { isAdmin } from "@/lib/admin-guard";
import { nextCloseAt } from "@/lib/bar-clock";
import { query, sql } from "@/lib/db";

// Bar Open/Closed (migration 029, DESIGN §3.1). The server is the only judge: every guest page and guest
// API asks guestGate(). Open means bar_status.is_open AND now() < open_until (bar_state() in SQL), so the
// bar closes itself at 2:00 AM Eastern and never opens by itself.
//
// Failure rules: one failed read is retried once; if it still fails, this server instance keeps its
// last good answer for up to GRACE_MS (re-checking open_until against the clock), so a single blip never
// flips anyone to Closed. Past that, or with no good answer yet, or with the table missing, it fails
// closed ("outage"): guests get the closed page and admins still get in.

export const GRACE_MS = 45_000;

export type BarStatus = {
  open: boolean;
  /** ISO time the bar closes itself (only while open). */
  openUntil: string | null;
  /** ISO time it last became closed (only while closed; null when unknown). */
  closedSince: string | null;
  /** db: read now; grace: last good read (within GRACE_MS); outage: couldn't read, failing closed. */
  source: "db" | "grace" | "outage";
};

type Row = { is_open: boolean; open_until: string | Date | null; closed_since: string | Date | null };
const iso = (v: string | Date | null) => (v == null ? null : new Date(v).toISOString());

let lastGood: { at: number; status: BarStatus } | null = null;

async function readOnce(): Promise<BarStatus> {
  const [row] = await query<Row>("SELECT is_open, open_until, closed_since FROM bar_state()");
  if (!row) return { open: false, openUntil: null, closedSince: null, source: "db" };
  return { open: row.is_open, openUntil: iso(row.open_until), closedSince: iso(row.closed_since), source: "db" };
}

/** Uncached read with the retry and the grace window. */
export async function readBarStatus(now = () => Date.now()): Promise<BarStatus> {
  let status: BarStatus;
  try {
    status = await readOnce();
  } catch {
    try {
      await new Promise((r) => setTimeout(r, 150));
      status = await readOnce();
    } catch (err) {
      const kept = lastGood && now() - lastGood.at < GRACE_MS ? lastGood.status : null;
      if (kept) {
        // Still honor the 2:00 AM close while running on the kept answer.
        const open = kept.open && kept.openUntil !== null && Date.parse(kept.openUntil) > now();
        return { ...kept, open, openUntil: open ? kept.openUntil : null, closedSince: open ? null : kept.closedSince ?? kept.openUntil, source: "grace" };
      }
      console.error("bar status: unreadable, failing closed", (err as { code?: string })?.code ?? err);
      return { open: false, openUntil: null, closedSince: null, source: "outage" };
    }
  }
  lastGood = { at: now(), status };
  return status;
}

/** One read per request (React cache) for pages and layouts. */
export const barStatus = cache(() => readBarStatus());

export type Gate = BarStatus & { admin: boolean; allowed: boolean };

/** Guest pages and APIs: open for everyone while Open; while Closed, only a valid admin session. */
export const guestGate = cache(async (): Promise<Gate> => {
  const [status, admin] = await Promise.all([barStatus(), isAdmin()]);
  return { ...status, admin, allowed: status.open || admin };
});

/**
 * Admin switch. Opening sets open_until to the next 2:00 AM Eastern. Closing clears the TV cast in the same
 * transaction. Opening also deletes a cast from before the last close: the 2:00 AM self-close writes nothing,
 * so that cast is only hidden (castRow()), and reopening within its 5 minutes would bring it back. A cast an
 * admin started while Closed stays. Logs to change_log only when the effective state changes. Returns the new
 * state and whether a cast was taken down.
 */
export async function setBarOpen(open: boolean, now = new Date()): Promise<{ status: BarStatus; castCleared: boolean }> {
  const until = open ? nextCloseAt(now).toISOString() : null;
  const results = (await sql().transaction((t) => [
    // Before the status row changes, while bar_state() still says when the bar last closed.
    t.query(
      `DELETE FROM tv_cast t USING bar_state() b
        WHERE t.id = 1 AND (NOT $1::boolean OR (b.closed_since IS NOT NULL AND t.started_at < b.closed_since))
       RETURNING t.id`,
      [open],
    ),
    t.query(
      `WITH prev AS (SELECT is_open FROM bar_state()),
            u AS (
              INSERT INTO bar_status (id, is_open, open_until, changed_at) VALUES (1, $1, $2::timestamptz, now())
              ON CONFLICT (id) DO UPDATE SET is_open = EXCLUDED.is_open, open_until = EXCLUDED.open_until, changed_at = now()
                WHERE (bar_status.is_open AND now() < bar_status.open_until) IS DISTINCT FROM EXCLUDED.is_open
                   OR bar_status.open_until IS DISTINCT FROM EXCLUDED.open_until
              RETURNING is_open)
       INSERT INTO change_log (entity, entity_id, action, summary, before, after)
       SELECT 'bar', 'status', 'update', CASE WHEN $1 THEN 'Bar opened' ELSE 'Bar closed' END,
              jsonb_build_object('open', coalesce((SELECT is_open FROM prev), false)),
              jsonb_build_object('open', $1, 'open_until', $2::timestamptz)
         FROM u
        WHERE coalesce((SELECT is_open FROM prev), false) IS DISTINCT FROM $1
       RETURNING id`,
      [open, until],
    ),
    t.query("SELECT is_open, open_until, closed_since FROM bar_state()"),
  ])) as unknown[][];
  const [row] = results[2] as Row[];
  const status: BarStatus = { open: row.is_open, openUntil: iso(row.open_until), closedSince: iso(row.closed_since), source: "db" };
  lastGood = { at: Date.now(), status };
  return { status, castCleared: (results[0] as unknown[]).length > 0 };
}

/** What the browser gets (GET /api/bar/status and the first render): no internals. */
export const publicStatus = (s: BarStatus, serverNow = new Date()) => ({ open: s.open, openUntil: s.openUntil, now: serverNow.toISOString() });
