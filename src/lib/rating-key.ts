/**
 * Key into loadAllRatings() (lib/ratings) for a menu section's item: Pours and Cellar wines are rated as
 * bottles ("product"), cocktails as recipes. Kept apart from lib/ratings so client components can use it.
 */
export const ratingKey = (section: string, id: string) => `${section === "cocktails" ? "recipe" : "product"}:${id}`;
