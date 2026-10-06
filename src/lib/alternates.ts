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

/** One recipe line as the method swap sees it: its own ingredient, the alternate leading tonight (null = its own), its alternates. */
export type SwapLine = { own: string; lead: string | null; alternates: string[] };

/** Why a leading alternate's name was not swapped into the method (for tests and the review list). */
export type SwapSkip = { from: string; to: string; why: "not named" | "names an alternate" | "inside another name" | "clash" };

const WORD = "[\\p{L}\\p{N}]";
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whole-word, case-insensitive: not preceded or followed by a letter or digit ("rye" never matches "ryegrass"). */
const wordRe = (t: string, flags = "iu") => new RegExp(`(?<!${WORD})${esc(t.trim()).replace(/\s+/g, "\\s+")}(?!${WORD})`, flags);
const lc = (t: string) => t.trim().toLowerCase();

/** The swapped word in the case of the word it replaces: "Bourbon" → "Cognac", "BOURBON" → "COGNAC", "bourbon" → "cognac". */
function matchCase(found: string, to: string): string {
  if (found.length > 1 && found === found.toUpperCase() && found !== found.toLowerCase()) return to.toUpperCase();
  if (found[0] && found[0] === found[0].toUpperCase() && found[0] !== found[0].toLowerCase()) return to[0].toUpperCase() + to.slice(1);
  return to;
}

/**
 * Method text when an alternate leads (the line's own ingredient is out or reserved): the own ingredient's name is
 * swapped for the leading alternate's, whole word and case-preserving ("Add the bourbon" → "Add the cognac"; a
 * possessive "bourbon's" keeps its "'s"; plurals are left alone). Only the recipe's own ingredient names are touched,
 * and a swap is skipped (text left as written, never guessed) when:
 *   - the method already names any of the line's alternates ("add the bourbon or cognac" is written for either);
 *   - the own name appears inside another line's ingredient name ("rum" with a "spiced rum" line), or two swaps clash;
 *   - the own name isn't in the text at all (nothing to do).
 * All swaps happen in one pass, so a swapped-in name is never swapped again.
 */
export function swapMethod(text: string, lines: SwapLine[]): { text: string; swapped: { from: string; to: string }[]; skipped: SwapSkip[] } {
  const swapped: { from: string; to: string }[] = [];
  const skipped: SwapSkip[] = [];
  const want: { from: string; to: string; line: number }[] = [];
  lines.forEach((l, i) => {
    if (!l.lead || !l.own.trim() || lc(l.lead) === lc(l.own)) return;
    const from = l.own.trim(), to = l.lead.trim();
    const others = lines.filter((_, j) => j !== i).flatMap((o) => [o.own, ...o.alternates]).filter((n) => n && lc(n) !== lc(from));
    if (!wordRe(from).test(text)) skipped.push({ from, to, why: "not named" });
    else if ([to, ...l.alternates].some((a) => a.trim() && wordRe(a).test(text))) skipped.push({ from, to, why: "names an alternate" });
    else if (others.some((n) => wordRe(from).test(n))) skipped.push({ from, to, why: "inside another name" });
    else want.push({ from, to, line: i });
  });
  // Two swaps whose names overlap ("rum" and "dark rum") would fight over the same words: neither is made.
  const ok = want.filter((w) => !want.some((v) => v !== w && (wordRe(w.from).test(v.from) || wordRe(v.from).test(w.from))));
  for (const w of want) if (!ok.includes(w)) skipped.push({ from: w.from, to: w.to, why: "clash" });
  if (!ok.length) return { text, swapped, skipped };
  const byName = new Map(ok.map((w) => [lc(w.from).replace(/\s+/g, " "), w.to]));
  const all = new RegExp(ok.map((w) => wordRe(w.from).source).join("|"), "giu");
  const out = text.replace(all, (found) => matchCase(found, byName.get(lc(found).replace(/\s+/g, " ")) ?? found));
  swapped.push(...ok.map(({ from, to }) => ({ from, to })));
  return { text: out, swapped, skipped };
}

/**
 * Only the method proper is swapped: the text before the first "Serves N." (what follows is the house note, which
 * names the bottles on purpose: "Bowright or Willett rye with a Harvester Cabernet float"). No "Serves": all of it.
 */
export function swapMethodText(description: string | null, lines: SwapLine[]): string | null {
  if (!description || !lines.some((l) => l.lead)) return description;
  const m = /(?<![\p{L}\p{N}])Serves\s+\d+\b/u.exec(description);
  const head = m ? description.slice(0, m.index) : description;
  return swapMethod(head, lines).text + (m ? description.slice(m.index) : "");
}
