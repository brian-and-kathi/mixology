import { loadStock } from "@/lib/admin-data";
import { BottleList } from "@/components/admin/BottleList";

export const metadata = { title: "Bottles" };

export default async function BottlesPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const items = await loadStock();
  return <BottleList items={items} saved={saved} />;
}
