import { notFound } from "next/navigation";
import { GlassIcon } from "@/components/GlassIcon";
import { PhoneShell } from "@/components/PhoneShell";
import { altGlassLine, cap, glassLine, measure } from "@/lib/format";
import { loadRecipe } from "@/lib/menu";

export const dynamic = "force-dynamic";

/** Recipe card: glass + service, ingredients, method, then rating (only when there is one). */
export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipe = await loadRecipe(id);
  if (!recipe) notFound();

  const method = (recipe.description ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <PhoneShell
      title={recipe.name}
      back={{ href: "/menu?tab=cocktails", label: "Cocktails" }}
      lead={recipe.glass ? <GlassIcon glass={recipe.glass} className="glass-lg" /> : null}
    >
      {recipe.glass ? (
        <section className="serve">
          <p>{glassLine(recipe.glass, recipe.service_style, recipe.glass_note)}</p>
          {recipe.alt_glass ? (
            <p className="quiet">{altGlassLine(recipe.alt_glass, recipe.alt_service_style, recipe.service_style)}</p>
          ) : null}
        </section>
      ) : null}

      <section>
        <h2>Ingredients</h2>
        <ul className="ingredients">
          {/* An optional ingredient that is out tonight (with no stand-in) is simply left off. */}
          {recipe.lines.filter((line) => line.required || line.available || line.use_instead).map((line) => (
            <li key={line.position}>
              <span className="measure">{measure(line.amount, line.unit)}</span>
              <span className="ingredient">
                <span className={line.available ? "" : "out"}>{cap(line.name)}</span>
                {!line.available ? <span className="tag-out">out tonight</span> : null}
                {line.use_instead ? <strong> (use {cap(line.use_instead)})</strong> : null}
                {!line.required ? <span className="quiet"> · optional</span> : null}
                {line.note ? <span className="quiet note">{line.note}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {method.length > 0 ? (
        <section>
          <h2>Method</h2>
          {method.map((p, i) => (
            <p key={i} className="method">{p}</p>
          ))}
        </section>
      ) : null}

      {recipe.rating ? (
        <section className="rating" aria-label={`Rated ${recipe.rating} of 5`}>
          {"★".repeat(recipe.rating)}
          <span className="quiet">{"★".repeat(Math.max(0, 5 - recipe.rating))}</span>
        </section>
      ) : null}
    </PhoneShell>
  );
}
