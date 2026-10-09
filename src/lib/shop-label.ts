/** Fold a shopping-list line so "Eggnog" and "eggnog" are the same item. */
export function shopKey(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}
