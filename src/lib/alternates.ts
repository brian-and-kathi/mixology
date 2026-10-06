/**
 * Drink-specific alternates (migration 034, recipe_line_alternates): up to 3 other ingredients that can fill one
 * recipe line, in priority order. Pure helpers shared by the admin save paths and the guest pages; no imports, so
 * scripts/alternates.test.mjs can load this file directly.
 */

export const MAX_ALTERNATES = 3;

/** One alternate as stored: its ingredient, optional amount/unit override (both null = the line's own), optional note. */
export type Alternate = { spec_id: string; amount: string | number | null; unit: string | null; note: string | null };

/** An alternate as read back with the line it belonged to (recipe saves delete and re-insert every line). */
export type StoredAlternate = Alternate & { line_spec_id: string; line_position: number; position: number };

/**
 * Keeps a line's alternates valid: never the line's own ingredient, no repeats, at most MAX_ALTERNATES, in order.
 * (The database enforces the same rules; this keeps a save from failing on them.)
 */
export function cleanAlternates(lineSpecId: string, alts: Alternate[]): Alternate[] {
  const seen = new Set<string>([lineSpecId]);
  const out: Alternate[] = [];
  for (const a of alts) {
    if (!a.spec_id || seen.has(a.spec_id)) continue;
    seen.add(a.spec_id);
    const note = (a.note ?? "").trim() || null;
    const unit = (a.unit ?? "").trim() || null;
    const amount = a.amount === "" || a.amount === null || a.amount === undefined ? null : a.amount;
    out.push({ spec_id: a.spec_id, amount: amount === null && !unit ? null : amount, unit: amount === null && !unit ? null : unit, note });
    if (out.length === MAX_ALTERNATES) break;
  }
  return out;
}

/**
 * Recipe saves replace every line, which would drop their alternates (ON DELETE CASCADE). This carries each old
 * line's alternates to the new line that continues it: the line with the same ingredient (wherever it moved); else,
 * for a line whose ingredient is new to the recipe, the old line in the same position whose ingredient is gone (an
 * ingredient changed in place). Alternates equal to the new line's ingredient are dropped. A deleted line's
 * alternates go with it. Returns the alternates for each new line, by index.
 */
export function carryAlternates(
  oldLines: { spec_id: string; position: number }[],
  stored: StoredAlternate[],
  newLines: { spec_id: string; position: number }[],
): Alternate[][] {
  const altsAt = new Map<number, StoredAlternate[]>();
  for (const a of stored) altsAt.set(a.line_position, [...(altsAt.get(a.line_position) ?? []), a]);
  const free = new Set(oldLines.map((l) => l.position));
  const pick = new Array<number | null>(newLines.length).fill(null);
  newLines.forEach((l, i) => {
    const hit = oldLines.find((o) => free.has(o.position) && o.spec_id === l.spec_id);
    if (hit) { pick[i] = hit.position; free.delete(hit.position); }
  });
  const kept = new Set(newLines.map((l) => l.spec_id));
  newLines.forEach((l, i) => {
    if (pick[i] !== null || oldLines.some((o) => o.spec_id === l.spec_id)) return;
    const same = oldLines.find((o) => free.has(o.position) && o.position === l.position && !kept.has(o.spec_id));
    if (same) { pick[i] = same.position; free.delete(same.position); }
  });
  return newLines.map((l, i) => {
    const alts = pick[i] === null ? [] : altsAt.get(pick[i]!) ?? [];
    return cleanAlternates(l.spec_id, [...alts].sort((a, b) => a.position - b.position));
  });
}

/**
 * Guest wording for the alternates after the leading ingredient: "or Cognac"; "or Cognac, Brandy"; three or
 * more: "or Cognac +2" (the rest open on tap). A no-break space keeps "or" with the first name.
 */
export function orText(names: string[]): { text: string; more: string[] } {
  const list = names.map((n) => n.trim()).filter(Boolean);
  if (!list.length) return { text: "", more: [] };
  if (list.length <= 2) return { text: `or\u00a0${list.join(", ")}`, more: [] };
  return { text: `or\u00a0${list[0]}`, more: list.slice(1) };
}
