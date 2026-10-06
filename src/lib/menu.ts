import { isUuid, query } from "@/lib/db";
import { spiritFamily } from "@/lib/spirit-family";
import { badgeFor, specLabel } from "@/lib/spec-label";
import { CELLAR_COLORS, cellarColor } from "@/lib/moods";
import { shortRegion } from "@/lib/us-states";

// Section order is fixed everywhere (TV and phone): Pours, Cocktails, Cellar.
export const SECTIONS = [
  { id: "pours", label: "Pours" },
  { id: "cocktails", label: "Cocktails" },
  { id: "cellar", label: "Cellar" },
] as const;
export type SectionId = (typeof SECTIONS)[number]["id"];

/**
 * Subtext under a name. `detail` is the phone line (items joined with a no-break space before each
 * " · ", so a wrapped line never starts with a dot). `fit` is the TV's candidates, longest first:
 * the TV shows the first (the whole line) and wraps it when it is too long (TvBoard FitLine, 2026-10-04); the
 * shorter candidates are no longer used.
 */
export type Sub = { detail: string; fit: string[]; /** Place name as it appears at the start of `detail` (phone) and of the TV line. */ origin?: string; /** Shorter place shown on the TV when the phone line keeps the full origin. */ originTv?: string };
/**
 * `spec`: the badge after a Pours name ("Rye", see lib/spec-label; none when the name already says it);
 * other sections have none. `measure`: the text the TV sizes the column by (the full name, so column
 * widths are exactly what they were before short names and badges). `famStart` (Pours): the first bottle of a
 * spirit family after another family (lib/spirit-family.ts); (Cellar): the first wine of a category after another
 * category (wineCategory, migration 031). The phone and TV add the same small gap above it.
 */
export type MenuItem = { id: string; name: string; glass: string | null; href: string | null; detail?: string | null; fit?: string[]; spec?: string | null; /** Pours: "40% abv" shown as a superscript on the TV title. Phone detail still says "40% ABV". */ abv?: string | null; /** Place name at the start of `detail`, for coloring it like the bottle. */ origin?: string | null; /** Place name at the start of the TV line, when that line is shorter than `detail`. */ originTv?: string | null; measure?: string; famStart?: boolean; /** Featured (migration 030): sorted to the top of its list, with the copper "Featured" tag. */ featured?: boolean; /** Reserved (migration 032): a reserved bottle, or a cocktail that needs one. Still listed, LOCKED: key icon, brass "Ask the host" tag, dimmed, after the available items of its family; no detail page, no cast. Never featured. */ reserved?: boolean; /** The occasion ("Kathi's 50th"), shown as "Saved for …". */ reservedNote?: string | null };
export type Menu = Record<SectionId, MenuItem[]>;

const byName = (a: MenuItem, b: MenuItem) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base" });

const cmp = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" });

/**
 * Pours in spirit-family order (Whiskey … Liqueurs, lib/spirit-family.ts), then by badge text (the would-be
 * badge when it's hidden because the name already says it), then by the shown name. Marks each family's first row.
 * Featured pours (migration 030) come first, in the same order; the first family after them gets the gap too.
 */
function byFamily(rows: (MenuItem & { family: number; sortBadge: string })[]): MenuItem[] {
  // Reserved (locked) pours go after the available pours of their own family (migration 032).
  const sorted = [...rows].sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || a.family - b.family || Number(!!a.reserved) - Number(!!b.reserved) || cmp(a.sortBadge, b.sortBadge) || cmp(a.name, b.name));
  return sorted.map(({ family, sortBadge: _badge, ...item }, i) => {
    const prev = sorted[i - 1];
    const famStart = !!prev && !item.featured && (!!prev.featured || family !== prev.family);
    return { ...item, famStart };
  });
}

/** Phone and TV: featured items (migration 030) first, then the list's own order. Stable. */
export const featuredFirst = <T extends { featured?: boolean }>(items: T[]): T[] =>
  [...items.filter((i) => i.featured), ...items.filter((i) => !i.featured)];

/** Reserved (locked) items after the available ones (migration 032). Stable. */
export const reservedLast = <T extends { reserved?: boolean }>(items: T[]): T[] =>
  [...items.filter((i) => !i.reserved), ...items.filter((i) => i.reserved)];

/** A locked item is never featured, and has no detail page: its detail URL shows the locked page (loadLocked). */
const lock = <T extends MenuItem>(item: T, reserved: boolean, note: string | null): T =>
  reserved ? { ...item, reserved: true, reservedNote: note, featured: false } : item;

