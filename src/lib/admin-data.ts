import { query } from "@/lib/db";

// Read models for the admin pages. Buildability always comes from the existing views
// (menu_mixed, recipe_line_status, spec_availability) so admin and guest menu agree.

export type Family = { id: string; slug: string; name: string; kind: string; allows_flavoring: boolean };
/** `wine`: the bottle belongs in the guest Cellar (is_cellar_wine, migration 020): the admin Wines view. */
/** `label`: the bottle's own badge label (migration 023), shown instead of the type when set. */
/** `origin`: the bottle's Origin field, matched by the Stock search ("michigan", "traverse city"); not shown. */
/** `reserved`, `reserved_note`: Reserved (migration 032); the Stock row shows the key and the note under the name. */
export type StockItem = { id: string; name: string; in_stock: boolean; decanting: boolean; featured: boolean; reserved: boolean; reserved_note: string | null; family: string; family_order: number; spec: string | null; label: string | null; wine: boolean; origin: string | null };
export type Change = { id: number; at: string; summary: string; entity_id: string; action: string; before: { in_stock?: boolean } | null; after: { in_stock?: boolean } | null; undone: boolean };

export async function loadFamilies(): Promise<Family[]> {
  return query<Family>("SELECT id, slug, canonical_name AS name, kind, allows_flavoring FROM families ORDER BY sort_order, canonical_name");
}

export async function loadStock(): Promise<StockItem[]> {
  return query<StockItem>(
    `SELECT p.id, p.display_name AS name, p.in_stock, p.decanting, p.featured, p.reserved, p.reserved_note,
            COALESCE(pf.canonical_name, sf.canonical_name, 'other') AS family,
            COALESCE(pf.sort_order, sf.sort_order, 999) AS family_order,
            s.canonical_name AS spec, p.spec_label AS label,
            is_cellar_wine(p.id) AS wine, p.origin
       FROM products p
       LEFT JOIN families pf ON pf.id = p.family_id
       LEFT JOIN LATERAL (SELECT ps.spec_id FROM product_specs ps WHERE ps.product_id = p.id
                          ORDER BY ps.is_primary DESC LIMIT 1) prim ON true
       LEFT JOIN specs s ON s.id = prim.spec_id
       LEFT JOIN spec_families sfl ON sfl.spec_id = s.id AND sfl.is_primary
       LEFT JOIN families sf ON sf.id = sfl.family_id
      ORDER BY family_order, family, lower(p.display_name)`,
  );
}

export async function loadRecentChanges(limit = 8): Promise<Change[]> {
  return query<Change>(
    `SELECT id, at, summary, entity_id, action, before, after, undone_by IS NOT NULL AS undone
       FROM change_log WHERE at > now() - interval '7 days'
      ORDER BY at DESC LIMIT $1`,
    [limit],
  );
}

export type RecipeStatus = { id: string; name: string; on_menu: boolean; missing: string[]; needs_wine: boolean; missing_wines: string[] };

/**
 * Every mixed recipe with its missing required ingredients (recipe_line_status + menu_mixed).
 * needs_wine / missing_wines: which missing ingredients are Cellar wines (is_cellar_wine_spec);
 * see WINES_IN_TO_BUY for what "To buy" does with them.
 */
export async function loadRecipeStatus(): Promise<RecipeStatus[]> {
  // A missing line with alternates (migration 034) is named with them, "bourbon / cognac": any one would do.
  return query<RecipeStatus>(
    `WITH miss AS (
       SELECT s.recipe_id, is_cellar_wine_spec(s.spec_id) AS wine,
              s.spec_name || COALESCE((SELECT ' / ' || string_agg(sp.canonical_name, ' / ' ORDER BY a.position)
                                         FROM recipe_lines rl
                                         JOIN recipe_line_alternates a ON a.recipe_line_id = rl.id
                                         JOIN specs sp ON sp.id = a.spec_id
                                        WHERE rl.recipe_id = s.recipe_id AND rl.position = s.position), '') AS label
         FROM recipe_line_status s
        WHERE s.required AND NOT s.available)
     SELECT r.id, r.name,
            r.id IN (SELECT id FROM menu_mixed) AS on_menu,
            COALESCE((SELECT array_agg(DISTINCT m.label ORDER BY m.label) FROM miss m WHERE m.recipe_id = r.id), '{}') AS missing,
            EXISTS (SELECT 1 FROM miss m WHERE m.recipe_id = r.id AND m.wine) AS needs_wine,
            COALESCE((SELECT array_agg(DISTINCT m.label) FROM miss m WHERE m.recipe_id = r.id AND m.wine), '{}') AS missing_wines
       FROM recipes r
      WHERE r.section = 'mixed'
      ORDER BY lower(r.name)`,
  );
}

