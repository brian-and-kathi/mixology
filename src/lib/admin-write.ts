import { randomUUID } from "node:crypto";
import { UserError } from "@/lib/admin-guard";
import { ALTERNATES_JSON, lineStatements, readAlternates } from "@/lib/alternates-db";
import { isUuid, query, sql } from "@/lib/db";
import { MAX_MOODS, MOODS } from "@/lib/moods";
import { normalizeOrigin } from "@/lib/us-states";

// All admin writes: parameterized SQL, and one transaction whenever more than one row changes.
// Every write also appends a change_log row (who/what/before/after/when).

type Stmt = [string, unknown[]];
async function tx(stmts: Stmt[]): Promise<unknown[][]> {
  return (await sql().transaction((t) => stmts.map(([text, params]) => t.query(text, params)))) as unknown[][];
}

const text = (v: unknown, max = 500): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.length > max) throw new UserError("That text is too long.");
  return t === "" ? null : t;
};
const bool = (v: unknown) => v === true || v === "true" || v === "on";
const uuidOrNull = (v: unknown) => (typeof v === "string" && isUuid(v) ? v : null);
/**
 * Mood tags (migration 033): undefined = leave as stored (a caller that doesn't send moods never clears them);
 * otherwise known moods only, at most MAX_MOODS, saved in MOODS order without repeats (the CHECK agrees).
 */
function moodsInput(v: unknown): string[] | null {
  if (v === undefined) return null;
  if (v === null) return [];
  if (!Array.isArray(v)) throw new UserError("Moods must be a list.");
  const list = [...new Set(v.map((m) => (typeof m === "string" ? m.trim() : "")))];
  const bad = list.filter((m) => !(MOODS as readonly string[]).includes(m));
  if (bad.length) throw new UserError(`Unknown mood "${bad[0]}".`);
  if (list.length > MAX_MOODS) throw new UserError(`Pick at most ${MAX_MOODS} moods.`);
  return MOODS.filter((m) => list.includes(m));
}
function num(v: unknown, label: string): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new UserError(`${label} must be a number.`);
  return n;
}

// ---------- Stock ----------

export async function setStock(id: string, inStock: boolean, undoOf?: number) {
  if (!isUuid(id)) throw new UserError("Unknown bottle.");
  const results = await tx([
    ["SELECT id, name FROM menu_mixed", []],
    [
      `WITH u AS (
         UPDATE products SET in_stock = $2 WHERE id = $1 AND in_stock IS DISTINCT FROM $2
         RETURNING id, display_name)
       INSERT INTO change_log (entity, entity_id, action, summary, before, after)
       SELECT 'product', u.id::text, CASE WHEN $3::bigint IS NULL THEN 'stock' ELSE 'undo' END,
              u.display_name || CASE WHEN $2 THEN ' marked in' ELSE ' marked out' END,
              jsonb_build_object('in_stock', NOT $2), jsonb_build_object('in_stock', $2)
         FROM u
       RETURNING id`,
      [id, inStock, undoOf ?? null],
    ],
    ["UPDATE change_log SET undone_by = (SELECT max(id) FROM change_log WHERE entity_id = $2 AND action = 'undo') WHERE id = $1::bigint AND $1::bigint IS NOT NULL", [undoOf ?? null, id]],
    ["SELECT display_name AS name, in_stock FROM products WHERE id = $1", [id]],
    ["SELECT id, name FROM menu_mixed", []],
  ]);
  const before = results[0] as { id: string; name: string }[];
  const log = results[1] as { id: number }[];
  const [product] = results[3] as { name: string; in_stock: boolean }[];
  const after = results[4] as { id: string; name: string }[];
  if (!product) throw new UserError("That bottle no longer exists.");
  const had = new Set(before.map((r) => r.id));
  const has = new Set(after.map((r) => r.id));
  return {
    name: product.name,
    in_stock: product.in_stock,
    log_id: log[0]?.id ?? null,
    blocked: before.filter((r) => !has.has(r.id)).map((r) => r.name),
    unlocked: after.filter((r) => !had.has(r.id)).map((r) => r.name),
  };
}