/** Cellar color group, in menu order: Red, White, Rosé, Sparkling, Other (CELLAR_COLORS, lib/moods.ts; the /menu chips). */
const wineGroup = (styleGroup: string | null, fortified: boolean | null) => CELLAR_COLORS.indexOf(cellarColor(styleGroup, fortified));

/**
 * A Cellar wine's category (migration 031): its grape ("Cabernet Sauvignon"), or with no grape its main
 * ingredient's label ("Sangria", "Sake", "Cranberry wine"). Grapes are display text, never ingredients, so
 * recipes still match the bottle on its type ("red wine"). Shared by the Cellar list and the wine page.
 */
export function wineCategory(grape: string | null | undefined, type: string | null | undefined): string | null {
  const g = (grape ?? "").trim();
  return g || specLabel(type);
}

/**
 * A Cellar wine's badge (list, TV and wine page): its grape whenever it has one, even when the name says it
 * ("Chateau Grand Traverse Merlot 2020" → "Merlot"); with no grape, the type's label unless the name already
 * says it (badgeFor: "Señor Sangria Classic Red" gets none, "Bavarian Inn Cranberry" gets "Cranberry wine").
 */
export function wineBadge(name: string, grape: string | null | undefined, type: string | null | undefined): string | null {
  const g = (grape ?? "").trim();
  return g || badgeFor(name, specLabel(type));
}

/**
 * Cellar in color-group order (red, white, rosé, sparkling, other), then by category, then by name. Featured
 * wines (migration 030) come first, in the same order, like Pours. Marks the first wine of each category with
 * famStart (the gap Pours puts between spirit families); the first category after the featured wines gets it too.
 */
function byCategory(rows: (MenuItem & { group: number; category: string })[]): MenuItem[] {
  // Reserved (locked) wines go after the available wines of their own category (migration 032).
  const sorted = [...rows].sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || a.group - b.group || cmp(a.category, b.category) || Number(!!a.reserved) - Number(!!b.reserved) || cmp(a.name, b.name));
  return sorted.map(({ group, category, ...item }, i) => {
    const prev = sorted[i - 1];
    const famStart = !!prev && !item.featured && (!!prev.featured || group !== prev.group || cmp(category, prev.category) !== 0);
    return { ...item, famStart };
  });
}

/**
 * The three guest sections come straight from the existing database views:
 * menu_neat (Pours), menu_mixed (buildable Cocktails), menu_wines (Cellar).
 */
export async function loadMenu(): Promise<Menu> {
  const [pours, cocktails, cellar, lines] = await Promise.all([
    query<{ id: string; name: string; full: string; origin: string | null; abv: string | null; type: string | null; label: string | null; family: string | null; featured: boolean; reserved: boolean; reserved_note: string | null }>(
      // Pours show the bottle's short name (migration 023; NULL = the full name) with a badge: its own badge
      // label, or else its type (spec_label is display only; the subtext's type fallback stays the ingredient).
      `SELECT n.id, COALESCE(p.short_name, n.display_name) AS name, n.display_name AS full, n.origin, n.abv::text AS abv, n.primary_spec_name AS type,
              p.spec_label AS label, (p.id IN (SELECT featured_product_ids())) AS featured, n.reserved, n.reserved_note,
              -- The primary ingredient's family, for grouping (lib/spirit-family.ts). Ingredient names are unique.
              (SELECT f.slug FROM specs s JOIN spec_families sf ON sf.spec_id = s.id AND sf.is_primary
                 JOIN families f ON f.id = sf.family_id WHERE s.canonical_name = n.primary_spec_name) AS family
         FROM menu_neat n JOIN products p ON p.id = n.id`,
    ),
    query<{ id: string; name: string; glass: string | null; featured: boolean; reserved: boolean; reserved_note: string | null }>(
      `SELECT m.id, m.name, g.name AS glass, (m.id IN (SELECT featured_recipe_ids())) AS featured, m.reserved, m.reserved_note
         FROM menu_mixed m
         JOIN recipes r ON r.id = m.id
         LEFT JOIN glassware g ON g.id = r.glass_id`,
    ),
    query<{ id: string; name: string; origin: string | null; type: string | null; grape: string | null; style_group: string | null; fortified: boolean | null; sparkling: boolean; featured: boolean; reserved: boolean; reserved_note: string | null }>(
      `SELECT w.id, w.display_name AS name, w.origin, (w.wine_effervescence = 'sparkling') AS sparkling,
              w.grape, w.style_group, w.fortified, (w.id IN (SELECT featured_product_ids())) AS featured, w.reserved, w.reserved_note,
              (SELECT s.canonical_name FROM product_specs ps JOIN specs s ON s.id = ps.spec_id
                WHERE ps.product_id = w.id AND ps.is_primary) AS type
         FROM menu_wines w`,
    ),
    loadCocktailLines(),
  ]);
  return {
    // Pours have no glass_id in the schema; they are shown with a rocks glass.
    // Reserved (migration 032): the pour, cocktail or wine stays listed but locked (lock()); its link opens the
    // locked page, which never shows the recipe, specs or serve. A locked cocktail drops its ingredient line.
    pours: byFamily(pours.map((p) => {
      const badge = specLabel(p.type, p.label);
      return lock({ id: p.id, name: p.name, glass: "rocks", href: `/pour/${p.id}`, spec: badgeFor(p.name, badge), measure: p.full, ...pourLine(p),
        abv: p.abv && Number(p.abv) > 0 ? `${Number(p.abv)}% abv` : null, featured: p.featured,
        family: spiritFamily(p.type, p.family), sortBadge: badge ?? "" }, p.reserved, p.reserved_note);
    })),
    cocktails: reservedLast<MenuItem>(featuredFirst<MenuItem>(cocktails.map(({ reserved, reserved_note, ...c }) =>
      lock<MenuItem>({ ...c, href: `/recipe/${c.id}`, ...(reserved ? {} : lines.get(c.id) ?? {}) }, reserved, reserved_note)).sort(byName))),
    // Cellar: the badge is the category. A grape always shows (Brian, 2026-10-04: "… Merlot 2020" still gets "Merlot");
    // with no grape, the type's label is hidden when the name already says it ("Señor Sangria", "Hakutsuru Sake").
    cellar: byCategory(cellar.map((w) => {
      const category = wineCategory(w.grape, w.type);
      return lock({ id: w.id, name: w.name, glass: wineGlass(w.sparkling, w.type), href: `/wine/${w.id}`, spec: wineBadge(w.name, w.grape, w.type), featured: w.featured, ...wineLine(w),
        group: wineGroup(w.style_group, w.fortified), category: category ?? "" }, w.reserved, w.reserved_note);
    })),
  };
}

