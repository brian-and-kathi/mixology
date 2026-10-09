import { NextResponse } from "next/server";
import { UserError, adminApi } from "@/lib/admin-guard";
import { addShopping, clearDoneShopping, loadShopping, removeShopping, removeShoppingByLabel, setShoppingDone } from "@/lib/shopping";

export const GET = adminApi(async () => NextResponse.json({ items: await loadShopping() }));

/** Add `{ label }`, tick `{ id, done }`, remove `{ id, remove: true }` or `{ label, remove: true }`, or `{ clear: "done" }`. Always returns the list. */
export const POST = adminApi(async (req: Request) => {
  const body = (await req.json().catch(() => null)) as { label?: unknown; id?: unknown; done?: unknown; remove?: unknown; clear?: unknown } | null;
  if (!body) throw new UserError("Nothing to save.");
  if (body.clear === "done") await clearDoneShopping();
  else if (body.remove === true && body.id) await removeShopping(String(body.id));
  else if (body.remove === true) await removeShoppingByLabel(body.label);
  else if (typeof body.done === "boolean") await setShoppingDone(String(body.id ?? ""), body.done);
  else if ("label" in body) await addShopping(body.label);
  else throw new UserError("Nothing to save.");
  return NextResponse.json({ items: await loadShopping() });
});
