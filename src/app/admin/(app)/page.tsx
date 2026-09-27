import { ClearTv } from "@/components/admin/ClearTv";
import { Glance } from "@/components/admin/Glance";
import { StockBoard } from "@/components/admin/StockBoard";
import { Tonight } from "@/components/admin/Tonight";
import { loadGlance, loadRecentChanges, loadStock } from "@/lib/admin-data";
import { tonight } from "@/lib/night";

export const metadata = { title: "Stock" };

export default async function StockPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const night = tonight();
  const [items, recent, glance] = await Promise.all([loadStock(), loadRecentChanges(), loadGlance()]);
  return (
    <>
      <ClearTv />
      {night ? <Tonight night={night} /> : null}
      <Glance data={glance} />
      <StockBoard items={items} recent={recent} initialQuery={q ?? ""} />
    </>
  );
}
