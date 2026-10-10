import { cookies } from "next/headers";
import { DecantBoard } from "@/components/admin/DecantBoard";
import { loadStock } from "@/lib/admin-data";
import { SEARCH, cleanSearch } from "@/lib/search-cookie";

export const dynamic = "force-dynamic";
export const metadata = { title: "Decanters" };

/** From the admin menu: which bottle is in each decanter. Cellar wines stay on Stock. */
export default async function DecantersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const saved = cleanSearch((await cookies()).get(SEARCH.decanters)?.value);
  const items = (await loadStock()).filter((item) => !item.wine);
  return (
    <>
      <h1 className="a-h1">Decanters</h1>
      <p className="a-hint a-decant-lead">Mark the bottle that is in each decanter. A recipe card names that decanter by its badge, such as Bourbon. Only a bottle that is in stock shows on the card.</p>
      <DecantBoard items={items} initialQuery={q !== undefined ? cleanSearch(q) : saved} />
    </>
  );
}
