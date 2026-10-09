import { ShopList } from "@/components/admin/ShopList";
import { loadShopping } from "@/lib/shopping";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shopping list" };

/** Free-text list from the ☰ menu. To Buy on Stock can add a line here, or take it off. */
export default async function ShopPage() {
  const items = await loadShopping();
  return (
    <>
      <h1 className="a-h1">Shopping list</h1>
      <ShopList initial={items} />
    </>
  );
}
