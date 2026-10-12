import { query } from "@/lib/db";
import { barVersions } from "@/lib/bar-versions";
import { abvLabel, altGlassLine, cap, clampServings, lineText, methodParts, scaleAmount, scaleMethod, scaleProse, serveParts, tvGlassLine } from "@/lib/format";
import { altWords, bottleLine, bottleParts, loadPour, loadRecipe, loadWine, wineGlass } from "@/lib/menu";
import { cleanMoods } from "@/lib/moods";
import { loadAverage } from "@/lib/ratings";
import { spelledOrigin } from "@/lib/us-states";
import { shownVintage, wineColorLabel, wineGrapes, wineTemp } from "@/lib/wine-facts";

// "Show on TV": one cast record (tv_cast, migration 015). A cast lasts 10 minutes, a new cast
// replaces the old one, and anyone on that item's phone page can take it off.
// Types (migration 035 added "wine"): the guest page a cast comes from, /recipe, /pour or /wine. Pours and Cellar
// wines are both products, but each keeps its own type so its card can show what its page shows.
export const CAST_SECONDS = 600;
export const CAST_TYPES = ["recipe", "pour", "wine"] as const;
export type CastType = (typeof CAST_TYPES)[number];
export const isCastType = (v: unknown): v is CastType => typeof v === "string" && (CAST_TYPES as readonly string[]).includes(v);

export type CastLine = { amount: string; name: string; out: boolean; use_instead: string | null; optional: boolean; note: string | null; bottles: string | null; bottle_parts: { text: string; featured?: boolean; decanting?: boolean }[] | null; /** The ingredient stands in for its one bottle, and that bottle is in a decanter. */ spec_decanting?: boolean;
  /** Alternates (migration 034): the muted "or Cognac" / "or Cognac, Brandy" / "or Cognac" + or_more ("+2"), and their notes. */
  or?: string | null; or_more?: number; alt_notes?: string[] };
export type CastPayload =
  | { type: "recipe"; id: string; name: string; glass: string | null; serve: string | null; alt: string | null; featured: boolean; lines: CastLine[]; method_label: string; method: string[]; moods?: string[]; rating: number | null; servings: number }
  | { type: "pour"; id: string; name: string; glass: "rocks"; detail: string | null; serve: string; serve_quiet: string[]; note: string | null; featured: boolean; decanting: boolean; rating: number | null }
  | WinePayload;
/** A Cellar wine's card (Brian via Rachel, 2026-10-06). Every field but the name may be missing; the card leaves it out. */
export type WinePayload = {
  type: "wine"; id: string; name: string; glass: string; featured: boolean;
  /** Grape badge(s), from products.grape (migration 031). */
  grapes: string[];
  /** products.brand, left out when the name already says it (as on the pour card). */
  producer: string | null;
  /** products.origin through spelledOrigin(): the last segment spelled out like the board's Pours line ("Paso Robles, California"). */
  origin: string | null;
  color: string | null;
  /** A year from the name or label name, null when the displayed name already shows it (shownVintage). */
  vintage: string | null;
  abv: string | null;
  /** Serving temperature (lib/wine-facts wineTemp: the serve flags, else the color group). */
  temp: string | null;
  serve_note: string | null;
  note: string | null;
  /** Guests' average, two decimals, or null when nobody has voted. A vote bumps cast_version, so the band refetches this. */
  rating: number | null;
};
export type Cast = { type: CastType; id: string; started_at: string; expires_at: string; payload: CastPayload };

/** Guests' average for the band. Null when nobody has voted, or if ratings can't be read (the cast still shows). */
async function castRating(kind: "recipe" | "product", id: string): Promise<number | null> {
  try {
    const r = await loadAverage(kind, id);
    return r.votes > 0 ? r.avg : null;
  } catch {
    return null;
  }
}

