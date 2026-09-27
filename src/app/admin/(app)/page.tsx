import { ClearTv } from "@/components/admin/ClearTv";
import { StockBoard } from "@/components/admin/StockBoard";
import { loadRecentChanges, loadStock } from "@/lib/admin-data";

export const metadata = { title: "Stock" };

export default async function StockPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const [items, recent] = await Promise.all([loadStock(), loadRecentChanges()]);
  return (
    <>
      <ClearTv />
      <StockBoard items={items} recent={recent} initialQuery={q ?? ""} />
    </>
  );
}
