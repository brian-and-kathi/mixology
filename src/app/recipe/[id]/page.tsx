import { ClosedPage } from "@/components/ClosedPage";
import { guestGate, publicStatus } from "@/lib/bar-status";
import { notFound } from "next/navigation";
import { DrinkLead } from "@/components/DrinkLead";
import { FeaturedTag } from "@/components/FeaturedTag";
import { PhoneShell } from "@/components/PhoneShell";
import { RecipeScale, type ScaleLine } from "@/components/RecipeScale";
import { RateDrink } from "@/components/Rating";
import { isAdmin } from "@/lib/admin-guard";
import { altWords } from "@/lib/alt-words";
import { altGlassLine, glassLine, methodParts } from "@/lib/format";
import { bottleParts, loadLocked, loadRecipe, PHONE_DOT } from "@/lib/menu";
import { LockedPage } from "@/components/LockedPage";
import { MoodLine } from "@/components/MoodLine";
import { cleanMoods } from "@/lib/moods";
import { loadRating } from "@/lib/ratings";

export const dynamic = "force-dynamic";

/** Recipe card: glass + service, ingredients, method, then guest rating. */
export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Open/Closed (DESIGN §3.1): while Closed, guests get the closed page (admins get the page and the pill).
  const gate = await guestGate();
  const bar = publicStatus(gate);
  if (!gate.allowed) return <ClosedPage bar={bar} />;
  const recipe = await loadRecipe(id);
  if (!recipe) {
    // Reserved (migration 032): a cocktail that needs a reserved bottle shows only its name and occasion, even
    // when opened directly. No recipe, specs or method.
    const locked = await loadLocked("recipe", id);
    if (!locked) notFound();
    return <LockedPage locked={locked} bar={bar} back={{ href: "/menu?tab=cocktails", label: "Cocktails" }} editHref={(await isAdmin()) ? `/admin/recipes/${id}` : undefined} />;
  }
  // Only a link goes to the client, and only for a signed-in admin device.
  const [admin, rating] = await Promise.all([isAdmin(), loadRating("recipe", recipe.id)]);
  const editHref = admin ? `/admin/recipes/${recipe.id}` : undefined;

  const { label: methodLabel, paragraphs: method } = methodParts(recipe.description, recipe.method_style);
  // An optional ingredient that is out tonight (with no stand-in) is left off. Amounts stay as stored;
  // the slider scales them. Bottle lines are capped at 2 when the line has an alternate, same as before.
  const lines: ScaleLine[] = recipe.lines.filter((line) => line.required || line.available || line.use_instead).map((line) => {
    const or = altWords(line);
    return {
      position: line.position,
      amount: line.amount,
      unit: line.unit,
      name: line.name,
      available: line.available,
      required: line.required,
      useInstead: line.use_instead,
      note: line.note && !line.preferred ? line.note : null,
      parts: line.bottles ? bottleParts(line.bottles, PHONE_DOT, line.preferred, or.text ? 2 : 3, line.featured) : null,
      alternates: line.alternates,
    };
  });

  return (
    <PhoneShell bar={bar}
      title={recipe.name}
      titleBadge={recipe.featured ? <FeaturedTag /> : undefined}
      editHref={editHref}
      back={{ href: "/menu?tab=cocktails", label: "Cocktails" }}
      pinBack
      lead={<DrinkLead glass={recipe.glass ?? ""} kind="recipe" id={recipe.id} rating={rating} />}
    >
      {/* Moods (migration 033): the same quiet line as the TV cast card, under the name, above the glass line. */}
      <MoodLine moods={cleanMoods(recipe.moods)} className="drink-moods" />
      {recipe.glass ? (
        <section className="serve">
          <p>{glassLine(recipe.glass, recipe.service_style, recipe.glass_note)}</p>
          {recipe.alt_glass ? (
            <p className="quiet">{altGlassLine(recipe.alt_glass, recipe.alt_service_style, recipe.service_style)}</p>
          ) : null}
        </section>
      ) : null}

      {/* Pinned while the recipe scrolls. Servings scales the lines and, once cast, the TV. */}
      <RecipeScale id={recipe.id} glass={recipe.glass ?? ""} title={recipe.name} lines={lines} methodLabel={methodLabel} method={method} />

      <RateDrink kind="recipe" id={recipe.id} name={recipe.name} initial={rating} />
    </PhoneShell>
  );
}