/**
 * Ingredient line for each cocktail on the menu: required lines in recipe order, no amounts,
 * leaving out garnishes (role "garnish"), ice and water (the "staple" family) and optional lines.
 * A line that is out tonight names its first alternate on the shelf (migration 034), else its stocked stand-in,
 * with the same shelf rule as the recipe page (loadRecipe): only a bottle on the shelf counts. Reserved bottles (migration 032)
 * are not on the shelf here; a locked cocktail shows no line at all.
 */
async function loadCocktailLines(): Promise<Map<string, Sub>> {
  const rows = await query<{ recipe_id: string; names: string[] }>(
    `WITH shelf AS (
       SELECT sp.id FROM specs sp
        WHERE sp.always_available
           OR EXISTS (SELECT 1 FROM product_specs ps JOIN products p ON p.id = ps.product_id
                       WHERE ps.spec_id = sp.id AND p.in_stock AND NOT p.reserved)),
     staple AS (
       SELECT sf.spec_id FROM spec_families sf JOIN families f ON f.id = sf.family_id WHERE f.slug = 'staple')
     SELECT s.recipe_id,
            -- The ingredient the guest would get: the line's own when it's on the shelf, else its first alternate
            -- on the shelf (migration 034, by position), else a stocked global stand-in, else the line's own name.
            array_agg(
              COALESCE((SELECT sp.canonical_name
                          FROM recipe_line_options o JOIN specs sp ON sp.id = o.spec_id
                         WHERE o.recipe_line_id = rl.id AND o.spec_id IN (SELECT id FROM shelf)
                         ORDER BY o.rank
                         LIMIT 1),
                       (SELECT src.canonical_name
                          FROM spec_substitutions ss
                          JOIN specs src ON src.id = ss.source_spec_id
                         WHERE ss.target_spec_id = s.spec_id
                           AND ss.source_spec_id IN (SELECT id FROM shelf)
                         ORDER BY src.canonical_name
                         LIMIT 1),
                       s.spec_name)
              ORDER BY s.position) AS names
       FROM recipe_line_status s
       JOIN recipe_lines rl ON rl.recipe_id = s.recipe_id AND rl.position = s.position
      WHERE s.recipe_id IN (SELECT id FROM menu_mixed)
        AND s.required
        AND rl.role IS DISTINCT FROM 'garnish'
        AND s.spec_id NOT IN (SELECT spec_id FROM staple)
      GROUP BY s.recipe_id`,
  );
  return new Map(rows.flatMap((r) => { const sub = ingredientLine(r.names); return sub ? [[r.recipe_id, sub] as [string, Sub]] : []; }));
}

