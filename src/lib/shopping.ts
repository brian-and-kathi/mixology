import { UserError } from "@/lib/admin-guard";
import { isUuid, query } from "@/lib/db";
import { shopKey } from "@/lib/shop-label";

/** One line on the admin shopping list. Order is oldest first, the way a paper list grows. `doubleCheck` is true when the same name is already in stock. */
export type ShopItem = { id: string; label: string; done: boolean; doubleCheck: boolean };

const MAX = 120;

/** Collapse whitespace and reject a blank or oversized line. */
export function cleanLabel(raw: unknown): string {
  if (typeof raw !== "string") throw new UserError("Type what to buy.");
  const label = raw.trim().replace(/\s+/g, " ");
  if (!label) throw new UserError("Type what to buy.");
  if (label.length > MAX) throw new UserError("Keep it to 120 characters.");
  return label;
}

/** Names of what is on the shelf: the bottle, its short name, and each linked ingredient, including another name for that ingredient. */
async function inStockKeys(): Promise<Set<string>> {
  const rows = await query<{ name: string | null }>(
    `SELECT p.display_name AS name FROM products p WHERE p.in_stock
     UNION ALL
     SELECT NULLIF(btrim(p.short_name), '') FROM products p WHERE p.in_stock
     UNION ALL
     SELECT s.canonical_name FROM products p
       JOIN product_specs ps ON ps.product_id = p.id
       JOIN specs s ON s.id = ps.spec_id
      WHERE p.in_stock
     UNION ALL
     SELECT a.alias FROM products p
       JOIN product_specs ps ON ps.product_id = p.id
       JOIN spec_aliases a ON a.spec_id = ps.spec_id
      WHERE p.in_stock`,
  );
  const keys = new Set<string>();
  for (const row of rows) if (row.name) keys.add(shopKey(row.name));
  return keys;
}

export async function loadShopping(): Promise<ShopItem[]> {
  const [items, stocked] = await Promise.all([
    query<{ id: string; label: string; done: boolean }>(`SELECT id::text AS id, label, done FROM shopping_items ORDER BY created_at, id`),
    inStockKeys(),
  ]);
  return items.map((item) => ({ ...item, doubleCheck: stocked.has(shopKey(item.label)) }));
}

export async function addShopping(raw: unknown): Promise<{ id: string; label: string; done: boolean }> {
  const rows = await query<{ id: string; label: string; done: boolean }>(
    `INSERT INTO shopping_items (label) VALUES ($1) RETURNING id::text AS id, label, done`,
    [cleanLabel(raw)],
  );
  return rows[0];
}

export async function setShoppingDone(id: string, done: boolean): Promise<void> {
  if (!isUuid(id)) throw new UserError("That item isn't on the list.");
  const rows = await query<{ id: string }>(`UPDATE shopping_items SET done = $2 WHERE id = $1::uuid RETURNING id::text AS id`, [id, done]);
  if (!rows[0]) throw new UserError("That item isn't on the list.");
}

export async function removeShopping(id: string): Promise<void> {
  if (!isUuid(id)) throw new UserError("That item isn't on the list.");
  await query(`DELETE FROM shopping_items WHERE id = $1::uuid`, [id]);
}

/** Drop every line that reads as the same item, including a different capital letter. Missing is fine. */
export async function removeShoppingByLabel(raw: unknown): Promise<void> {
  const key = shopKey(cleanLabel(raw));
  const ids = (await loadShopping()).filter((item) => shopKey(item.label) === key).map((item) => item.id);
  if (!ids.length) return;
  await query(`DELETE FROM shopping_items WHERE id = ANY($1::uuid[])`, [ids]);
}

export async function clearDoneShopping(): Promise<void> {
  await query(`DELETE FROM shopping_items WHERE done`);
}
