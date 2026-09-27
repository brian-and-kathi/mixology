import { cookies } from "next/headers";
import { loadStock } from "@/lib/admin-data";
import { BottleList } from "@/components/admin/BottleList";
import { SEARCH, cleanSearch } from "@/lib/search-cookie";

export const metadata = { title: "Bottles" };

export default async function BottlesPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const query = cleanSearch((await cookies()).get(SEARCH.bottles)?.value);
  const items = await loadStock();
  return <BottleList items={items} saved={saved} initialQuery={query} />;
}
