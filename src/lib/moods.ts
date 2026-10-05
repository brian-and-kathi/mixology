/**
 * Mood tags (migration 033, Brian via Rachel 2026-10-04): the phone menu's mood chips, in this order. The same
 * 8 values are the CHECK in 033_moods.sql (moods_ok()); adding or renaming one needs a migration too.
 * An item has at most MAX_MOODS. The TV's cast band shows a cocktail's moods under its name (Brian via Vincent,
 * 2026-10-04); the TV menu itself ignores them.
 */
export const MOODS = ["Cozy", "Night-Out", "Smoky", "Tropical", "Bitter", "Indulgent", "Clean", "Nostalgic"] as const;
export type Mood = (typeof MOODS)[number];
export const MAX_MOODS = 3;

/** A mood chip shows only when at least this many items on tonight's menu (in stock or makeable, not reserved) carry it. */
export const MOOD_MIN_ITEMS = 2;

/** "Top rated ★": a guest average (the same rounding as the cards) of at least this. */
export const TOP_RATED_MIN = 4.0;

const SET = new Set<string>(MOODS);
/** Known moods only, in MOODS order, no repeats, at most MAX_MOODS. Unknown values are dropped. */
export function cleanMoods(value: unknown): Mood[] {
  const list = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && SET.has(v)) : [];
  return MOODS.filter((m) => list.includes(m)).slice(0, MAX_MOODS);
}

/**
 * Cocktail section chips, straight from recipes.method_style (migration 017); no extra tagging.
 * "built", "blended", "rolled", "thrown" and "swizzled" have no chip (no recipe uses them today): such a drink
 * shows under All only.
 */
export const COCKTAIL_STYLES = ["Stirred", "Shaken", "Hot"] as const;
export type CocktailStyle = (typeof COCKTAIL_STYLES)[number];
export function cocktailStyle(method: string | null | undefined): CocktailStyle | null {
  const m = (method ?? "").trim().toLowerCase();
  if (m === "stirred") return "Stirred";
  if (m === "shaken") return "Shaken";
  if (m === "warm" || m.startsWith("warm,")) return "Hot";
  return null;
}

/**
 * Cellar color classes (Brian via Rachel, 2026-10-04), in menu order: the /menu Cellar chips and the color grouping of
 * the Cellar list on the phone and the TV. From wine_style_group() (migration 011: sparkling wins over color), plus:
 * a fortified wine is Other whatever its color. Other is everything else: sake, fruit wines (cranberry), and any
 * wine with no color on record. A chip shows only when a wine of that class is on tonight's menu.
 */
export const CELLAR_COLORS = ["Red", "White", "Rosé", "Sparkling", "Other"] as const;
export type CellarColor = (typeof CELLAR_COLORS)[number];
export function cellarColor(styleGroup: string | null | undefined, fortified?: boolean | null): CellarColor {
  if (styleGroup === "sparkling") return "Sparkling";
  if (fortified) return "Other";
  return styleGroup === "red" ? "Red" : styleGroup === "white" ? "White" : styleGroup === "rose" ? "Rosé" : "Other";
}
