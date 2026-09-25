/**
 * Pours are grouped by spirit family, in this order (no headers; a slightly larger gap between groups):
 * 1 Whiskey · 2 Gin · 3 Rum · 4 Agave · 5 Brandy · 6 Other spirits · 7 Liqueurs.
 *
 * The family is derived from the bottle's primary ingredient (product_specs.is_primary, the spec recipes
 * match on), never stored per bottle. Every ingredient already belongs to one primary ingredient family in
 * the data (spec_families.is_primary, enforced by a trigger), so the mapping is:
 *   1. overrides by ingredient name, where the guest-facing group differs from the data's family (only ouzo);
 *   2. otherwise the ingredient family's slug;
 *   3. anything unmapped (or no ingredient) falls into Other spirits.
 * spec_label (badge text) is display only and does not change the family.
 * Rachel's rules (2026-09-25): a flavored spirit sits with its base spirit whatever its ABV (coconut rum is
 * Rum, vanilla vodka is Other spirits); Liqueurs holds only liqueurs by category (amaretto, orange, melon,
 * sloe gin, cream, coffee, schnapps, Aperol, Campari). Vodka and absinthe are Other spirits (no Vodka group).
 */
export const SPIRIT_FAMILIES = ["Whiskey", "Gin", "Rum", "Agave", "Brandy", "Other spirits", "Liqueurs"] as const;

const OTHER = 5;

/** Overrides by primary ingredient (specs.canonical_name, lower case). */
const BY_INGREDIENT: Record<string, number> = {
  ouzo: 5, // a distilled anise spirit, not a liqueur (the data files the ingredient under liqueur)
};

/** By the ingredient's primary family (families.slug). */
const BY_FAMILY: Record<string, number> = {
  whiskey: 0,
  gin: 1,
  rum: 2,
  "tequila-agave": 3,
  brandy: 4,
  vodka: 5,
  absinthe: 5,
  aquavit: 5,
  liqueur: 6,
  bitter: 6,
};

/** Family index (0-6, see SPIRIT_FAMILIES) for a bottle's primary ingredient and that ingredient's family slug. */
export function spiritFamily(ingredient: string | null | undefined, familySlug: string | null | undefined): number {
  const key = (ingredient ?? "").trim().toLowerCase();
  return BY_INGREDIENT[key] ?? BY_FAMILY[(familySlug ?? "").trim()] ?? OTHER;
}
