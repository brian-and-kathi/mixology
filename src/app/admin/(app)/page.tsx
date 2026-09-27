import { cookies } from "next/headers";
import { ClearTv } from "@/components/admin/ClearTv";
import { StockBoard } from "@/components/admin/StockBoard";
import { loadRecentChanges, loadStock } from "@/lib/admin-data";
import { SEARCH, cleanSearch } from "@/lib/search-cookie";

export const metadata = { title: "Stock" };

export default async function StockPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const saved = cleanSearch((await cookies()).get(SEARCH.stock)?.value);
  const [items, recent] = await Promise.all([loadStock(), loadRecentChanges()]);
  return (
    <>
      <ClearTv />
      <StockBoard items={items} recent={recent} initialQuery={q !== undefined ? cleanSearch(q) : saved} />
    </>
  );
}
