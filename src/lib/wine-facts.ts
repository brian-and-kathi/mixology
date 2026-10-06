/**
 * Facts for a Cellar wine's Show on TV card (Brian via Rachel, 2026-10-06). Pure helpers, no imports, so
 * scripts/wine-facts.test.mjs can load them. Every value is read from data the bottle already has; anything
 * missing comes back null (or empty) and the card leaves that bit out.
 */

/**
 * Serving temperature. The bottle's own "Usually served" flags win (the Cellar reuses the serve columns:
 * serves_chilled = Chilled, serves_neat = Room temp, serves_rocks = Over ice; lib/format wineServeLine).
 * With neither temperature flag set, it follows the wine's color group (wine_style_group(), migration 011):
 * white, rosé and sparkling are Chilled, red is Room temperature (the same default the admin bottle form
 * picks for a new wine). Anything else (sake, fruit wines, no color on record) has no temperature: null.
 */
export function wineTemp(w: { chilled: boolean; neat: boolean; rocks?: boolean; styleGroup: string | null | undefined }): string | null {
  let temp: string | null;
  if (w.chilled && w.neat) temp = "Chilled or room temperature";
  else if (w.chilled) temp = "Chilled";
  else if (w.neat) temp = "Room temperature";
  else if (w.styleGroup === "white" || w.styleGroup === "rose" || w.styleGroup === "sparkling") temp = "Chilled";
  else if (w.styleGroup === "red") temp = "Room temperature";
  else temp = null;
  if (w.rocks) return temp ? `${temp} or over ice` : "Over ice";
  return temp;
}

const COLOR: Readonly<Record<string, string>> = { red: "Red", white: "White", rose: "Rosé" };

/**
 * Color words from products.wine_color and wine_effervescence: "Red", "White", "Rosé", "Sparkling",
 * "Sparkling rosé", "Fortified red". not_applicable / unknown and still: null (no color line).
 */
export function wineColorLabel(color: string | null | undefined, effervescence: string | null | undefined, fortified?: boolean | null): string | null {
  const base = COLOR[color ?? ""] ?? null;
  const words = [effervescence === "sparkling" ? "sparkling" : null, fortified ? "fortified" : null, base ? base.toLowerCase() : null].filter(Boolean) as string[];
  if (!words.length) return null;
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Vintage, when the bottle says one: there is no vintage column, so this is the first 4-digit year (1900 to
 * next year) in the guest name, else in the label name (packaged_name): "Chateau Grand Traverse Merlot 2020"
 * -> "2020". Nothing found: null. Never guessed.
 */
export function wineVintage(names: (string | null | undefined)[], now = new Date()): string | null {
  const max = now.getFullYear() + 1;
  for (const name of names) {
    for (const m of (name ?? "").matchAll(/(?<![\d.])(19\d\d|20\d\d)(?![\d.%])/g)) {
      const y = Number(m[1]);
      if (y >= 1900 && y <= max) return m[1];
    }
  }
  return null;
}

/**
 * Grape badges from products.grape (migration 031): one badge per grape when a blend lists several
 * ("Cabernet Sauvignon / Merlot", "Syrah, Grenache" -> two), otherwise the one value as it is ("Red blend").
 * Blank: none.
 */
export function wineGrapes(grape: string | null | undefined): string[] {
  const parts = (grape ?? "").split(/\s*(?:[,/+&]|\band\b)\s*/i).map((g) => g.trim()).filter(Boolean);
  return [...new Set(parts)];
}