/**
 * WINES_IN_TO_BUY: the one switch for how wine outs reach "To buy".
 *   false (default, Brian): a wine that's out is never a shopping item. Recipes waiting on a wine
 *         still show under "One away", just not under "To buy".
 *   true  (Rachel): a wine shows in "To buy" only when a recipe is waiting on it, tagged "(wine)".
 * Either way the "Out only" chip and the "N out" counts on Stock stay spirits-only.
 */
export const WINES_IN_TO_BUY = false;

export type Glance = {
  canMake: RecipeStatus[];
  oneAway: RecipeStatus[];
  buy: BuyEntry[];
  buyItems: number;
  unusedOut: { id: string; name: string }[];
};

export async function loadGlance(): Promise<Glance> {
  const [status, unusedOut] = await Promise.all([
    loadRecipeStatus(),
    query<{ id: string; name: string }>(
      `SELECT p.id, p.display_name AS name FROM products p
        WHERE NOT p.in_stock
          AND NOT is_cellar_wine(p.id)
          AND NOT EXISTS (
            SELECT 1 FROM product_specs ps
             WHERE ps.product_id = p.id
               AND (EXISTS (SELECT 1 FROM recipe_lines rl WHERE rl.spec_id = ps.spec_id)
                 OR EXISTS (SELECT 1 FROM recipe_line_alternates a WHERE a.spec_id = ps.spec_id)
                 OR EXISTS (SELECT 1 FROM spec_substitutions ss JOIN recipe_lines rl ON rl.spec_id = ss.target_spec_id
                             WHERE ss.source_spec_id = ps.spec_id)))
        ORDER BY lower(p.display_name)`,
    ),
  ]);
  const canMake = status.filter((r) => r.on_menu);
  const blocked = status.filter((r) => !r.on_menu && r.missing.length > 0);
  const l = shoppingList(WINES_IN_TO_BUY
    ? blocked.map((r) => ({ ...r, missing: r.missing.map((m) => (r.missing_wines.includes(m) ? `${m} (wine)` : m)) }))
    : blocked.filter((r) => !r.needs_wine));
  return { canMake, oneAway: blocked.filter((r) => r.missing.length === 1), buy: l.entries, buyItems: l.items, unusedOut };
}

/**
 * To buy: candidate purchases are the exact missing sets of blocked recipes (up to 3 items).
 * Singles come first, ranked by recipes unlocked. Then combos, listing only the items that are not
 * already on the list as singles ("Maple syrup (with aromatic bitters)"), and only the recipes the
 * singles don't already unlock. So no item is listed twice, and `items` counts distinct things to buy.
 */
export type BuyEntry = { specs: string[]; with: string[]; recipes: string[] };
export function shoppingList(blocked: { name: string; missing: string[] }[]): { entries: BuyEntry[]; items: number } {
  const sets = new Map<string, string[]>();
  for (const r of blocked) if (r.missing.length <= 3) sets.set(r.missing.join("|"), r.missing);
  const unlocks = (specs: string[]) => blocked.filter((r) => r.missing.every((m) => specs.includes(m))).map((r) => r.name);
  const byName = (a: BuyEntry, b: BuyEntry) => b.recipes.length - a.recipes.length || a.specs.length - b.specs.length || a.specs[0].localeCompare(b.specs[0]);
  const singles: BuyEntry[] = [...sets.values()].filter((x) => x.length === 1).map((x) => ({ specs: x, with: [], recipes: unlocks(x) })).sort(byName);
  const singleSet = new Set(singles.map((x) => x.specs[0]));
  const covered = new Set(singles.flatMap((x) => x.recipes));
  const combos: BuyEntry[] = [];
  for (const x of [...sets.values()].filter((x) => x.length > 1)) {
    const recipes = unlocks(x).filter((r) => !covered.has(r));
    if (!recipes.length) continue;
    const fresh = x.filter((m) => !singleSet.has(m));
    combos.push(fresh.length ? { specs: fresh, with: x.filter((m) => singleSet.has(m)), recipes } : { specs: x, with: [], recipes });
  }
  combos.sort(byName);
  const items = new Set([...singles, ...combos].flatMap((e) => e.specs)).size;
  return { entries: [...singles, ...combos], items };
}

