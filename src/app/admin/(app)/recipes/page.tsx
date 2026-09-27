import Link from "next/link";
import { RecipeList } from "@/components/admin/RecipeList";
import { loadRecipeStatus } from "@/lib/admin-data";

export const metadata = { title: "Recipes" };

export default async function RecipesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const recipes = await loadRecipeStatus();
  const on = recipes.filter((r) => r.on_menu).length;
  return (
    <>
      <div className="a-titlebar">
        <h1 className="a-h1">Recipes</h1>
        <Link href="/admin/recipes/new" className="a-btn a-btn-primary">New recipe</Link>
      </div>
      <p className="a-quiet a-small">{on} of {recipes.length} on the menu tonight.</p>
      <RecipeList recipes={recipes} initialQuery={q ?? ""} />
    </>
  );
}
