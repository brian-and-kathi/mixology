import { isUuid, query } from "@/lib/db";

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
 * the TV measures and shows the first one that fits on one line (see TvBoard FitLine).
 */
export type Sub = { detail: string; fit: string[] };
export type MenuItem = { id: string; name: string; glass: string | null; href: string | null; detail?: string | null; fit?: string[] };
export type Menu = Record<SectionId, MenuItem[]>;

const byName = (a: MenuItem, b: MenuItem) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base" });

/**
 * The three guest sections come straight from the existing database views:
 * menu_neat (Pours), menu_mixed (buildable Cocktails), menu_wines (Cellar).
 */
export async function loadMenu(): Promise<Menu> {
  const [pours, cocktails, cellar, lines] = await Promise.all([
    query<{ id: string; name: string; origin: string | null; abv: string | null; type: string | null }>(
      "SELECT id, display_name AS name, origin, abv::text AS abv, primary_spec_name AS type FROM menu_neat",
    ),
    query<{ id: string; name: string; glass: string | null }>(
      `SELECT m.id, m.name, g.name AS glass
         FROM menu_mixed m
         JOIN recipes r ON r.id = m.id
         LEFT JOIN glassware g ON g.id = r.glass_id`,
    ),
    query<{ id: string; name: string; origin: string | null; type: string | null }>(
      `SELECT w.id, w.display_name AS name, w.origin,
              (SELECT s.canonical_name FROM product_specs ps JOIN specs s ON s.id = ps.spec_id
                WHERE ps.product_id = w.id AND ps.is_primary) AS type
         FROM menu_wines w`,
    ),
    loadCocktailLines(),
  ]);
  return {
    // Pours have no glass_id in the schema; they are shown with a rocks glass.
    pours: pours.map((p) => ({ id: p.id, name: p.name, glass: "rocks", href: `/pour/${p.id}`, ...pourLine(p) })).sort(byName),
    cocktails: cocktails.map((c) => ({ ...c, href: `/recipe/${c.id}`, ...(lines.get(c.id) ?? {}) })).sort(byName),
    cellar: cellar.map((w) => ({ id: w.id, name: w.name, glass: "wine glass", href: null, ...wineLine(w) })).sort(byName),
  };
}

/**
 * Ingredient line for each cocktail on the menu: required lines in recipe order, no amounts,
 * leaving out garnishes (role "garnish"), ice and water (the "staple" family) and optional lines.
 * A line that is out tonight names its stocked stand-in, with the same shelf rule as the recipe
 * page (loadRecipe): a stand-in only counts when a bottle of it is on the shelf.
 */
