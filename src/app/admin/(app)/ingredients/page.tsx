import { cookies } from "next/headers";
import { IngredientsPanel } from "@/components/admin/IngredientsPanel";
import { loadFamilies, loadSpecOptions, loadSubstitutions } from "@/lib/admin-data";
import { SEARCH, cleanSearch } from "@/lib/search-cookie";

export const metadata = { title: "Ingredients" };

export default async function IngredientsPage() {
  const query = cleanSearch((await cookies()).get(SEARCH.ingredients)?.value);
  const [specs, families, subs] = await Promise.all([loadSpecOptions(), loadFamilies(), loadSubstitutions()]);
  return (
    <>
      <h1 className="a-h1">Ingredients</h1>
      <IngredientsPanel specs={specs} families={families} subs={subs} initialQuery={query} />
    </>
  );
}