const first = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const clean = (t: string | null) => (t ?? "").trim();
const DOT = "\u00a0· ";
const NBSP = "\u00a0";
/** Phone subtext: a place name never splits inside a part ("Grand Rapids", "New York", "United Kingdom"); a line may still break after its comma. */
const keepPlace = (region: string) => region.split(/,\s*/).map((part) => part.trim().replace(/\s+/g, NBSP)).filter(Boolean).join(", ");
/** Phone subtext: the number and "ABV" stay together ("26% ABV" never leaves "ABV" alone on a line). */
const keepAbv = (abv: string) => abv.replace(/ ABV$/, `${NBSP}ABV`);

/**
 * A list line ("Rye · sweet vermouth · cherry liqueur"), only the first word capitalized.
 * Shorter TV candidates cut at whole items with a trailing "· …" ("Rye · sweet vermouth · …"); the TV now
 * shows only the first (whole) one and wraps it, so these are kept for reference only.
 */
function listSub(items: string[]): { detail: string; fit: string[] } | null {
  const list = [...new Set(items.map((i) => i.trim()).filter(Boolean))];
  if (!list.length) return null;
  const fit = [first(list.join(" · "))];
  for (let k = list.length - 1; k >= 1; k--) fit.push(first(`${list.slice(0, k).join(" · ")} · …`));
  const words = list[0].split(/\s+/);
  for (let k = words.length - 1; k >= 1; k--) fit.push(first(`${words.slice(0, k).join(" ")} …`));
  return { detail: first(list.join(DOT)), fit };
}

/** Cocktails: ingredients in recipe order, no amounts. */
export function ingredientLine(names: string[]) {
  return listSub(names);
}

/**
 * Pours. Phone: "Lake City, Michigan · 45% ABV" (one if the other is missing; neither, the type), with
 * no-break spaces inside "Lake City" and "45% ABV" so neither splits across lines.
 * TV: the region only, shortened to its state or country ("Michigan", also from "Lake City, MI"). The ABV is a superscript on the name.
 */
export function pourLine(p: { origin: string | null; abv: string | null; type: string | null }): Partial<Sub> {
  const abv = p.abv && Number(p.abv) > 0 ? `${Number(p.abv)}% ABV` : "";
  const region = clean(p.origin);
  // Last segment, a US code spelled out ("Lake City, MI" -> "Michigan"); other places as stored.
  const short = shortRegion(region);
  if (!region && !abv) {
    const type = clean(p.type);
    return type ? { detail: first(type), fit: [first(type)] } : {};
  }
  const head = region ? keepPlace(region) : "";
  const detail = first([head, keepAbv(abv)].filter(Boolean).join(DOT));
  const origin = head ? detail.slice(0, first(head).length) : undefined;
  const originTv = short ? first(short) : undefined;
  if (!short) return { detail, origin, originTv };
  return { detail, origin, originTv, fit: [originTv!] };
}

/**
 * Cellar. Phone and TV: only the place ("California"). The style is the corner tab (phone) or inline
 * badge (TV), so the line never repeats it. No region: no line at all (no blank line or stray " · ").
 * Regions come only from the bottle's origin field; nothing is guessed.
 */
export function wineLine(w: { origin: string | null }): Partial<Sub> {
  const region = clean(w.origin);
  if (!region) return {};
  // Phone keeps each place name whole ("New\u00a0York"); the TV line is unchanged (plain spaces).
  const detail = first(keepPlace(region));
  const tv = first(region);
  return { detail, origin: detail, originTv: tv, fit: [tv] };
}

export type RecipeLine = {
  position: number;
  name: string;
  required: boolean;
  available: boolean;
  amount: string | null;
  unit: string | null;
  note: string | null;
  use_instead: string | null;
  /** The in-stock bottles behind this line, ordered like Pours, or null when a line would add nothing (see bottleNames). */
  bottles: string[] | null;
  /** The note names a preferred bottle that is in the list: it is listed first as "(preferred)" and the phone drops the note. */
  preferred: boolean;
  /** Shown names in `bottles` that are featured (migration 030; in stock by definition). */
  featured: string[];
  /**
   * The line's other choices a guest may use tonight (migration 034): its alternates with a bottle on the shelf
   * (in stock, not reserved), in priority order, not counting the one that leads. When the line's own ingredient is
   * out, its first such alternate leads instead (name, amount, note and bottles above are the alternate's) and the
   * own ingredient isn't offered at all.
   */
  alternates: { name: string; amount: string | null; unit: string | null; note: string | null }[];
};

