/**
 * Phone menu search and filters (Brian via Rachel, 2026-10-04): pure functions, shared by the /menu browser
 * (components/MenuBrowser.tsx) and scripts/check-menu-filter.mts. No database, no React.
 *
 * Search: every word typed must appear somewhere in the item (name, badge, place, ingredient line, or a note
 * that isn't on the card: full bottle name, brand, grape, tasting note, pairings, a cocktail's method). Case,
 * accents and no-break spaces don't matter ("reviseur" finds Réviseur). Moods: one at a time, plus the
 * independent "Top rated" toggle. Section chips narrow one section and are ignored while searching.
 */
import type { MenuItem, SectionId } from "@/lib/menu";
import { MOOD_MIN_ITEMS, MOODS, TOP_RATED_MIN, CELLAR_COLORS, COCKTAIL_STYLES, cellarColor } from "@/lib/moods";

/** Server facts for one item (lib/menu-search.ts). `chip`: Pours spirit, Cocktails style, Cellar color. */
export type Facet = { moods: string[]; chip: string | null; grape: string | null; notes: string[] };
export type BrowseItem = MenuItem & { facet: Facet; rating: number | null };
export type BrowseSection = { id: SectionId; label: string; noun: [string, string]; items: BrowseItem[] };

/** Section chip choice: Pours/Cocktails a chip label; Cellar a color and/or a grape. null = All. */
export type SectionPick = { chip: string | null; grape: string | null };
export type Filters = { q: string; mood: string | null; top: boolean; picks: Record<SectionId, SectionPick> };
export const NO_PICK: SectionPick = { chip: null, grape: null };

/** Lower case, no accents, plain spaces and apostrophes: one character in, one character out (so marks line up). */
function foldChar(ch: string): string {
  const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const c = (base.length === 1 ? base : ch).toLowerCase();
  if (c === "\u00a0" || c === "\u202f") return " ";
  if (c === "\u2019" || c === "\u2018") return "'";
  return c.length === 1 ? c : ch.length === 1 ? ch : c.charAt(0);
}
export function fold(text: string): string {
  let out = "";
  for (const ch of text) out += ch.length === 1 ? foldChar(ch) : ch.replace(/./gu, "?").padEnd(ch.length, "?");
  return out;
}

/** The words of a query, folded; empty when the box is blank. */
export function words(q: string): string[] {
  return [...new Set(fold(q).split(/\s+/).map((w) => w.trim()).filter(Boolean))];
}

/** What the card shows, searched and highlighted. */
export const visibleTexts = (it: MenuItem): string[] => [it.name, it.spec ?? "", it.detail ?? ""].filter(Boolean);

export function matchesWords(it: BrowseItem, ws: string[]): boolean {
  if (!ws.length) return true;
  const hay = fold([...visibleTexts(it), ...it.facet.notes].join(" \u0000 "));
  return ws.every((w) => hay.includes(w));
}

/** [start, end) ranges of any word in `text`, merged; for <mark>. */
export function markRanges(text: string, ws: string[]): [number, number][] {
  if (!ws.length || !text) return [];
  const t = fold(text);
  const hits: [number, number][] = [];
  for (const w of ws) for (let i = t.indexOf(w); i >= 0; i = t.indexOf(w, i + 1)) hits.push([i, i + w.length]);
  hits.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const out: [number, number][] = [];
  for (const h of hits) {
    const last = out[out.length - 1];
    if (last && h[0] <= last[1]) last[1] = Math.max(last[1], h[1]);
    else out.push([...h]);
  }
  return out;
}

/**
 * When a word only matches a note that isn't on the card, a short excerpt of the first such note
 * ("…Amalfi Coast lemon peels…") so the guest can see why the item is listed. null when the card shows every word.
 */