// ---------- Bottles ----------

const WINE_COLORS = ["red", "white", "rose", "unknown", "not_applicable"];
const EFFERVESCENCE = ["still", "sparkling", "not_applicable"];

export async function saveProduct(id: string | null, body: Record<string, unknown>) {
  const name = text(body.display_name, 120);
  if (!name) throw new UserError("Name is required.");
  const specId = uuidOrNull(body.spec_id);
  if (!specId) throw new UserError("Choose what it is (the ingredient).");
  const familyId = uuidOrNull(body.family_id);
  const pourable = bool(body.pourable);
  const servesNeat = pourable && bool(body.serves_neat);
  const servesRocks = pourable && bool(body.serves_rocks);
  const upc = text(body.upc, 20)?.replace(/\D/g, "") || null;
  if (upc && !/^[0-9]{8,14}$/.test(upc)) throw new UserError("Barcode must be 8 to 14 digits.");
  const abv = num(body.abv, "ABV");
  if (abv !== null && (abv < 0 || abv > 100)) throw new UserError("ABV must be between 0 and 100.");
  const wineColor = WINE_COLORS.includes(String(body.wine_color)) ? String(body.wine_color) : "not_applicable";
  const eff = EFFERVESCENCE.includes(String(body.wine_effervescence)) ? String(body.wine_effervescence) : "not_applicable";
  // Short name (migration 023): optional; blank means "use the full name". Badge overrides are retired (026); spec_label is always cleared.
  const shortName = text(body.short_name, 120);
  const specLabel = null;
  // Grape (migration 031): wines only (the form sends it empty for anything else); blank = none. Display text, not an ingredient.
  const grape = text(body.grape, 80);
  // Reserved (migration 032): kept for an occasion; independent of in_stock. Never with featured (the form turns
  // one off when the other goes on; a request with both is refused, like the CHECK). The note is optional,
  // trimmed, at most 40 characters, and only kept while reserved.
  const featured = bool(body.featured);
  const reserved = bool(body.reserved);
  if (featured && reserved) throw new UserError("A bottle can't be both Featured and Reserved. Turn one off.");
  const note = typeof body.reserved_note === "string" ? body.reserved_note.trim() : "";
  if (reserved && note.length > 40) throw new UserError("The occasion note can be at most 40 characters.");
  const reservedNote = reserved && note ? note : null;
  const v = [
    name, text(body.brand, 120), text(body.description, 2000), normalizeOrigin(text(body.origin, 120)), text(body.serve_note, 200), abv, upc,
    familyId, bool(body.in_stock), featured, !pourable, servesNeat, servesRocks, pourable && bool(body.serves_chilled),
    bool(body.fortified), wineColor, eff, shortName, specLabel, grape, reserved, reservedNote, moodsInput(body.moods),
  ];
  const cols = `display_name = $2, brand = $3, description = $4, origin = $5, serve_note = $6, abv = $7, upc = $8,
    family_id = $9, in_stock = $10, featured = $11, mix_only = $12, serves_neat = $13, serves_rocks = $14, serves_chilled = $15,
    fortified = $16, wine_color = $17, wine_effervescence = $18, short_name = $19, spec_label = $20, grape = $21,
    reserved = $22, reserved_note = $23, moods = COALESCE($24::text[], moods)`;
  const pid = id ?? randomUUID();
  const stmts: Stmt[] = [];
  if (id) {
    stmts.push([
      `WITH old AS (SELECT to_jsonb(p) j FROM products p WHERE id = $1),
            upd AS (UPDATE products SET ${cols} WHERE id = $1 RETURNING to_jsonb(products.*) j)
       INSERT INTO change_log (entity, entity_id, action, summary, before, after)
       SELECT 'product', $1::text, 'update', 'Edited ' || $2, old.j, upd.j FROM old, upd`,
      [pid, ...v],
    ]);
  } else {
    stmts.push([
      `WITH ins AS (
         INSERT INTO products (id, packaged_name, display_name, brand, description, origin, serve_note, abv, upc, family_id,
                               in_stock, featured, mix_only, serves_neat, serves_rocks, serves_chilled, fortified, wine_color, wine_effervescence,
                               short_name, spec_label, grape, reserved, reserved_note, moods)
         VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, COALESCE($24::text[], '{}'))
         RETURNING to_jsonb(products.*) j)
       INSERT INTO change_log (entity, entity_id, action, summary, after)
       SELECT 'product', $1::text, 'create', 'Added ' || $2, ins.j FROM ins`,
      [pid, ...v],
    ]);
  }
  // Main ingredient link: replace the old primary link, keep any secondary links.
  stmts.push(["DELETE FROM product_specs WHERE product_id = $1 AND is_primary AND spec_id <> $2", [pid, specId]]);
  stmts.push([
    `INSERT INTO product_specs (product_id, spec_id, is_primary) VALUES ($1, $2, true)
     ON CONFLICT (product_id, spec_id) DO UPDATE SET is_primary = true`,
    [pid, specId],
  ]);
  if (id) {
    const [exists] = await query<{ n: number }>("SELECT 1 AS n FROM products WHERE id = $1", [id]);
    if (!exists) throw new UserError("That bottle no longer exists.");
  }
  await tx(stmts);
  return { id: pid };
}

