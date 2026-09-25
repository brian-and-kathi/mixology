import { RecipeForm } from "@/components/admin/RecipeForm";
import { loadFamilies, loadGlassware, loadSpecOptions } from "@/lib/admin-data";
import { RECIPE_UNITS } from "@/lib/admin-write";

export const metadata = { title: "New recipe" };

export default async function NewRecipePage() {
  const [specs, families, glassware] = await Promise.all([loadSpecOptions(), loadFamilies(), loadGlassware()]);
  return <RecipeForm recipe={null} specs={specs} families={families} glassware={glassware} units={RECIPE_UNITS} />;
}
