import { query } from "@/lib/db";

// Read models for the admin pages. Buildability always comes from the existing views
// (menu_mixed, recipe_line_status, spec_availability) so admin and guest menu agree.

export type Family = { id: string; slug: string; name: string; kind: string; allows_flavoring: boolean };
/** `wine`: the bottle belongs in the guest Cellar (is_cellar_wine, migration 020): the admin Wines view. */
export type StockItem = { id: string; name: string; in_stock: boolean; family: string; family_order: number; spec: string | null; wine: boolean };
export type Change = { id: number; at: string; summary: string; entity_id: string; action: string; before: { in_stock?: boolean } | null; after: { in_stock?: boolean } | null; undone: boolean };

export async function loadFamilies(): Promise<Family[]> {
  return query<Family>("SELECT id, slug, canonical_name AS name, kind, allows_flavoring FROM families ORDER BY sort_order, canonical_name");
}

export async function loadStock(): Promise<StockItem[]> {
  return query<StockItem>(
    `SELECT p.id, p.display_name AS name, p.in_stock,
            COALESCE(pf.canonical_name, sf.canonical_name, 'other') AS family,
            COALESCE(pf.sort_order, sf.sort_order, 999) AS family_order,
            s.canonical_name AS spec,
            is_cellar_wine(p.id) AS wine
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

export type RecipeStatus = { id: string; name: string; on_menu: boolean; missing: string[]; needs_wine: boolean };

/**
 * Every mixed recipe with its missing required ingredients (recipe_line_status + menu_mixed).
 * needs_wine: one of the missing ingredients is a Cellar wine (is_cellar_wine_spec), so buying
 * spirits can't unlock it and it stays off "To buy".
 */
export async function loadRecipeStatus(): Promise<RecipeStatus[]> {
  return query<RecipeStatus>(
    `SELECT r.id, r.name,
            r.id IN (SELECT id FROM menu_mixed) AS on_menu,
            COALESCE((SELECT array_agg(DISTINCT s.spec_name ORDER BY s.spec_name)
                        FROM recipe_line_status s
                       WHERE s.recipe_id = r.id AND s.required AND NOT s.available), '{}') AS missing,
            EXISTS (SELECT 1 FROM recipe_line_status s
                     WHERE s.recipe_id = r.id AND s.required AND NOT s.available AND is_cellar_wine_spec(s.spec_id)) AS needs_wine
       FROM recipes r
      WHERE r.section = 'mixed'
      ORDER BY lower(r.name)`,
  );
}

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
                 OR EXISTS (SELECT 1 FROM spec_substitutions ss JOIN recipe_lines rl ON rl.spec_id = ss.target_spec_id
                             WHERE ss.source_spec_id = ps.spec_id)))
        ORDER BY lower(p.display_name)`,
    ),
  ]);
  const canMake = status.filter((r) => r.on_menu);
  const blocked = status.filter((r) => !r.on_menu && r.missing.length > 0);
  // Wine outs are never shopping items: recipes waiting on a wine stay under "One away" but not "To buy".
  const l = shoppingList(blocked.filter((r) => !r.needs_wine));
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

/** "Add wine" preselect: the wine type most Cellar bottles use; ties go to the most recently added bottle's type (else any wine type). */
export async function loadDefaultWineSpec(): Promise<string | null> {
  const [row] = await query<{ id: string }>(
    `SELECT id FROM (
       SELECT ps.spec_id AS id, count(*) AS n, max(p.created_at) AS latest, 0 AS pass
         FROM product_specs ps JOIN products p ON p.id = ps.product_id
        WHERE ps.is_primary AND is_cellar_wine(ps.product_id) GROUP BY ps.spec_id
       UNION ALL
       SELECT s.id, 0, NULL, 1 FROM specs s WHERE is_cellar_wine_spec(s.id)
     ) c ORDER BY pass, n DESC, latest DESC NULLS LAST, id LIMIT 1`,
  );
  return row?.id ?? null;
}

export type ProductRow = {
  id: string; display_name: string; packaged_name: string; brand: string | null; description: string | null;
  origin: string | null; serve_note: string | null; abv: string | null; upc: string | null; family_id: string | null;
  in_stock: boolean; mix_only: boolean; serves_neat: boolean; serves_rocks: boolean; serves_chilled: boolean;
  fortified: boolean; wine_color: string; wine_effervescence: string; spec_id: string | null; other_spec_ids: string[];
};

export async function loadProduct(id: string): Promise<ProductRow | null> {
  const [p] = await query<ProductRow>(
    `SELECT p.id, p.display_name, p.packaged_name, p.brand, p.description, p.origin, p.serve_note, p.abv::text AS abv,
            p.upc, p.family_id, p.in_stock, p.mix_only, p.serves_neat, p.serves_rocks, p.serves_chilled,
            p.fortified, p.wine_color, p.wine_effervescence,
            (SELECT ps.spec_id FROM product_specs ps WHERE ps.product_id = p.id ORDER BY ps.is_primary DESC LIMIT 1) AS spec_id,
            COALESCE((SELECT array_agg(ps.spec_id) FROM product_specs ps WHERE ps.product_id = p.id AND NOT ps.is_primary), '{}') AS other_spec_ids
       FROM products p WHERE p.id = $1`,
    [id],
  );
  return p ?? null;
}

export type Glass = { id: number; name: string };
export const loadGlassware = () => query<Glass>("SELECT id, name FROM glassware ORDER BY id");

export type RecipeLineRow = { spec_id: string; position: number; required: boolean; amount: string | null; unit: string | null; role: string | null; note: string | null };
export type RecipeRow = {
  id: string; name: string; description: string | null; section: string; glass_id: number | null; service_style: string | null;
  alt_glass_id: number | null; alt_service_style: string | null; glass_note: string | null; method_style: string | null; lines: RecipeLineRow[];
};

export async function loadRecipeRow(id: string): Promise<RecipeRow | null> {
  const [r] = await query<Omit<RecipeRow, "lines">>(
    `SELECT id, name, description, section, glass_id, service_style, alt_glass_id, alt_service_style, glass_note, method_style
       FROM recipes WHERE id = $1`,
    [id],
  );
  if (!r) return null;
  const lines = await query<RecipeLineRow>(
    `SELECT spec_id, position, required, amount::text AS amount, unit, role, note
       FROM recipe_lines WHERE recipe_id = $1 ORDER BY position`,
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