export type Recipe = {
  id: string;
  name: string;
  description: string | null;
  rating: number | null;
  glass: string | null;
  glass_description: string | null;
  service_style: string | null;
  alt_glass: string | null;
  alt_service_style: string | null;
  glass_note: string | null;
  method_style: string | null;
  /** Mood tags (migration 033), as stored; cleanMoods() puts them in MOODS order. */
  moods: string[];
  /** Uses a featured product (featured_recipe_ids(), migration 030). */
  featured: boolean;
  lines: RecipeLine[];
};

/** `short`: the name shown for the bottle (short name, or the full name; Cellar wines always the full name). */
type BottleFacts = { own: boolean | null; kind: string; has_bottles: boolean; stock: { name: string; brand: string | null; short?: string | null; featured?: boolean }[] };

/** Ingredient families that are bottles a guest would recognise; citrus, juice, syrups, garnishes, ice and water are not. */
const BOTTLE_KINDS = new Set(["spirit", "modifier", "wine", "mixer"]);
const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The bottle line under a recipe ingredient: the in-stock bottles behind it (full names, ordered like
 * Pours, i.e. by the name shown; see shownNames for what the guest reads); an
 * empty list ("None in stock") when it has bottles but none is in and nothing stands in; or null
 * when the line would add nothing: not a bottle family, no bottles on record at all, or the only
 * bottle is the one the name beside it already says (the ingredient, or the stand-in it says to use:
 * "Grand Marnier" → Grand Marnier is left off; "rye" → Willett Rye is still shown).
 */
export function bottleNames(spec: string, f: BottleFacts): string[] | null {
  if (!BOTTLE_KINDS.has(f.kind)) return null;
  const shown = new Map(f.stock.map((b) => [b.name.trim(), (b.short ?? b.name).trim()]));
  const names = [...new Set(f.stock.map((b) => b.name.trim()).filter(Boolean))]
    .sort((a, b) => (shown.get(a) ?? a).localeCompare(shown.get(b) ?? b, "en", { sensitivity: "base" }));
  if (!names.length) return f.own === null && f.has_bottles ? [] : null;
  if ((f.own || f.own === false) && names.length === 1) {
    const s = norm(spec), only = f.stock.find((b) => b.name.trim() === names[0]);
    if (s.includes(norm(names[0])) || (only?.brand && norm(only.brand) && s.includes(norm(only.brand)))) return null;
  }
  return names;
}

/**
 * What the guest reads for each bottle on the line: its short name ("Bowright Recurve" under "Rye"), or
 * the full name when it has none. The "already says it" and "preferred" rules above run on full names.
 */
export function shownNames(names: string[] | null, stock: BottleFacts["stock"]): string[] | null {
  if (!names) return names;
  const shown = new Map(stock.map((b) => [b.name.trim(), (b.short ?? b.name).trim()]));
  return names.map((n) => shown.get(n) || n);
}

/** "Grand Marnier preferred", "Grand Marnier (preferred)", "preferably Grand Marnier", "ideally Grand Marnier". */
const PREFERRED = [/^(.+?)\s*\(?(?:is\s+)?preferred\)?\.?$/i, /^(?:preferably|ideally)\s+(.+?)\.?$/i];

/**
 * A recipe note that names a preferred bottle ("Grand Marnier preferred") folds into the bottle line
 * when that bottle is one of those listed: it moves to the front and is marked "(preferred)", and the
 * note isn't repeated. A preferred bottle that isn't in stock leaves the note as it is.
 */
export function preferFirst(names: string[] | null, note: string | null): { bottles: string[] | null; preferred: boolean } {
  const want = note ? PREFERRED.map((re) => re.exec(note.trim())?.[1]).find(Boolean) : undefined;
  const w = want ? norm(want) : "";
  const hit = names && w ? names.findIndex((n) => norm(n) === w) : -1;
  const at = hit >= 0 ? hit : names && w ? names.findIndex((n) => norm(n).includes(w)) : -1;
  if (!names || at < 0) return { bottles: names, preferred: false };
  return { bottles: [names[at], ...names.filter((_, i) => i !== at)], preferred: true };
}

/**
 * "Bowright Recurve · Willett"; at most three (a preferred bottle counts as one), then
 * "+N more". Empty list: "None in stock". `sep` is the phone's no-break space before " · " (a wrapped
 * line never starts with a dot); "(preferred)" stays with its bottle.
 */
export function bottleLine(names: string[], sep = " · ", preferred = false, max = 3): string {
  return bottleParts(names, sep, preferred, max).map((p) => p.text).join("");
}

