import { ClearTv } from "@/components/admin/ClearTv";
import { Glance } from "@/components/admin/Glance";
import { StockBoard } from "@/components/admin/StockBoard";
import { loadGlance, loadRecentChanges, loadStock } from "@/lib/admin-data";

export const metadata = { title: "Stock" };

export default async function StockPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const [items, recent, glance] = await Promise.all([loadStock(), loadRecentChanges(), loadGlance()]);
  return (
    <>
      <ClearTv />
      <Glance data={glance} />
      <StockBoard items={items} recent={recent} initialQuery={q ?? ""} />
    </>
  );
}
