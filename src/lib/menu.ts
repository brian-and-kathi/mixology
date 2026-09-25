import { isUuid, query } from "@/lib/db";

// Section order is fixed everywhere (TV and phone): Pours, Cocktails, Cellar.
export const SECTIONS = [
  { id: "pours", label: "Pours" },
  { id: "cocktails", label: "Cocktails" },
  { id: "cellar", label: "Cellar" },
] as const;
export type SectionId = (typeof SECTIONS)[number]["id"];

export type MenuItem = { id: string; name: string; glass: string | null; href: string | null };
export type Menu = Record<SectionId, MenuItem[]>;

const byName = (a: MenuItem, b: MenuItem) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base" });

/**
 * The three guest sections come straight from the existing database views:
 * menu_neat (Pours), menu_mixed (buildable Cocktails), menu_wines (Cellar).
 */
export async function loadMenu(): Promise<Menu> {
  const [pours, cocktails, cellar] = await Promise.all([
    query<{ id: string; name: string }>("SELECT id, display_name AS name FROM menu_neat"),
    query<{ id: string; name: string; glass: string | null }>(
      `SELECT m.id, m.name, g.name AS glass
         FROM menu_mixed m
         JOIN recipes r ON r.id = m.id
         LEFT JOIN glassware g ON g.id = r.glass_id`,
    ),
    query<{ id: string; name: string }>("SELECT id, display_name AS name FROM menu_wines"),
  ]);
  return {
    // Pours have no glass_id in the schema; they are shown with a rocks glass.
    pours: pours.map((p) => ({ ...p, glass: "rocks", href: `/pour/${p.id}` })).sort(byName),
    cocktails: cocktails.map((c) => ({ ...c, href: `/recipe/${c.id}` })).sort(byName),
    cellar: cellar.map((w) => ({ ...w, glass: "wine glass", href: null })).sort(byName),
  };
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
  lines: RecipeLine[];
};

/** A recipe is only shown to guests while it is buildable (it appears in menu_mixed). */
export async function loadRecipe(id: string): Promise<Recipe | null> {
  if (!isUuid(id)) return null;
  const [recipe] = await query<Omit<Recipe, "lines">>(
    `SELECT r.id, r.name, r.description, r.rating,
            g.name AS glass, g.description AS glass_description, r.service_style,
            ag.name AS alt_glass, r.alt_service_style, r.glass_note
       FROM recipes r
       LEFT JOIN glassware g ON g.id = r.glass_id
       LEFT JOIN glassware ag ON ag.id = r.alt_glass_id
      WHERE r.id = $1 AND r.id IN (SELECT id FROM menu_mixed)`,
    [id],
  );
  if (!recipe) return null;
  // recipe_line_status says whether each line is in stock; a stocked substitute is offered for out lines.
  const lines = await query<RecipeLine>(
    `SELECT s.position, s.spec_name AS name, s.required, s.available,
            rl.amount::text AS amount, rl.unit, rl.note,
            (SELECT t.canonical_name
               FROM spec_substitutions ss
               JOIN spec_availability sa ON sa.id = ss.target_spec_id AND sa.available
               JOIN specs t ON t.id = ss.target_spec_id
              WHERE ss.source_spec_id = s.spec_id AND NOT s.available
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
