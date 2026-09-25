import { notFound } from "next/navigation";
import { RecipeForm } from "@/components/admin/RecipeForm";
import { loadFamilies, loadGlassware, loadRecipeRow, loadSpecOptions } from "@/lib/admin-data";
import { RECIPE_UNITS } from "@/lib/admin-write";
import { isUuid } from "@/lib/db";

export const metadata = { title: "Edit recipe" };

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [recipe, specs, families, glassware] = await Promise.all([loadRecipeRow(id), loadSpecOptions(), loadFamilies(), loadGlassware()]);
  if (!recipe) notFound();
  const units = [...new Set([...RECIPE_UNITS, ...recipe.lines.map((l) => l.unit).filter((u): u is string => !!u)])];
  return <RecipeForm key={recipe.id} recipe={recipe} specs={specs} families={families} glassware={glassware} units={units} />;
}