async function loadCocktailLines(): Promise<Map<string, Sub>> {
  const rows = await query<{ recipe_id: string; names: string[] }>(
    `WITH shelf AS (
       SELECT sp.id FROM specs sp
        WHERE sp.always_available
           OR EXISTS (SELECT 1 FROM product_specs ps JOIN products p ON p.id = ps.product_id
                       WHERE ps.spec_id = sp.id AND p.in_stock)),
     staple AS (
       SELECT sf.spec_id FROM spec_families sf JOIN families f ON f.id = sf.family_id WHERE f.slug = 'staple')
     SELECT s.recipe_id,
            array_agg(
              CASE WHEN s.spec_id IN (SELECT id FROM shelf) THEN s.spec_name
                   ELSE COALESCE((SELECT src.canonical_name
                                    FROM spec_substitutions ss
                                    JOIN specs src ON src.id = ss.source_spec_id
                                   WHERE ss.target_spec_id = s.spec_id
                                     AND ss.source_spec_id IN (SELECT id FROM shelf)
                                   ORDER BY src.canonical_name
                                   LIMIT 1), s.spec_name)
              END ORDER BY s.position) AS names
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
 * TV candidates cut at whole items with a trailing "· …" ("Rye · sweet vermouth · …"); as a last
 * resort the first item loses whole words ("Grand …"). Never mid-word.
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
 * TV: the ABV always stays whole; the region shortens to its state or country ("Michigan · 45% ABV")
 * and is dropped entirely if that still doesn't fit.
 */
export function pourLine(p: { origin: string | null; abv: string | null; type: string | null }): Partial<Sub> {
  const abv = p.abv && Number(p.abv) > 0 ? `${Number(p.abv)}% ABV` : "";
  const region = clean(p.origin);
  const short = region.split(",").map((x) => x.trim()).filter(Boolean).pop() ?? "";
  if (!region && !abv) {
    const type = clean(p.type);
    return type ? { detail: first(type), fit: [first(type)] } : {};
  }
  const detail = first([keepPlace(region), keepAbv(abv)].filter(Boolean).join(DOT));
  const fit = abv ? [short ? `${short} · ${abv}` : abv, abv] : [short];
  return { detail, fit: [...new Set(fit.map(first))] };
}

/**
 * Cellar: region, then the grape or style (the bottle's primary ingredient) unless the name already
 * says it ("Hakutsuru Sake" → just "Japan"). No region: the style alone ("Sake"). Nothing: no line.
 * Regions come only from the bottle's origin field; nothing is guessed.
 */
export function wineLine(w: { name: string; origin: string | null; type: string | null }): Partial<Sub> {
  const region = clean(w.origin);
  const type = clean(w.type);
  const redundant = !!type && w.name.toLowerCase().includes(type.toLowerCase());
  const items = region ? (type && !redundant ? [region, type] : [region]) : type ? [type] : [];
  const sub = listSub(items);
  if (!sub) return {};
  // Same TV candidates; only the phone line keeps the place name's words together.
  return region ? { ...sub, detail: first([keepPlace(region), ...items.slice(1)].join(DOT)) } : sub;
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
  lines: RecipeLine[];
};

/** A recipe is only shown to guests while it is buildable (it appears in menu_mixed). */
export async function loadRecipe(id: string): Promise<Recipe | null> {
  if (!isUuid(id)) return null;
  const [recipe] = await query<Omit<Recipe, "lines">>(
    `SELECT r.id, r.name, r.description, r.rating,
            g.name AS glass, g.description AS glass_description, r.service_style,
            ag.name AS alt_glass, r.alt_service_style, r.glass_note, r.method_style
       FROM recipes r
       LEFT JOIN glassware g ON g.id = r.glass_id
       LEFT JOIN glassware ag ON ag.id = r.alt_glass_id
      WHERE r.id = $1 AND r.id IN (SELECT id FROM menu_mixed)`,
    [id],
  );
  if (!recipe) return null;
  // A line is "in" when a bottle of that ingredient is on the shelf (or it is always on hand).
  // When it isn't, a stocked stand-in is named: spec_substitutions(source → target) means the
  // source can stand in for the target (the same direction available_spec_ids() uses).
  const lines = await query<RecipeLine>(
    `WITH shelf AS (
       SELECT sp.id FROM specs sp
        WHERE sp.always_available
           OR EXISTS (SELECT 1 FROM product_specs ps JOIN products p ON p.id = ps.product_id
                       WHERE ps.spec_id = sp.id AND p.in_stock))
     SELECT s.position, s.spec_name AS name, s.required,
            (s.spec_id IN (SELECT id FROM shelf)) AS available,
            rl.amount::text AS amount, rl.unit, rl.note,
            (SELECT src.canonical_name
               FROM spec_substitutions ss
               JOIN specs src ON src.id = ss.source_spec_id
              WHERE ss.target_spec_id = s.spec_id
                AND ss.source_spec_id IN (SELECT id FROM shelf)
                AND s.spec_id NOT IN (SELECT id FROM shelf)
              ORDER BY src.canonical_name
              LIMIT 1) AS use_instead
       FROM recipe_line_status s
       JOIN recipe_lines rl ON rl.recipe_id = s.recipe_id AND rl.position = s.position
      WHERE s.recipe_id = $1
      ORDER BY s.position`,
    [id],
  );
  return { ...recipe, lines };
}

export type Pour = {
  id: string;
  name: string;
  brand: string | null;
  origin: string | null;
  description: string | null;
  serve_note: string | null;
  rating: number | null;
  abv: string | null;
  serves_neat: boolean;
  serves_rocks: boolean;
  serves_chilled: boolean;
};

export async function loadPour(id: string): Promise<Pour | null> {
  if (!isUuid(id)) return null;
  const [pour] = await query<Pour>(
    `SELECT id, display_name AS name, brand, origin, description, serve_note, rating,
            abv::text AS abv, serves_neat, serves_rocks, serves_chilled
       FROM menu_neat WHERE id = $1`,
    [id],
  );
  return pour ?? null;
}
