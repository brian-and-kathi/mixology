import { query } from "@/lib/db";

// Database change signal (migration 028, DESIGN §4.6). Statement triggers bump bar_versions whenever
// something the board (menu_version) or a Show on TV pop-up (cast_version) shows changes, including
// edits made directly in SQL. The publish step claims the versions and tells the relay what moved.
//
// Every read here tolerates a database without migration 028 (undefined_table / undefined_function):
// it returns null and the app behaves exactly as before, so code can ship ahead of the migration.

export type BarVersions = { menu: number; cast: number };
export type BarClaim = BarVersions & { menuChanged: boolean; castChanged: boolean };

const missing = (err: unknown) => ["42P01", "42883"].includes((err as { code?: string })?.code ?? "");

/** Current versions (no write). Null without migration 028. */
export async function barVersions(): Promise<BarVersions | null> {
  try {
    const [row] = await query<{ menu: string; cast: string }>("SELECT menu_version AS menu, cast_version AS cast FROM bar_versions WHERE id = 1");
    return row ? { menu: Number(row.menu), cast: Number(row.cast) } : null;
  } catch (err) {
    if (missing(err)) return null;
    throw err;
  }
}

/**
 * Mark the current versions as published and say which topics moved since the last publish. Two
 * callers never both get "changed" for the same bump (row lock). Null without migration 028.
 */
export async function claimBarVersions(): Promise<BarClaim | null> {
  try {
    const [row] = await query<{ menu_version: string; cast_version: string; menu_changed: boolean; cast_changed: boolean }>(
      "SELECT * FROM claim_bar_versions()",
    );
    if (!row) return null;
    return { menu: Number(row.menu_version), cast: Number(row.cast_version), menuChanged: row.menu_changed, castChanged: row.cast_changed };
  } catch (err) {
    if (missing(err)) return null;
    throw err;
  }
}
