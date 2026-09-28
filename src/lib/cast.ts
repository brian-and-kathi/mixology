import { query } from "@/lib/db";
import { barVersions } from "@/lib/bar-versions";
import { altGlassLine, cap, lineText, methodParts, serveParts, tvGlassLine } from "@/lib/format";
import { bottleLine, loadPour, loadRecipe } from "@/lib/menu";

// "Show on TV": one cast record (tv_cast, migration 015). A cast lasts 5 minutes, a new cast
// replaces the old one, and anyone on that item's phone page can take it off.
export const CAST_SECONDS = 300;
export type CastType = "recipe" | "pour";

export type CastLine = { amount: string; name: string; out: boolean; use_instead: string | null; optional: boolean; note: string | null; bottles: string | null };
export type CastPayload =
  | { type: "recipe"; id: string; name: string; glass: string | null; serve: string | null; alt: string | null; lines: CastLine[]; method_label: string; method: string[] }
  | { type: "pour"; id: string; name: string; glass: "rocks"; detail: string | null; serve: string; serve_quiet: string[]; note: string | null };
export type Cast = { type: CastType; id: string; started_at: string; expires_at: string; payload: CastPayload };

/** Build what the TV band shows, using the same rules as the phone pages. Null if not on the menu. */
export async function castPayload(type: CastType, id: string): Promise<CastPayload | null> {
  if (type === "recipe") {
    const r = await loadRecipe(id);
    if (!r) return null;
    return {
      type, id: r.id, name: r.name, glass: r.glass,
      serve: r.glass ? tvGlassLine(r.glass, r.service_style, r.glass_note) : null,
      alt: r.alt_glass ? altGlassLine(r.alt_glass, r.alt_service_style, r.service_style) : null,
      // Same as the phone: an optional ingredient that is out with no stand-in is left off.
      lines: r.lines.filter((l) => l.required || l.available || l.use_instead).map((l) => ({
        ...lineText(l.amount, l.unit, l.name), out: !l.available,
        use_instead: l.use_instead ? cap(l.use_instead) : null, optional: !l.required,
        // A preferred bottle is already named in the bottle line, same as the phone.
        note: l.note && !l.preferred ? l.note : null,
        bottles: l.bottles ? bottleLine(l.bottles, " · ", l.preferred) : null,
      })),
      method_label: methodParts(r.description, r.method_style).label,
      method: methodParts(r.description, r.method_style).paragraphs,
    };
  }
  const p = await loadPour(id);
  if (!p) return null;
  const [spec] = await query<{ spec: string | null }>("SELECT primary_spec_name AS spec FROM menu_neat WHERE id = $1", [id]);
  // The TV band keeps the bottle's full name (its detail line already says the type).
  const detail = [p.brand && !p.full_name.toLowerCase().includes(p.brand.toLowerCase()) ? p.brand : null, spec?.spec ? cap(spec.spec) : null, p.abv ? `${Number(p.abv)}% ABV` : null].filter(Boolean).join(" · ");
  const s = serveParts(p.serves_neat, p.serves_rocks, p.serves_chilled);
  return {
    type, id: p.id, name: p.full_name, glass: "rocks", detail: detail || null,
    serve: s.main, serve_quiet: [...(p.serve_note ? [p.serve_note] : []), ...s.quiet], note: p.description,
  };
}

type Row = { item_type: CastType; item_id: string; started_at: string; expires_at: string };

const CAST_ROW = "SELECT item_type, item_id, started_at, expires_at FROM tv_cast WHERE id = 1 AND expires_at > now()";

/**
 * Stable token for the current cast row: "none", or type, id, started_at and the database's
 * cast_version (migration 028), so an edit to the item's text (e.g. a tasting note changed in SQL)
 * also changes the ETag and the TV refetches the pop-up. No recipe or pour load.
 */
export async function castRevision(): Promise<string> {
  const [row] = await query<Row>(CAST_ROW);
  if (!row) return "none";
  const started = new Date(row.started_at);
  const stamp = Number.isNaN(started.getTime()) ? String(row.started_at) : started.toISOString();
  const v = await barVersions().catch(() => null);
  return `${row.item_type}:${row.item_id}:${stamp}${v ? `:${v.cast}` : ""}`;
}

/** The current cast, or null when nothing is showing (expired casts count as nothing). */
export async function currentCast(): Promise<Cast | null> {
  const [row] = await query<Row>(CAST_ROW);
  if (!row) return null;
  const payload = await castPayload(row.item_type, row.item_id);
  if (!payload) return null; // e.g. the cocktail went off the menu mid-cast
  return { type: row.item_type, id: row.item_id, started_at: row.started_at, expires_at: row.expires_at, payload };
}

export async function startCast(type: CastType, id: string): Promise<Cast | null> {
  const payload = await castPayload(type, id);
  if (!payload) return null;
  const [row] = await query<Row>(
    `INSERT INTO tv_cast (id, item_type, item_id, started_at, expires_at)
     VALUES (1, $1, $2, now(), now() + make_interval(secs => $3))
     ON CONFLICT (id) DO UPDATE SET item_type = EXCLUDED.item_type, item_id = EXCLUDED.item_id,
       started_at = EXCLUDED.started_at, expires_at = EXCLUDED.expires_at
     RETURNING item_type, item_id, started_at, expires_at`,
    [type, id, CAST_SECONDS],
  );
  return { type: row.item_type, id: row.item_id, started_at: row.started_at, expires_at: row.expires_at, payload };
}

/**
 * Take a cast off the TV, but only if it is still the item the caller is looking at.
 * `startedAt`, when set, only removes that exact cast, so a phone leaving an older one
 * does not take down a replacement of the same drink.
 */
export async function stopCast(type: CastType, id: string, startedAt?: string | null): Promise<boolean> {
  const rows = await query<{ id: number }>(
    `DELETE FROM tv_cast WHERE id = 1 AND item_type = $1 AND item_id = $2
       AND ($3::timestamptz IS NULL OR started_at = $3::timestamptz) RETURNING id`,
    [type, id, startedAt || null],
  );
  return rows.length > 0;
}

/** Clear whatever is showing (for the future admin "Clear TV" button). */
export async function clearCast(): Promise<void> {
  await query("DELETE FROM tv_cast WHERE id = 1");
}

// Light per-IP rate limit for the public cast endpoints (per server instance).
const hits = new Map<string, number[]>();
export function castRateLimited(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 30;
}