// ---------- Ingredients (specs), aliases, substitutions ----------

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";

export async function createSpec(body: Record<string, unknown>) {
  const name = text(body.name, 80)?.toLowerCase();
  if (!name) throw new UserError("Name is required.");
  const familyId = uuidOrNull(body.family_id);
  if (!familyId) throw new UserError("Choose a family.");
  const [clash] = await query<{ id: string }>(
    "SELECT id FROM specs WHERE lower(canonical_name) = $1 UNION SELECT spec_id FROM spec_aliases WHERE lower(alias) = $1 LIMIT 1",
    [name],
  );
  if (clash) throw new UserError(`"${name}" already exists. Pick it from the list instead.`);
  const base = slugify(name);
  const taken = new Set((await query<{ slug: string }>("SELECT slug FROM specs WHERE slug = $1 OR slug LIKE $1 || '-%'", [base])).map((r) => r.slug));
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  const [row] = (await tx([
    ["SELECT create_spec($1, $2, (SELECT slug FROM families WHERE id = $3)) AS id", [slug, name, familyId]],
  ]))[0] as { id: string }[];
  await query(
    `INSERT INTO change_log (entity, entity_id, action, summary, after)
     SELECT 'spec', s.id::text, 'create', 'Added ingredient ' || $2, to_jsonb(s) FROM specs s WHERE s.id = $1::uuid`,
    [row.id, name],
  );
  return { id: row.id, name };
}

export async function saveSpec(id: string, body: Record<string, unknown>) {
  if (!isUuid(id)) throw new UserError("Unknown ingredient.");
  const name = text(body.name, 80)?.toLowerCase();
  if (!name) throw new UserError("Name is required.");
  const familyId = uuidOrNull(body.family_id);
  if (!familyId) throw new UserError("Choose a family.");
  const aliases = [...new Set((Array.isArray(body.aliases) ? body.aliases : []).map((a) => text(a, 80)?.toLowerCase()).filter((a): a is string => !!a && a !== name))];
  await tx([
    [
      `WITH old AS (SELECT s.id, to_jsonb(s) || jsonb_build_object('aliases', (SELECT jsonb_agg(alias ORDER BY alias) FROM spec_aliases WHERE spec_id = s.id)) j FROM specs s WHERE s.id = $1::uuid)
       INSERT INTO change_log (entity, entity_id, action, summary, before)
       SELECT 'spec', old.id::text, 'update', 'Edited ingredient ' || $2, old.j FROM old`,
      [id, name],
    ],
    ["DELETE FROM spec_aliases WHERE spec_id = $1", [id]],
    [
      `UPDATE specs SET canonical_name = $2, description = $3, ingredient_only = $4, always_available = $5 WHERE id = $1`,
      [id, name, text(body.description, 1000), bool(body.ingredient_only), bool(body.always_available)],
    ],
    ["SELECT set_spec_primary_family($1, $2)", [id, familyId]],
    ["INSERT INTO spec_aliases (spec_id, alias) SELECT $1, unnest($2::text[])", [id, aliases]],
    [
      `UPDATE change_log SET after = (SELECT to_jsonb(s) || jsonb_build_object('aliases', (SELECT jsonb_agg(alias ORDER BY alias) FROM spec_aliases WHERE spec_id = s.id)) FROM specs s WHERE s.id = $1::uuid)
        WHERE id = (SELECT max(c.id) FROM change_log c JOIN specs s ON s.id = $1::uuid AND c.entity = 'spec' AND c.entity_id = s.id::text)`,
      [id],
    ],
  ]);
  return { id };
}

