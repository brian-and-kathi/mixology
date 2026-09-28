import { cookies } from "next/headers";
import { RecipeList } from "@/components/admin/RecipeList";
import { loadRecipeStatus } from "@/lib/admin-data";
import { SEARCH, cleanSearch } from "@/lib/search-cookie";

export const metadata = { title: "Recipes" };

export default async function RecipesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const saved = cleanSearch((await cookies()).get(SEARCH.recipes)?.value);
  const recipes = await loadRecipeStatus();
  const on = recipes.filter((r) => r.on_menu).length;
  return (
    <>
      <h1 className="a-h1">Recipes</h1>
      <p className="a-quiet a-small">{on} of {recipes.length} on the menu tonight.</p>
      <RecipeList recipes={recipes} initialQuery={q !== undefined ? cleanSearch(q) : saved} />
    </>
  );
}