/** A piece of a bottle line: a bottle (maybe featured), a separator, "+N more" or "None in stock". */
export type BottlePart = { text: string; featured?: boolean };

/**
 * bottleLine as pieces, so a featured bottle (migration 030) can carry the copper "Featured" tag.
 * `featured`: shown names that are featured. Same text as bottleLine when joined.
 */
export function bottleParts(names: string[], sep = " · ", preferred = false, max = 3, featured: string[] = []): BottlePart[] {
  if (!names.length) return [{ text: "None in stock" }];
  const feat = new Set(featured);
  const list = names.map((n, i) => ({ text: preferred && i === 0 ? `${n}\u00a0(preferred)` : n, featured: feat.has(n) }));
  const parts: BottlePart[] = [];
  list.slice(0, max).forEach((b, i) => {
    if (i) parts.push({ text: sep });
    parts.push(b.featured ? b : { text: b.text });
  });
  if (list.length > max) parts.push({ text: `${sep}+${list.length - max}\u00a0more` });
  return parts;
}

/**
 * Featured bottles move to the front of the line (after a preferred bottle, which stays first), so the
 * tag is never lost behind "+N more".
 */
export function featuredBottlesFirst(names: string[] | null, featured: string[], preferred: boolean): string[] | null {
  if (!names || !featured.length) return names;
  const head = preferred ? names.slice(0, 1) : [];
  const rest = preferred ? names.slice(1) : names;
  return [...head, ...rest.filter((n) => featured.includes(n)), ...rest.filter((n) => !featured.includes(n))];
}
export const PHONE_DOT = DOT;

/**
 * A recipe is only shown to guests while it is buildable (it appears in menu_mixed) and not locked by a
 * reserved bottle (migration 032; the locked page is loadLocked). So the cast (lib/cast.ts) never shows it either.
 */