/** Build what the TV band shows, using the same rules as the phone pages. Null if not on the menu. `servings` (1–6) scales a recipe's measured lines. */
export async function castPayload(type: CastType, id: string, servings = 1): Promise<CastPayload | null> {
  const scale = type === "recipe" ? clampServings(servings) : 1;
  if (type === "recipe") {
    const r = await loadRecipe(id);
    if (!r) return null;
    return {
      type, id: r.id, name: r.name, glass: r.glass,
      serve: r.glass ? tvGlassLine(r.glass, r.service_style, r.glass_note) : null,
      alt: r.alt_glass ? altGlassLine(r.alt_glass, r.alt_service_style, r.service_style) : null,
      // Same as the phone: an optional ingredient that is out with no stand-in is left off.
      featured: r.featured,
      // Mood tags (migration 033), the /menu chip labels in MOODS order; none means no line on the band.
      moods: cleanMoods(r.moods),
      lines: r.lines.filter((l) => l.required || l.available || l.use_instead).map((l) => {
        const scaled = {
          ...l,
          amount: scaleAmount(l.amount, l.unit, scale),
          alternates: l.alternates?.map((a) => ({ ...a, amount: scaleAmount(a.amount, a.unit, scale) })),
        };
        const or = altWords(scaled);
        return {
        ...lineText(l.amount, l.unit, l.name, scale), out: !l.available,
        use_instead: l.use_instead ? cap(l.use_instead) : null, optional: !l.required,
        // A preferred bottle is already named in the bottle line, same as the phone.
        note: l.note && !l.preferred ? scaleProse(l.note, scale) : null,
        // With alternates, the leading ingredient's bottles stop at 2 + "+N more" (same as the phone).
        bottles: l.bottles ? bottleLine(l.bottles, " · ", l.preferred, or.text ? 2 : 3) : null,
        bottle_parts: l.bottles ? bottleParts(l.bottles, " · ", l.preferred, or.text ? 2 : 3, l.featured, l.decanting) : null,
        spec_decanting: l.specDecanting,
        // The TV can't be tapped: three or more stay "or Cognac +2".
        or: or.text || null, or_more: or.more.length, alt_notes: or.notes.map((n) => scaleProse(n, scale)),
        };
      }),
      method_label: methodParts(r.description, r.method_style).label,
      method: scaleMethod(methodParts(r.description, r.method_style).paragraphs, scale),
      rating: await castRating("recipe", r.id),
      servings: scale,
    };
  }
  if (type === "wine") return winePayload(id);
  const p = await loadPour(id);
  if (!p) return null;
  const [spec] = await query<{ spec: string | null }>("SELECT primary_spec_name AS spec FROM menu_neat WHERE id = $1", [id]);
  // The TV band keeps the bottle's full name (its detail line already says the type).
  const detail = [p.brand && !p.full_name.toLowerCase().includes(p.brand.toLowerCase()) ? p.brand : null, spec?.spec ? cap(spec.spec) : null, abvLabel(p.abv) || null].filter(Boolean).join(" · ");
  const s = serveParts(p.serves_neat, p.serves_rocks, p.serves_chilled);
  return {
    type, id: p.id, name: p.full_name, glass: "rocks", detail: detail || null,
    serve: s.main, serve_quiet: [...(p.serve_note ? [p.serve_note] : []), ...s.quiet], note: p.description, featured: p.featured, decanting: p.decanting,
    rating: await castRating("product", p.id),
  };
}

/** Cellar wine card: only while the wine is in the guest Cellar and not reserved (loadWine). */
async function winePayload(id: string): Promise<WinePayload | null> {
  const w = await loadWine(id);
  if (!w) return null;
  const brand = w.brand?.trim() || null;
  const origin = spelledOrigin(w.origin) || null;
  return {
    type: "wine", id: w.id, name: w.name, glass: wineGlass(w.sparkling, w.type), featured: w.featured,
    grapes: wineGrapes(w.grape),
    producer: brand && !w.name.toLowerCase().includes(brand.toLowerCase()) ? brand : null,
    origin,
    color: wineColorLabel(w.wine_color, w.wine_effervescence, w.fortified),
    vintage: shownVintage(w.name, w.packaged_name),
    abv: w.abv && Number(w.abv) > 0 ? `${Number(w.abv)}% ABV` : null,
    temp: wineTemp({ chilled: w.serves_chilled, neat: w.serves_neat, rocks: w.serves_rocks, styleGroup: w.style_group }),
    serve_note: w.serve_note?.trim() || null,
    note: w.description?.trim() || null,
    rating: await castRating("product", w.id),
  };
}

