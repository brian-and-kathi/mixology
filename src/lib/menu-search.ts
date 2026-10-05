import { query } from "@/lib/db";
import { cellarColor, cleanMoods, cocktailStyle } from "@/lib/moods";
import type { Facet } from "@/lib/menu-filter";
import { specLabel } from "@/lib/spec-label";
import { SPIRIT_FAMILIES, spiritFamily } from "@/lib/spirit-family";

/**
 * Pours section chip: the spirit family (lib/spirit-family.ts), with Whiskey split by its badge ("Bourbon",
 * "Rye"), as in the approved mock-up. Agave reads "Tequila", Other spirits "Other".
 */
function pourChip(family: number, badge: string | null): string {
  if (family === 0) return badge ?? "Whiskey";
  const name = SPIRIT_FAMILIES[family] ?? "Other spirits";
  return name === "Agave" ? "Tequila" : name === "Other spirits" ? "Other" : name;
}

const notes = (...texts: (string | null | undefined)[]) => texts.map((t) => (t ?? "").replace(/\s+/g, " ").trim()).filter(Boolean);

/**
 * The phone menu's search and filter facts for every item on tonight's menu, keyed "section:id" ("pours:<uuid>"). Phone /menu only: the TV board never loads this. `notes` are the searchable texts that aren't
 * on the card (full bottle name, brand, grape, tasting note, wine pairings; a cocktail's method and note). A
 * reserved (locked) item keeps only what its card shows: no notes, like its locked page.
 */
export async function loadMenuFacets(): Promise<Record<string, Facet>> {
  const [pours, cocktails, cellar] = await Promise.all([
    query<{ id: string; moods: string[]; full: string; brand: string | null; description: string | null; type: string | null; label: string | null; family: string | null; reserved: boolean }>(
      `SELECT n.id, p.moods, n.display_name AS full, p.brand, p.description, n.primary_spec_name AS type, p.spec_label AS label, n.reserved,
              (SELECT f.slug FROM specs s JOIN spec_families sf ON sf.spec_id = s.id AND sf.is_primary
                 JOIN families f ON f.id = sf.family_id WHERE s.canonical_name = n.primary_spec_name) AS family
         FROM menu_neat n JOIN products p ON p.id = n.id`,
    ),
    query<{ id: string; moods: string[]; method_style: string | null; description: string | null; reserved: boolean }>(
      `SELECT m.id, r.moods, r.method_style, r.description, m.reserved FROM menu_mixed m JOIN recipes r ON r.id = m.id`,
    ),
    query<{ id: string; moods: string[]; style_group: string | null; fortified: boolean | null; grape: string | null; description: string | null; pairing_notes: string | null; brand: string | null; reserved: boolean }>(
      `SELECT w.id, p.moods, w.style_group, w.fortified, w.grape, w.description, w.pairing_notes, p.brand, w.reserved
         FROM menu_wines w JOIN products p ON p.id = w.id`,
    ),
  ]);
  const out: Record<string, Facet> = {};
  for (const p of pours) {
    const badge = specLabel(p.type, p.label);
    out[`pours:${p.id}`] = { moods: cleanMoods(p.moods), chip: pourChip(spiritFamily(p.type, p.family), badge), grape: null,
      notes: p.reserved ? notes(p.full) : notes(p.full, badge, p.brand, p.description) };
  }
  for (const c of cocktails) {
    out[`cocktails:${c.id}`] = { moods: cleanMoods(c.moods), chip: cocktailStyle(c.method_style), grape: null, notes: c.reserved ? [] : notes(c.description) };
  }
  for (const w of cellar) {
    out[`cellar:${w.id}`] = { moods: cleanMoods(w.moods), chip: cellarColor(w.style_group, w.fortified), grape: w.grape?.trim() || null,
      notes: w.reserved ? notes(w.grape) : notes(w.grape, w.brand, w.description, w.pairing_notes?.split(/\s*\n\s*/).filter(Boolean).join(", ")) };
  }
  return out;
}
