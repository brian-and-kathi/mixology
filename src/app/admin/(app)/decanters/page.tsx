import { cookies } from "next/headers";
import { DecantBoard } from "@/components/admin/DecantBoard";
import { loadStock } from "@/lib/admin-data";
import { SEARCH, cleanSearch } from "@/lib/search-cookie";

export const dynamic = "force-dynamic";
export const metadata = { title: "Decanters" };

/** Families that are never poured from a decanter, so they are not offered here. */
const NOT_DECANTED = new Set(["garnish", "mixer", "citrus", "sweetener", "bitter"]);

/** From the admin menu: which bottle is in each decanter. Cellar wines, garnishes, mixers, citrus, sweeteners, and bitters stay off this list. */
export default async function DecantersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const saved = cleanSearch((await cookies()).get(SEARCH.decanters)?.value);
  const items = (await loadStock()).filter((item) => !item.wine && !NOT_DECANTED.has(item.family.toLowerCase()));
  return (
    <>
      <h1 className="a-h1">Decanters</h1>
      <p className="a-hint a-decant-lead">Mark the bottle that is in each decanter. Only one bottle of an ingredient can be in at a time: bourbon and whiskey can both be in, and a second whiskey takes the first one out. A recipe card lists that bottle with (dec).</p>
      <DecantBoard items={items} initialQuery={q !== undefined ? cleanSearch(q) : saved} />
    </>
  );
}