type Row = { item_type: CastType; item_id: string; started_at: string; expires_at: string; servings: number };

const CAST_ROW_PLAIN = "SELECT item_type, item_id, started_at, expires_at, servings FROM tv_cast WHERE id = 1 AND expires_at > now()";
// Open/Closed (migration 029): nothing is cast while the bar is Closed. Closing deletes the row; the
// 2:00 AM self-close writes nothing, so this hides the row until opening deletes it.
const CAST_ROW_GATED = `SELECT t.item_type, t.item_id, t.started_at, t.expires_at, t.servings
  FROM tv_cast t LEFT JOIN bar_state() b ON true
 WHERE t.id = 1 AND t.expires_at > now() AND b.is_open`;

/** The live cast row, if any. Before migration 029 (no bar_state()), the plain rule. */
async function castRow(): Promise<Row | undefined> {
  try {
    return (await query<Row>(CAST_ROW_GATED))[0];
  } catch (err) {
    if (["42P01", "42883"].includes((err as { code?: string })?.code ?? "")) return (await query<Row>(CAST_ROW_PLAIN))[0];
    throw err;
  }
}

/**
 * Stable token for the current cast row: "none", or type, id, started_at and the database's
 * cast_version (migration 028), so an edit to the item's text (e.g. a tasting note changed in SQL)
 * also changes the ETag and the TV refetches the pop-up. No recipe or pour load.
 */
export async function castRevision(): Promise<string> {
  const row = await castRow();
  if (!row) return "none";
  const started = new Date(row.started_at);
  const stamp = Number.isNaN(started.getTime()) ? String(row.started_at) : started.toISOString();
  const v = await barVersions().catch(() => null);
  // Servings is part of the token so moving the slider refetches the band without restarting the cast.
  return `${row.item_type}:${row.item_id}:${stamp}:s${clampServings(row.servings)}${v ? `:${v.cast}` : ""}`;
}

/** The current cast, or null when nothing is showing (expired casts count as nothing). */
export async function currentCast(): Promise<Cast | null> {
  const row = await castRow();
  if (!row) return null;
  const payload = await castPayload(row.item_type, row.item_id, row.servings);
  if (!payload) return null; // e.g. the cocktail went off the menu mid-cast
  return { type: row.item_type, id: row.item_id, started_at: row.started_at, expires_at: row.expires_at, payload };
}

export async function startCast(type: CastType, id: string, servings = 1): Promise<Cast | null> {
  const scale = type === "recipe" ? clampServings(servings) : 1;
  const payload = await castPayload(type, id, scale);
  if (!payload) return null;
  const [row] = await query<Row>(
    `INSERT INTO tv_cast (id, item_type, item_id, started_at, expires_at, servings)
     VALUES (1, $1, $2, now(), now() + make_interval(secs => $3), $4)
     ON CONFLICT (id) DO UPDATE SET item_type = EXCLUDED.item_type, item_id = EXCLUDED.item_id,
       started_at = EXCLUDED.started_at, expires_at = EXCLUDED.expires_at, servings = EXCLUDED.servings
     RETURNING item_type, item_id, started_at, expires_at, servings`,
    [type, id, CAST_SECONDS, scale],
  );
  return { type: row.item_type, id: row.item_id, started_at: row.started_at, expires_at: row.expires_at, payload };
}

/**
 * Change how many servings the TV is building, without restarting the 10 minutes.
 * No-op (null) unless this recipe is the cast on screen right now.
 */
export async function setCastServings(id: string, servings: number): Promise<Cast | null> {
  const scale = clampServings(servings);
  const [row] = await query<Row>(
    `UPDATE tv_cast SET servings = $2
      WHERE id = 1 AND item_type = 'recipe' AND item_id = $1 AND expires_at > now()
      RETURNING item_type, item_id, started_at, expires_at, servings`,
    [id, scale],
  );
  if (!row) return null;
  const payload = await castPayload("recipe", id, scale);
  if (!payload) return null;
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
