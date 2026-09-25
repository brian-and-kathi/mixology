import { IngredientsPanel } from "@/components/admin/IngredientsPanel";
import { loadFamilies, loadSpecOptions, loadSubstitutions } from "@/lib/admin-data";

export const metadata = { title: "Ingredients" };

export default async function IngredientsPage() {
  const [specs, families, subs] = await Promise.all([loadSpecOptions(), loadFamilies(), loadSubstitutions()]);
  return (
    <>
      <h1 className="a-h1">Ingredients</h1>
      <IngredientsPanel specs={specs} families={families} subs={subs} />
    </>
  );
}