const VERMOUTH = new Set(["sweet-vermouth", "dry-vermouth"]);

export async function addSubstitution(body: Record<string, unknown>) {
  const source = uuidOrNull(body.source_id);
  const target = uuidOrNull(body.target_id);
  if (!source || !target) throw new UserError("Choose both ingredients.");
  if (source === target) throw new UserError("An ingredient can't stand in for itself.");
  const specs = await query<{ id: string; slug: string; name: string }>("SELECT id, slug, canonical_name AS name FROM specs WHERE id = ANY($1::uuid[])", [[source, target]]);
  if (specs.length !== 2) throw new UserError("Unknown ingredient.");
  if (specs.every((s) => VERMOUTH.has(s.slug))) {
    throw new UserError("Sweet and dry vermouth can't stand in for each other: they taste completely different.");
  }
  const note = text(body.note, 200);
  const both = bool(body.both_ways);
  const byId = Object.fromEntries(specs.map((s) => [s.id, s.name]));
  const stmts: Stmt[] = [["SELECT add_substitution($1, $2, $3)", [source, target, note]]];
  if (both) stmts.push(["SELECT add_substitution($1, $2, $3)", [target, source, note]]);
  stmts.push([
    `INSERT INTO change_log (entity, entity_id, action, summary, after) VALUES ('substitution', $1, 'create', $2, $3::jsonb)`,
    [`${source}:${target}`, `${byId[source]} can stand in for ${byId[target]}${both ? " (both ways)" : ""}`, JSON.stringify({ source, target, both, note })],
  ]);
  await tx(stmts);
  return { ok: true };
}

export async function deleteSubstitution(body: Record<string, unknown>) {
  const source = uuidOrNull(body.source_id);
  const target = uuidOrNull(body.target_id);
  if (!source || !target) throw new UserError("Unknown substitution.");
  const both = bool(body.both_ways);
  await tx([
    [
      `INSERT INTO change_log (entity, entity_id, action, summary, before)
       SELECT 'substitution', a.id::text || ':' || b.id::text, 'delete',
              'Removed: ' || a.canonical_name || ' for ' || b.canonical_name,
              jsonb_build_object('source', a.id, 'target', b.id, 'both', $3::boolean)
         FROM specs a, specs b WHERE a.id = $1::uuid AND b.id = $2::uuid`,
      [source, target, both],
    ],
    [
      `DELETE FROM spec_substitutions WHERE (source_spec_id = $1 AND target_spec_id = $2)
          OR ($3 AND source_spec_id = $2 AND target_spec_id = $1)`,
      [source, target, both],
    ],
  ]);
  return { ok: true };
}

// ---------- Recipes ----------

const UNITS = ["oz", "dash", "barspoon", "tsp", "tbsp", "part", "ml", "cup", "drop", "pinch", "rind", "twist", "slice", "wedge", "leaf", "sprig", "each", "rinse", "top"];
const NO_AMOUNT = ["top", "rinse"]; // "Top with soda", "Absinthe rinse" (migration 016)
const ROLES = ["base", "modifier", "juice", "sweetener", "garnish", "other"];
const SERVICE = ["up", "on the rocks", "neat", "hot"];
export const RECIPE_UNITS = UNITS;
export const RECIPE_ROLES = ROLES;