export type SpecOption = { id: string; name: string; family: string | null; family_id: string | null; available: boolean; in_stock: boolean; ingredient_only: boolean; aliases: string[] };

/** All ingredients (specs) for pickers: availability from spec_availability; in_stock = a bottle is on the shelf. */
export async function loadSpecOptions(): Promise<SpecOption[]> {
  return query<SpecOption>(
    `SELECT s.id, s.canonical_name AS name, f.canonical_name AS family, f.id AS family_id,
            sa.available,
            (s.always_available OR EXISTS (SELECT 1 FROM product_specs ps JOIN products p ON p.id = ps.product_id
                                            WHERE ps.spec_id = s.id AND p.in_stock)) AS in_stock,
            s.ingredient_only,
            COALESCE((SELECT array_agg(a.alias ORDER BY a.alias) FROM spec_aliases a WHERE a.spec_id = s.id), '{}') AS aliases
       FROM specs s
       JOIN spec_availability sa ON sa.id = s.id
       LEFT JOIN spec_families sf ON sf.spec_id = s.id AND sf.is_primary
       LEFT JOIN families f ON f.id = sf.family_id
      ORDER BY lower(s.canonical_name)`,
  );
}

/**
 * "Add wine" preselect: a general type, never a specific one like sangria. A generic "wine" type if one
 * exists, else plain "red wine", else the first Cellar wine type alphabetically. No type is created here.
 */
export async function loadDefaultWineSpec(): Promise<string | null> {
  const [row] = await query<{ id: string }>(
    `SELECT id FROM specs s WHERE is_cellar_wine_spec(s.id)
      ORDER BY CASE lower(s.canonical_name) WHEN 'wine' THEN 0 WHEN 'red wine' THEN 1 ELSE 2 END, lower(s.canonical_name)
      LIMIT 1`,
  );
  return row?.id ?? null;
}

export type ProductRow = {
  id: string; display_name: string; short_name: string | null; spec_label: string | null; packaged_name: string; brand: string | null; description: string | null;
  origin: string | null; serve_note: string | null; abv: string | null; upc: string | null; family_id: string | null;
  in_stock: boolean; featured: boolean; reserved: boolean; reserved_note: string | null; mix_only: boolean; serves_neat: boolean; serves_rocks: boolean; serves_chilled: boolean;
  fortified: boolean; wine_color: string; wine_effervescence: string; grape: string | null; spec_id: string | null; other_spec_ids: string[];
  /** Mood tags (migration 033), up to 3, in MOODS order (lib/moods.ts). */
  moods: string[];
};

export async function loadProduct(id: string): Promise<ProductRow | null> {
  const [p] = await query<ProductRow>(
    `SELECT p.id, p.display_name, p.short_name, p.spec_label, p.packaged_name, p.brand, p.description, p.origin, p.serve_note, p.abv::text AS abv,
            p.upc, p.family_id, p.in_stock, p.featured, p.reserved, p.reserved_note, p.mix_only, p.serves_neat, p.serves_rocks, p.serves_chilled,
            p.fortified, p.wine_color, p.wine_effervescence, p.grape, p.moods,
            (SELECT ps.spec_id FROM product_specs ps WHERE ps.product_id = p.id ORDER BY ps.is_primary DESC LIMIT 1) AS spec_id,
            COALESCE((SELECT array_agg(ps.spec_id) FROM product_specs ps WHERE ps.product_id = p.id AND NOT ps.is_primary), '{}') AS other_spec_ids
       FROM products p WHERE p.id = $1`,
    [id],
  );
  return p ?? null;
}

/** Grapes already on a bottle (migration 031), for the wine form's suggestions. Free text; nothing is created here. */
export const loadGrapes = () =>
  query<{ grape: string }>("SELECT DISTINCT grape FROM products WHERE grape IS NOT NULL ORDER BY grape").then((rows) => rows.map((r) => r.grape));