export async function loadRecipe(id: string): Promise<Recipe | null> {
  if (!isUuid(id)) return null;
  const [recipe] = await query<Omit<Recipe, "lines">>(
    `SELECT r.id, r.name, r.description, r.rating,
            g.name AS glass, g.description AS glass_description, r.service_style,
            ag.name AS alt_glass, r.alt_service_style, r.glass_note, r.method_style, r.moods,
            (r.id IN (SELECT featured_recipe_ids())) AS featured
       FROM recipes r
       LEFT JOIN glassware g ON g.id = r.glass_id
       LEFT JOIN glassware ag ON ag.id = r.alt_glass_id
      WHERE r.id = $1 AND r.id IN (SELECT id FROM menu_mixed WHERE NOT reserved)`,
    [id],
  );
  if (!recipe) return null;
  // A line is "in" when a bottle of that ingredient is on the shelf (or it is always on hand).
  // When it isn't, a stocked stand-in is named: spec_substitutions(source → target) means the
  // source can stand in for the target. The shelf and the bottles come from spec_supply() (migration
  // 021), the same function available_spec_ids() and so menu_mixed are built on: hops 0 is the shelf.
  // Bottles listed: the ingredient's own when it is in; else the named stand-in's; else the nearest
  // stand-in chain that makes the recipe buildable.
  const rows = await query<Omit<RecipeLine, "bottles" | "featured"> & BottleFacts>(
    // Reserved bottles (migration 032) are left out of the supply: never listed, never counted as on the shelf
    // (an always-available ingredient stays on the shelf without its reserved bottle).
    `WITH supply AS MATERIALIZED (
       SELECT x.spec_id, x.source_spec_id, x.hops, CASE WHEN p.reserved THEN NULL ELSE x.product_id END AS product_id
         FROM spec_supply() x
         JOIN specs src ON src.id = x.source_spec_id
         LEFT JOIN products p ON p.id = x.product_id
        WHERE x.product_id IS NULL OR NOT p.reserved OR src.always_available),
     shelf AS (SELECT DISTINCT spec_id AS id FROM supply WHERE hops = 0),
     -- Alternates (migration 034): when the line's own ingredient isn't on the shelf, its first alternate that is
     -- (by position) leads: its name, its amount (or the line's), its note, its bottles.
     line AS (
       SELECT s.position, rl.id AS line_id, s.spec_id AS own_id, s.spec_name AS own_name, s.required,
              rl.amount, rl.unit, rl.note, lead.spec_id AS alt_id, lead.name AS alt_name,
              lead.amount AS alt_amount, lead.unit AS alt_unit, lead.note AS alt_note
         FROM recipe_line_status s
         JOIN recipe_lines rl ON rl.recipe_id = s.recipe_id AND rl.position = s.position
         LEFT JOIN LATERAL (
           SELECT a.spec_id, sp.canonical_name AS name, a.amount, a.unit, a.note
             FROM recipe_line_alternates a JOIN specs sp ON sp.id = a.spec_id
            WHERE a.recipe_line_id = rl.id
              AND s.spec_id NOT IN (SELECT id FROM shelf)
              AND a.spec_id IN (SELECT id FROM shelf)
            ORDER BY a.position
            LIMIT 1) lead ON true
        WHERE s.recipe_id = $1),
     base AS (
       SELECT l.position, l.line_id, COALESCE(l.alt_id, l.own_id) AS spec_id, COALESCE(l.alt_name, l.own_name) AS name, l.required,
              (COALESCE(l.alt_id, l.own_id) IN (SELECT id FROM shelf)) AS available,
              (CASE WHEN l.alt_id IS NULL OR (l.alt_amount IS NULL AND l.alt_unit IS NULL) THEN l.amount ELSE l.alt_amount END)::text AS amount,
              CASE WHEN l.alt_id IS NULL OR (l.alt_amount IS NULL AND l.alt_unit IS NULL) THEN l.unit ELSE l.alt_unit END AS unit,
              CASE WHEN l.alt_id IS NULL THEN l.note ELSE l.alt_note END AS note,
              sub.id AS use_instead_id, sub.canonical_name AS use_instead
         FROM line l
         LEFT JOIN LATERAL (
           SELECT src.id, src.canonical_name
             FROM spec_substitutions ss
             JOIN specs src ON src.id = ss.source_spec_id
            WHERE ss.target_spec_id = COALESCE(l.alt_id, l.own_id)
              AND ss.source_spec_id IN (SELECT id FROM shelf)
              AND COALESCE(l.alt_id, l.own_id) NOT IN (SELECT id FROM shelf)
            ORDER BY src.canonical_name
            LIMIT 1) sub ON true),
     src AS (
       SELECT b.*,
              CASE WHEN b.available THEN b.spec_id
                   WHEN b.use_instead_id IS NOT NULL THEN b.use_instead_id
                   ELSE (SELECT x.source_spec_id FROM supply x JOIN specs xs ON xs.id = x.source_spec_id
                          WHERE x.spec_id = b.spec_id AND x.hops > 0 AND x.product_id IS NOT NULL
                          ORDER BY x.hops, xs.canonical_name LIMIT 1)
              END AS from_spec
         FROM base b)
     SELECT s.position, s.name, s.required, s.available, s.amount, s.unit, s.note, s.use_instead,
            (s.from_spec = s.spec_id) AS own,
            COALESCE((SELECT f.kind FROM spec_families sf JOIN families f ON f.id = sf.family_id
                       WHERE sf.spec_id = COALESCE(s.from_spec, s.spec_id)
                       ORDER BY sf.is_primary DESC LIMIT 1), 'other') AS kind,
            EXISTS (SELECT 1 FROM product_specs ps WHERE ps.spec_id = s.spec_id) AS has_bottles,
            COALESCE((SELECT json_agg(json_build_object('name', p.display_name, 'brand', p.brand,
                                                        'short', CASE WHEN is_cellar_wine(p.id) THEN NULL ELSE p.short_name END,
                                                        'featured', p.id IN (SELECT featured_product_ids())))
                        FROM supply x JOIN products p ON p.id = x.product_id
                       WHERE x.spec_id = s.from_spec AND x.hops = 0), '[]'::json) AS stock,
            -- The other alternates a guest may use tonight: on the shelf (in stock, not reserved), not the leader.
            COALESCE((SELECT json_agg(json_build_object('name', sp.canonical_name, 'amount', a.amount::text, 'unit', a.unit, 'note', a.note) ORDER BY a.position)
                        FROM recipe_line_alternates a JOIN specs sp ON sp.id = a.spec_id
                       WHERE a.recipe_line_id = s.line_id AND a.spec_id <> s.spec_id
                         AND a.spec_id IN (SELECT id FROM shelf)), '[]'::json) AS alternates
       FROM src s
      ORDER BY s.position`,
    [id],
  );
  const lines: RecipeLine[] = rows.map(({ own, kind, has_bottles, stock, ...line }) => {
    // The name the guest reads next to the bottles: the ingredient, or the stand-in it says to use.
    const names = bottleNames(!line.available && line.use_instead ? line.use_instead : line.name, { own, kind, has_bottles, stock });
    const { bottles, preferred } = preferFirst(names, line.note);
    const shown = shownNames(bottles, stock);
    // Featured bottles (migration 030), by the name the guest reads. Required lines only: an optional line
    // never features the drink (featured_recipe_ids), so its bottle line stays plain too.
    const featured = line.required ? shownNames(stock.filter((b) => b.featured).map((b) => b.name.trim()), stock)!.filter((n) => shown?.includes(n)) : [];
    return { ...line, bottles: featuredBottlesFirst(shown, featured, preferred), preferred, featured };
  });
  return { ...recipe, lines };
}

