import Link from "next/link";
import { loadRecipeStatus } from "@/lib/admin-data";
import { cap } from "@/lib/format";

export const metadata = { title: "Recipes" };

export default async function RecipesPage() {
  const recipes = await loadRecipeStatus();
  const on = recipes.filter((r) => r.on_menu).length;
  return (
    <>
      <div className="a-titlebar">
        <h1 className="a-h1">Recipes</h1>
        <Link href="/admin/recipes/new" className="a-btn a-btn-primary">New recipe</Link>
      </div>
      <p className="a-quiet a-small">{on} of {recipes.length} on the menu tonight.</p>
      <ul className="a-list">
        {recipes.map((r) => (
          <li key={r.id}>
            <Link href={`/admin/recipes/${r.id}`} className="a-list-row">
              <span>{r.name}</span>
              <span className={r.on_menu ? "a-badge ok" : "a-badge"}>{r.on_menu ? "On the menu" : `Missing: ${r.missing.map(cap).join(", ")}`}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
