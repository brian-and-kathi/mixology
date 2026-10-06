import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";
import { type Alternate, type StoredAlternate, carryAlternates } from "@/lib/alternates";

/**
 * Recipe saves (admin editor and /db) delete and re-insert every line, and a line's alternates (migration 034)
 * cascade with it. These helpers read the alternates first and write them back onto the new lines in the same
 * transaction, so editing a recipe never loses them. `explicit` (the editor's own list for a line, when it sends
 * one) wins over carrying the stored ones.
 */
export async function readAlternates(recipeId: string) {
  const [oldLines, stored] = await Promise.all([
    query<{ spec_id: string; position: number }>("SELECT spec_id, position FROM recipe_lines WHERE recipe_id = $1", [recipeId]),
    query<StoredAlternate>(
      `SELECT rl.spec_id AS line_spec_id, rl.position AS line_position, a.spec_id, a.position, a.amount::text AS amount, a.unit, a.note
         FROM recipe_line_alternates a JOIN recipe_lines rl ON rl.id = a.recipe_line_id
        WHERE rl.recipe_id = $1`,
      [recipeId],
    ),
  ]);
  return { oldLines, stored };
}

type Line = { spec_id: string; position: number; required: boolean; amount: number | null; unit: string | null; role: string | null; note: string | null };

/** INSERT statements for a recipe's lines (with fresh ids) and their alternates. */
export function lineStatements(
  recipeId: string,
  lines: (Line & { alternates?: Alternate[] })[],
  before: { oldLines: { spec_id: string; position: number }[]; stored: StoredAlternate[] } | null,
): [string, unknown[]][] {
  const carried = before ? carryAlternates(before.oldLines, before.stored, lines) : lines.map(() => []);
  const rows = lines.map(({ alternates: _a, ...l }) => ({ id: randomUUID(), ...l }));
  const alts = rows.flatMap((l, i) => (lines[i].alternates ?? carried[i]).map((a, k) => ({
    recipe_line_id: l.id, spec_id: a.spec_id, position: k + 1, amount: a.amount === null ? null : Number(a.amount), unit: a.unit, note: a.note,
  })));
  const stmts: [string, unknown[]][] = [[
    `INSERT INTO recipe_lines (id, recipe_id, spec_id, position, required, amount, unit, role, note)
     SELECT l.id, $1, l.spec_id, l.position, l.required, l.amount, l.unit, l.role, l.note
       FROM jsonb_to_recordset($2::jsonb) AS l(id uuid, spec_id uuid, position int, required boolean, amount numeric, unit text, role text, note text)`,
    [recipeId, JSON.stringify(rows)],
  ]];
  if (alts.length) stmts.push([
    `INSERT INTO recipe_line_alternates (recipe_line_id, spec_id, position, amount, unit, note)
     SELECT a.recipe_line_id, a.spec_id, a.position, a.amount, a.unit, a.note
       FROM jsonb_to_recordset($1::jsonb) AS a(recipe_line_id uuid, spec_id uuid, position int, amount numeric, unit text, note text)`,
    [JSON.stringify(alts)],
  ]);
  return stmts;
}

/** change_log JSON for a recipe line's alternates, in priority order ([] when none). `l` is the recipe_lines alias. */
export const ALTERNATES_JSON = (l: string) => `COALESCE((SELECT jsonb_agg(jsonb_build_object('spec_id', a.spec_id, 'position', a.position,
    'amount', a.amount, 'unit', a.unit, 'note', a.note) ORDER BY a.position) FROM recipe_line_alternates a WHERE a.recipe_line_id = ${l}.id), '[]'::jsonb)`;
