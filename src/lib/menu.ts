import { isUuid, query } from "@/lib/db";

// Section order is fixed everywhere (TV and phone): Pours, Cocktails, Cellar.
export const SECTIONS = [
  { id: "pours", label: "Pours" },
  { id: "cocktails", label: "Cocktails" },
  { id: "cellar", label: "Cellar" },
] as const;
export type SectionId = (typeof SECTIONS)[number]["id"];

/** `detail` is the cocktail ingredient line ("Rye · sweet vermouth · cherry liqueur"); other sections have none. */
export type MenuItem = { id: string; name: string; glass: string | null; href: string | null; detail?: string | null };
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
    pours: pours.map((p) => ({ id: p.id, name: p.name, glass: "rocks", href: `/pour/${p.id}`, detail: pourLine(p) })).sort(byName),
    cocktails: cocktails.map((c) => ({ ...c, href: `/recipe/${c.id}`, detail: lines.get(c.id) ?? null })).sort(byName),
    cellar: cellar.map((w) => ({ id: w.id, name: w.name, glass: "wine glass", href: null, detail: wineLine(w) })).sort(byName),
  };
}

/**
 * Ingredient line for each cocktail on the menu: required lines in recipe order, no amounts,
 * leaving out garnishes (role "garnish"), ice and water (the "staple" family) and optional lines.
 * A line that is out tonight names its stocked stand-in, with the same shelf rule as the recipe
 * page (loadRecipe): a stand-in only counts when a bottle of it is on the shelf.
 */
async function loadCocktailLines(): Promise<Map<string, string>> {
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
  return new Map(rows.map((r) => [r.recipe_id, ingredientLine(r.names)]));
}

/** "Rye · sweet vermouth · cherry liqueur": de-duplicated, only the first word capitalized. */
export function ingredientLine(names: string[]): string {
  const text = [...new Set(names)].join(" · ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const first = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const clean = (t: string | null) => (t ?? "").trim();

/** Pours: "London · 40% ABV". One of the two if the other is missing; else the type ("Rye"); else nothing. */
export function pourLine(p: { origin: string | null; abv: string | null; type: string | null }): string | null {
  const abv = p.abv && Number(p.abv) > 0 ? `${Number(p.abv)}% ABV` : "";
  const parts = [clean(p.origin), abv].filter(Boolean);
  if (parts.length) return first(parts.join(" · "));
  return clean(p.type) ? first(clean(p.type)) : null;
}

/**
 * Cellar: region, then the grape or style (the bottle's primary ingredient) unless the name already
 * says it ("Hakutsuru Sake" → just "Japan"). No region: the style alone ("Sake"). Nothing: no line.
 * Regions come only from the bottle's origin field; nothing is guessed.
 */
export function wineLine(w: { name: string; origin: string | null; type: string | null }): string | null {
  const region = clean(w.origin);
  const type = clean(w.type);
  const redundant = !!type && w.name.toLowerCase().includes(type.toLowerCase());
  if (region) return first(type && !redundant ? `${region} · ${type}` : region);
  return type ? first(type) : null;
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