export type Glass = { id: number; name: string };
export const loadGlassware = () => query<Glass>("SELECT id, name FROM glassware ORDER BY id");

export type RecipeLineRow = {
  spec_id: string; position: number; required: boolean; amount: string | null; unit: string | null; role: string | null; note: string | null;
  /** Alternates (migration 034) in priority order; amount and unit both null = the line's. */
  alternates: { spec_id: string; amount: string | null; unit: string | null; note: string | null }[];
};
export type RecipeRow = {
  id: string; name: string; description: string | null; section: string; glass_id: number | null; service_style: string | null;
  alt_glass_id: number | null; alt_service_style: string | null; glass_note: string | null; method_style: string | null;
  /** Mood tags (migration 033), up to 3. */
  moods: string[]; lines: RecipeLineRow[];
};

export async function loadRecipeRow(id: string): Promise<RecipeRow | null> {
  const [r] = await query<Omit<RecipeRow, "lines">>(
    `SELECT id, name, description, section, glass_id, service_style, alt_glass_id, alt_service_style, glass_note, method_style, moods
       FROM recipes WHERE id = $1`,
    [id],
  );
  if (!r) return null;
  const lines = await query<RecipeLineRow>(
    `SELECT l.spec_id, l.position, l.required, l.amount::text AS amount, l.unit, l.role, l.note,
            COALESCE((SELECT json_agg(json_build_object('spec_id', a.spec_id, 'amount', a.amount::text, 'unit', a.unit, 'note', a.note) ORDER BY a.position)
                        FROM recipe_line_alternates a WHERE a.recipe_line_id = l.id), '[]'::json) AS alternates
       FROM recipe_lines l WHERE l.recipe_id = $1 ORDER BY l.position`,
    [id],
  );
  return { ...r, lines };
}

export type Sub = { source_id: string; target_id: string; source: string; target: string; note: string | null; two_way: boolean };

/** Substitutions, with two-way pairs folded into one row (source < target by name). */
export async function loadSubstitutions(): Promise<Sub[]> {
  const rows = await query<Sub>(
    `SELECT ss.source_spec_id AS source_id, ss.target_spec_id AS target_id, a.canonical_name AS source,
            b.canonical_name AS target, ss.note,
            EXISTS (SELECT 1 FROM spec_substitutions r WHERE r.source_spec_id = ss.target_spec_id
                     AND r.target_spec_id = ss.source_spec_id) AS two_way
       FROM spec_substitutions ss
       JOIN specs a ON a.id = ss.source_spec_id
       JOIN specs b ON b.id = ss.target_spec_id
      ORDER BY lower(b.canonical_name), lower(a.canonical_name)`,
  );
  return rows.filter((r) => !r.two_way || r.source.localeCompare(r.target) < 0);
}

export type SpecRow = { id: string; name: string; description: string | null; family_id: string | null; ingredient_only: boolean; always_available: boolean; aliases: string[]; bottles: string[]; recipes: string[] };

export async function loadSpec(id: string): Promise<SpecRow | null> {
  const [s] = await query<SpecRow>(
    `SELECT s.id, s.canonical_name AS name, s.description, sf.family_id, s.ingredient_only, s.always_available,
            COALESCE((SELECT array_agg(a.alias ORDER BY a.alias) FROM spec_aliases a WHERE a.spec_id = s.id), '{}') AS aliases,
            COALESCE((SELECT array_agg(p.display_name ORDER BY p.display_name) FROM product_specs ps JOIN products p ON p.id = ps.product_id WHERE ps.spec_id = s.id), '{}') AS bottles,
            COALESCE((SELECT array_agg(DISTINCT r.name) FROM recipe_lines rl JOIN recipes r ON r.id = rl.recipe_id WHERE rl.spec_id = s.id), '{}') AS recipes
       FROM specs s
       LEFT JOIN spec_families sf ON sf.spec_id = s.id AND sf.is_primary
      WHERE s.id = $1`,
    [id],
  );
  return s ?? null;
}

/** How many products are Featured right now: flagged AND in stock (what guests see). Soft warning above 3. */
export const countFeatured = () =>
  query<{ n: string }>("SELECT count(*)::text AS n FROM featured_product_ids()").then(([r]) => Number(r?.n ?? 0));