/** Glass a Cellar wine is shown with: a sake cup for sake, a flute for sparkling, otherwise a wine glass. */
export const wineGlass = (sparkling: boolean, type: string | null) =>
  type?.trim().toLowerCase() === "sake" ? "sake cup" : sparkling ? "flute" : "wine glass";

export type Wine = {
  id: string;
  name: string;
  brand: string | null;
  origin: string | null;
  type: string | null;
  /** Grape (migration 031), or null. */
  grape: string | null;
  abv: string | null;
  description: string | null;
  serve_note: string | null;
  pairing_notes: string | null;
  sparkling: boolean;
  serves_chilled: boolean;
  serves_neat: boolean;
  serves_rocks: boolean;
  featured: boolean;
};

/** A Cellar wine's detail page: only while it's in the guest Cellar (menu_wines) and not reserved (migration 032). */
export async function loadWine(id: string): Promise<Wine | null> {
  if (!isUuid(id)) return null;
  const [wine] = await query<Wine>(
    `SELECT w.id, w.display_name AS name, p.brand, w.origin, w.grape, p.abv::text AS abv, w.description, w.serve_note, w.pairing_notes,
            (w.wine_effervescence = 'sparkling') AS sparkling, p.serves_chilled, p.serves_neat, p.serves_rocks,
            (w.id IN (SELECT featured_product_ids())) AS featured,
            (SELECT s.canonical_name FROM product_specs ps JOIN specs s ON s.id = ps.spec_id
              WHERE ps.product_id = w.id ORDER BY ps.is_primary DESC LIMIT 1) AS type
       FROM menu_wines w JOIN products p ON p.id = w.id
      WHERE w.id = $1 AND NOT w.reserved`,
    [id],
  );
  return wine ?? null;
}

export type Pour = {
  id: string;
  /** Short name (migration 023), or the full name when there is none. */
  name: string;
  full_name: string;
  /** Badge after the title ("Rye"): the bottle's badge label, else its primary ingredient; null: no badge. */
  spec: string | null;
  brand: string | null;
  origin: string | null;
  description: string | null;
  serve_note: string | null;
  rating: number | null;
  abv: string | null;
  serves_neat: boolean;
  serves_rocks: boolean;
  serves_chilled: boolean;
  featured: boolean;
};

/** A pour's detail page and cast: only while it's on Pours (menu_neat) and not reserved (migration 032). */
export async function loadPour(id: string): Promise<Pour | null> {
  if (!isUuid(id)) return null;
  const [pour] = await query<Pour & { label: string | null }>(
    `SELECT n.id, COALESCE(p.short_name, n.display_name) AS name, n.display_name AS full_name, n.brand, n.origin,
            n.description, n.serve_note, n.rating, n.abv::text AS abv, n.serves_neat, n.serves_rocks, n.serves_chilled,
            n.primary_spec_name AS spec, p.spec_label AS label, (n.id IN (SELECT featured_product_ids())) AS featured
       FROM menu_neat n JOIN products p ON p.id = n.id WHERE n.id = $1 AND NOT n.reserved`,
    [id],
  );
  if (!pour) return null;
  const { label, ...rest } = pour;
  return { ...rest, spec: badgeFor(pour.name, specLabel(pour.spec, label)) };
}

/** What a guest may see of a locked (reserved, migration 032) item: its name and the occasion. Nothing else. */
export type Locked = { name: string; note: string | null };

/**
 * The locked page behind a reserved pour, cocktail or Cellar wine: only while it is on the menu and locked.
 * Pours use the short name like the list. Null when it isn't on the menu or isn't locked.
 */
export async function loadLocked(kind: "pour" | "recipe" | "wine", id: string): Promise<Locked | null> {
  if (!isUuid(id)) return null;
  const sql = {
    pour: `SELECT COALESCE(p.short_name, n.display_name) AS name, n.reserved_note AS note FROM menu_neat n JOIN products p ON p.id = n.id WHERE n.id = $1 AND n.reserved`,
    recipe: `SELECT name, reserved_note AS note FROM menu_mixed WHERE id = $1 AND reserved`,
    wine: `SELECT display_name AS name, reserved_note AS note FROM menu_wines WHERE id = $1 AND reserved`,
  }[kind];
  const [row] = await query<Locked>(sql, [id]);
  return row ?? null;
}
