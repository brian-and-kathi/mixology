/**
 * The spec badge's text for a bottle: its primary ingredient (product_specs.is_primary, the link recipes
 * match on), sentence-cased: "rye" → "Rye", "sloe gin" → "Sloe gin", "melon liqueur" → "Melon liqueur".
 * No ingredient, no badge. Plain module so admin (client) and guest pages share it.
 */
export function specLabel(spec: string | null | undefined): string | null {
  const t = (spec ?? "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : null;
}
