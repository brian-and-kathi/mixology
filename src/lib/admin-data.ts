import { query } from "@/lib/db";

// Read models for the admin pages. Buildability always comes from the existing views
// (menu_mixed, recipe_line_status, spec_availability) so admin and guest menu agree.

export type Family = { id: string; name: string; kind: string; allows_flavoring: boolean };
export type StockItem = { id: string; name: string; in_stock: boolean; family: string; family_order: number; spec: string | null };
export type Change = { id: number; at: string; summary: string; entity_id: string; action: string; before: { in_stock?: boolean } | null; after: { in_stock?: boolean } | null; undone: boolean };

export async function loadFamilies(): Promise<Family[]> {
  return query<Family>("SELECT id, canonical_name AS name, kind, allows_flavoring FROM families ORDER BY sort_order, canonical_name");
}

export async function loadStock(): Promise<StockItem[]> {
  return query<StockItem>(
    `SELECT p.id, p.display_name AS name, p.in_stock,
            COALESCE(pf.canonical_name, sf.canonical_name, 'other') AS family,
            COALESCE(pf.sort_order, sf.sort_order, 999) AS family_order,
            s.canonical_name AS spec
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

export type RecipeStatus = { id: string; name: string; on_menu: boolean; missing: string[] };

/** Every mixed recipe with its missing required ingredients (recipe_line_status + menu_mixed). */
export async function loadRecipeStatus(): Promise<RecipeStatus[]> {
  return query<RecipeStatus>(
    `SELECT r.id, r.name,
            r.id IN (SELECT id FROM menu_mixed) AS on_menu,
            COALESCE((SELECT array_agg(DISTINCT s.spec_name ORDER BY s.spec_name)
                        FROM recipe_line_status s
                       WHERE s.recipe_id = r.id AND s.required AND NOT s.available), '{}') AS missing
       FROM recipes r
      WHERE r.section = 'mixed'
      ORDER BY lower(r.name)`,
  );
}

export type Glance = {
  canMake: RecipeStatus[];
  oneAway: RecipeStatus[];
  buy: { specs: string[]; recipes: string[] }[];
  unusedOut: { id: string; name: string }[];
};

export async function loadGlance(): Promise<Glance> {
  const [status, unusedOut] = await Promise.all([
    loadRecipeStatus(),
    query<{ id: string; name: string }>(
      `SELECT p.id, p.display_name AS name FROM products p
        WHERE NOT p.in_stock
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
  return { canMake, oneAway: blocked.filter((r) => r.missing.length === 1), buy: shoppingList(blocked), unusedOut };
}

/**
 * Buy to unlock: candidate purchases are the exact missing sets of blocked recipes (up to 3
 * items). Each candidate unlocks every recipe whose missing set it covers. Ranked by recipes
 * unlocked, then fewest items. Multi-item entries are things that only work together.
 */
export function shoppingList(blocked: { name: string; missing: string[] }[]) {
  const seen = new Map<string, string[]>();
  for (const r of blocked) if (r.missing.length <= 3) seen.set(r.missing.join("|"), r.missing);
  const out = [...seen.values()].map((specs) => ({
    specs,
    recipes: blocked.filter((r) => r.missing.every((m) => specs.includes(m))).map((r) => r.name),
  }));
  out.sort((a, b) => b.recipes.length - a.recipes.length || a.specs.length - b.specs.length || a.specs[0].localeCompare(b.specs[0]));
  // Drop a combo that unlocks nothing beyond what its single items already unlock.
  return out.filter((c) => {
    if (c.specs.length === 1) return true;
    const singles = new Set(out.filter((o) => o.specs.length === 1 && c.specs.includes(o.specs[0])).flatMap((o) => o.recipes));
    return c.recipes.some((r) => !singles.has(r));
  });
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
  alt_glass_id: number | null; alt_service_style: string | null; glass_note: string | null; lines: RecipeLineRow[];
};

export async function loadRecipeRow(id: string): Promise<RecipeRow | null> {
  const [r] = await query<Omit<RecipeRow, "lines">>(
    `SELECT id, name, description, section, glass_id, service_style, alt_glass_id, alt_service_style, glass_note
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
