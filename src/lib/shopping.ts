import { UserError } from "@/lib/admin-guard";
import { isUuid, query } from "@/lib/db";
import { shopKey } from "@/lib/shop-label";

/** One line on the admin shopping list. Order is oldest first, the way a paper list grows. */
export type ShopItem = { id: string; label: string; done: boolean };

const MAX = 120;

/** Collapse whitespace and reject a blank or oversized line. */
export function cleanLabel(raw: unknown): string {
  if (typeof raw !== "string") throw new UserError("Type what to buy.");
  const label = raw.trim().replace(/\s+/g, " ");
  if (!label) throw new UserError("Type what to buy.");
  if (label.length > MAX) throw new UserError("Keep it to 120 characters.");
  return label;
}

export async function loadShopping(): Promise<ShopItem[]> {
  return query<ShopItem>(`SELECT id::text AS id, label, done FROM shopping_items ORDER BY created_at, id`);
}

export async function addShopping(raw: unknown): Promise<ShopItem> {
  const rows = await query<ShopItem>(
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
