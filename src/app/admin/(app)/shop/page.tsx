import { ShopList } from "@/components/admin/ShopList";
import { loadShopping } from "@/lib/shopping";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shopping list" };

/** Free-text list from the ☰ menu. Separate from the recipe To Buy list on Stock. */
export default async function ShopPage() {
  const items = await loadShopping();
  return (
    <>
      <h1 className="a-h1">Shopping list</h1>
      <ShopList initial={items} />
    </>
  );
}