const METHOD_STYLES = ["stirred", "shaken", "built", "blended", "rolled", "thrown", "swizzled", "warm", "warm, in a mug", "warm, batch"];
function methodStyle(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string" && METHOD_STYLES.includes(v)) return v;
  throw new UserError("Unknown method style.");
}

function recipeInput(body: Record<string, unknown>) {
  const name = text(body.name, 120);
  if (!name) throw new UserError("Name is required.");
  const rawLines = Array.isArray(body.lines) ? (body.lines as Record<string, unknown>[]) : [];
  const lines = rawLines
    .filter((l) => uuidOrNull(l.spec_id))
    .map((l, i) => {
      let amount = num(l.amount, "Amount");
      const unit = text(l.unit, 20);
      if (unit && NO_AMOUNT.includes(unit)) amount = null; // top / rinse never take an amount
      else {
        if (amount !== null && amount <= 0) throw new UserError("Amounts must be more than zero.");
        if ((amount === null) !== (unit === null)) throw new UserError("An amount needs a unit, and a unit needs an amount.");
      }
      if (unit && !UNITS.includes(unit)) throw new UserError(`Unknown unit "${unit}".`);
      const role = text(l.role, 20);
      if (role && !ROLES.includes(role)) throw new UserError("Unknown role.");
      return { spec_id: String(l.spec_id), position: i + 1, required: l.required !== false, amount, unit, role, note: text(l.note, 200) };
    });
  if (lines.length === 0) throw new UserError("Add at least one ingredient.");
  // Blank means "not set"; anything else must be a known value (never silently cleared).
  const style = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "string" && SERVICE.includes(v)) return v;
    throw new UserError("Unknown service style.");
  };
  const glass = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    if (Number.isInteger(Number(v)) && Number(v) > 0) return Number(v);
    throw new UserError("Unknown glass.");
  };
  return {
    name,
    description: text(body.description, 4000),
    glass_id: glass(body.glass_id),
    service_style: style(body.service_style),
    alt_glass_id: glass(body.alt_glass_id),
    alt_service_style: style(body.alt_service_style),
    glass_note: text(body.glass_note, 120),
    method_style: methodStyle(body.method_style),
    moods: moodsInput(body.moods),
    lines,
  };
}

// Each line carries its alternates (migration 034), so the log shows them before and after an edit.
const RECIPE_JSON = `to_jsonb(r) || jsonb_build_object('lines', (SELECT jsonb_agg((to_jsonb(l) - 'id' - 'recipe_id') || jsonb_build_object('alternates', ${ALTERNATES_JSON("l")}) ORDER BY l.position) FROM recipe_lines l WHERE l.recipe_id = r.id))`;

