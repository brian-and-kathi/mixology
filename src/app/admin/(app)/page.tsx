import { cookies } from "next/headers";
import { ClearTv } from "@/components/admin/ClearTv";
import { Glance } from "@/components/admin/Glance";
import { StockBoard } from "@/components/admin/StockBoard";
import { loadGlance, loadRecentChanges, loadStock } from "@/lib/admin-data";
import { SEARCH, cleanSearch } from "@/lib/search-cookie";

export const metadata = { title: "Stock" };

export default async function StockPage({ searchParams }: { searchParams: Promise<{ q?: string; saved?: string }> }) {
  const { q, saved: savedBottle } = await searchParams;
  const saved = cleanSearch((await cookies()).get(SEARCH.stock)?.value);
  const [items, recent, glance] = await Promise.all([loadStock(), loadRecentChanges(), loadGlance()]);
  return (
    <>
      {/* After a bottle save (BottleForm redirects here with ?saved=), as the Bottles list did. */}
      {savedBottle ? <p className="a-ok" role="status">Saved {savedBottle}.</p> : null}
      {/* At a glance: collapsed at the top, above search (it scrolls away; the search bar and family headers stick). */}
      <Glance data={glance} />
      <ClearTv />
      <StockBoard items={items} recent={recent} initialQuery={q !== undefined ? cleanSearch(q) : saved} />
    </>
  );
}