export function noteExcerpt(it: BrowseItem, ws: string[], room = 34): string | null {
  if (!ws.length) return null;
  const seen = fold(visibleTexts(it).join(" "));
  const missing = ws.filter((w) => !seen.includes(w));
  if (!missing.length) return null;
  for (const note of it.facet.notes) {
    const f = fold(note);
    const at = missing.map((w) => f.indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
    if (at === undefined) continue;
    let start = Math.max(0, at - room);
    let end = Math.min(note.length, at + room + 10);
    if (start > 0) { const sp = note.indexOf(" ", start); start = sp >= 0 && sp < at ? sp + 1 : start; }
    if (end < note.length) { const sp = note.lastIndexOf(" ", end); end = sp > at ? sp : end; }
    return `${start > 0 ? "…" : ""}${note.slice(start, end).trim()}${end < note.length ? "…" : ""}`;
  }
  return null;
}

/** Mood chips shown tonight: MOODS order, only those on at least MOOD_MIN_ITEMS available (not reserved) items. */
export function visibleMoods(sections: BrowseSection[]): { mood: string; count: number }[] {
  const all = sections.flatMap((s) => s.items).filter((it) => !it.reserved);
  return MOODS.map((mood) => ({ mood, count: all.filter((it) => it.facet.moods.includes(mood)).length })).filter((m) => m.count >= MOOD_MIN_ITEMS);
}

/** Search, mood and Top rated (not the section chips): what the tab counts follow. */
export function baseFilter(items: BrowseItem[], f: Pick<Filters, "q" | "mood" | "top">): BrowseItem[] {
  const ws = words(f.q);
  return items.filter((it) => matchesWords(it, ws) && (!f.mood || it.facet.moods.includes(f.mood)) && (!f.top || (it.rating ?? 0) >= TOP_RATED_MIN));
}

/** A section chip choice applied (Cellar: color and grape). */
export function pickFilter(items: BrowseItem[], pick: SectionPick): BrowseItem[] {
  return items.filter((it) => (!pick.chip || it.facet.chip === pick.chip) && (!pick.grape || it.facet.grape === pick.grape));
}

/** Everything applied: section chips only count while the search box is empty (they are hidden while searching). */
export function sectionItems(s: BrowseSection, f: Filters): BrowseItem[] {
  const base = baseFilter(s.items, f);
  return words(f.q).length ? base : pickFilter(base, f.picks[s.id] ?? NO_PICK);
}

export type Chip = { label: string; kind: "chip" | "grape"; count: number; dim: boolean };
/**
 * A section's chips, in menu order: Pours spirits; Cocktails Stirred · Shaken · Hot; Cellar Red · White · Other,
 * then grapes. Only chips some item on tonight's menu has. `count` follows the mood and Top rated filters; a chip
 * with nothing under them is dimmed. Cellar grapes follow the chosen color (Brian via Vincent, 2026-10-04): with
 * Red on, only grapes of tonight's red wines, and so on; with no color, every grape. A grape's color comes from the
 * wines on the menu that carry it (grapeInColor), so a grape poured as more than one color shows under each.
 */
export function sectionChips(s: BrowseSection, f: Filters): Chip[] {
  const base = baseFilter(s.items, { ...f, q: "" });
  const order = s.id === "cocktails" ? [...COCKTAIL_STYLES] : s.id === "cellar" ? [...CELLAR_COLORS] : [];
  const labels = [...new Set(s.items.map((it) => it.facet.chip).filter((c): c is string => !!c))];
  const chips: Chip[] = (order.length ? order.filter((c) => labels.includes(c)) : labels).map((label) => {
    const count = base.filter((it) => it.facet.chip === label).length;
    return { label, kind: "chip" as const, count, dim: count === 0 };
  });
  if (s.id === "cellar") {
    const color = f.picks.cellar?.chip ?? null;
    const grapes = [...new Set(s.items.map((it) => it.facet.grape).filter((g): g is string => !!g))];
    for (const g of grapes) {
      if (color && !grapeInColor(s, g, color)) continue;
      const count = base.filter((it) => it.facet.grape === g && (!color || it.facet.chip === color)).length;
      chips.push({ label: g, kind: "grape", count, dim: count === 0 });
    }
  }
  return chips;
}

/** True when some wine on tonight's list has this grape and this color. */
export const grapeInColor = (s: BrowseSection, grape: string, color: string): boolean =>
  s.items.some((it) => it.facet.grape === grape && it.facet.chip === color);

export { cellarColor };