export async function saveRecipe(id: string | null, body: Record<string, unknown>) {
  const r = recipeInput(body);
  const rid = id ?? randomUUID();
  if (id) {
    const [exists] = await query<{ n: number }>("SELECT 1 AS n FROM recipes WHERE id = $1", [id]);
    if (!exists) throw new UserError("That recipe no longer exists.");
  }
  const glassIds = [r.glass_id, r.alt_glass_id].filter((g): g is number => g !== null);
  const specIds = [...new Set(r.lines.map((l) => l.spec_id))];
  const [found] = await query<{ glasses: number; specs: number }>(
    `SELECT (SELECT count(*)::int FROM glassware WHERE id = ANY($1::int[])) AS glasses,
            (SELECT count(*)::int FROM specs WHERE id = ANY($2::uuid[])) AS specs`,
    [[...new Set(glassIds)], specIds],
  );
  if (found.glasses !== new Set(glassIds).size) throw new UserError("Unknown glass.");
  if (found.specs !== specIds.length) throw new UserError("One of the ingredients no longer exists. Pick it again.");
  const vals = [rid, r.name, r.description, r.glass_id, r.service_style, r.alt_glass_id, r.alt_service_style, r.glass_note, r.method_style, r.moods];
  // Lines are replaced; their alternates (migration 034) are read first and written back onto the new lines.
  const before = id ? await readAlternates(rid) : null;
  const stmts: Stmt[] = [];
  if (id) {
    stmts.push([
      `INSERT INTO change_log (entity, entity_id, action, summary, before)
       SELECT 'recipe', r.id::text, 'update', 'Edited ' || $2, ${RECIPE_JSON} FROM recipes r WHERE r.id = $1::uuid`,
      [rid, r.name],
    ]);
    stmts.push([
      `UPDATE recipes SET name = $2, description = $3, glass_id = $4, service_style = $5, alt_glass_id = $6,
              alt_service_style = $7, glass_note = $8, method_style = $9, moods = COALESCE($10::text[], moods) WHERE id = $1`,
      vals,
    ]);
    stmts.push(["DELETE FROM recipe_lines WHERE recipe_id = $1", [rid]]);
  } else {
    stmts.push([
      `INSERT INTO recipes (id, name, description, glass_id, service_style, alt_glass_id, alt_service_style, glass_note, method_style, moods, section)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::text[], '{}'), 'mixed')`,
      vals,
    ]);
  }
  stmts.push(...lineStatements(rid, r.lines, before));
  if (id) {
    stmts.push([
      `UPDATE change_log SET after = (SELECT ${RECIPE_JSON} FROM recipes r WHERE r.id = $1::uuid)
        WHERE id = (SELECT max(c.id) FROM change_log c JOIN recipes r ON r.id = $1::uuid AND c.entity = 'recipe' AND c.entity_id = r.id::text)`,
      [rid],
    ]);
  } else {
    stmts.push([
      `INSERT INTO change_log (entity, entity_id, action, summary, after)
       SELECT 'recipe', r.id::text, 'create', 'Added ' || $2, ${RECIPE_JSON} FROM recipes r WHERE r.id = $1::uuid`,
      [rid, r.name],
    ]);
  }
  await tx(stmts);
  return { id: rid };
}

export async function duplicateRecipe(id: string) {
  if (!isUuid(id)) throw new UserError("Unknown recipe.");
  const [src] = await query<{ name: string }>("SELECT name FROM recipes WHERE id = $1", [id]);
  if (!src) throw new UserError("That recipe no longer exists.");
  const names = new Set((await query<{ name: string }>("SELECT name FROM recipes WHERE name LIKE $1 || '%'", [src.name])).map((r) => r.name));
  let name = `${src.name} (copy)`;
  for (let i = 2; names.has(name); i++) name = `${src.name} (copy ${i})`;
  const nid = randomUUID();
  await tx([
    [
      `INSERT INTO recipes (id, name, description, section, glass_id, service_style, alt_glass_id, alt_service_style, glass_note, method_style, moods)
       SELECT $2, $3, description, section, glass_id, service_style, alt_glass_id, alt_service_style, glass_note, method_style, moods FROM recipes WHERE id = $1`,
      [id, nid, name],
    ],
    [
      `INSERT INTO recipe_lines (recipe_id, spec_id, position, required, amount, unit, role, note)
       SELECT $2, spec_id, position, required, amount, unit, role, note FROM recipe_lines WHERE recipe_id = $1`,
      [id, nid],
    ],
    // The copy keeps each line's alternates (migration 034).
    [
      `INSERT INTO recipe_line_alternates (recipe_line_id, spec_id, position, amount, unit, note)
       SELECT nl.id, a.spec_id, a.position, a.amount, a.unit, a.note
         FROM recipe_line_alternates a
         JOIN recipe_lines ol ON ol.id = a.recipe_line_id AND ol.recipe_id = $1
         JOIN recipe_lines nl ON nl.recipe_id = $2 AND nl.position = ol.position`,
      [id, nid],
    ],
    [
      `INSERT INTO change_log (entity, entity_id, action, summary, after)
       SELECT 'recipe', r.id::text, 'create', 'Duplicated as ' || $2, ${RECIPE_JSON} FROM recipes r WHERE r.id = $1::uuid`,
      [nid, name],
    ],
  ]);
  return { id: nid };
}
