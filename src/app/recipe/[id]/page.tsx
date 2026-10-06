import { ClosedPage } from "@/components/ClosedPage";
import { guestGate, publicStatus } from "@/lib/bar-status";
import { notFound } from "next/navigation";
import { CastButton } from "@/components/CastButton";
import { DrinkLead } from "@/components/DrinkLead";
import { FeaturedTag } from "@/components/FeaturedTag";
import { PhoneShell } from "@/components/PhoneShell";
import { RecipePin } from "@/components/RecipePin";
import { RateDrink } from "@/components/Rating";
import { isAdmin } from "@/lib/admin-guard";
import { altGlassLine, cap, glassLine, lineText, methodParts } from "@/lib/format";
import { altWords, bottleParts, loadLocked, loadRecipe, PHONE_DOT } from "@/lib/menu";
import { AltOr } from "@/components/AltOr";
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

      {/* Pinned while the recipe scrolls; once pinned it shows a small glass and the name beside the button. */}
      <RecipePin glass={recipe.glass ?? ""} title={recipe.name}>
        <CastButton type="recipe" id={recipe.id} />
      </RecipePin>

      <section>
        <h2>Ingredients</h2>
        <ul className="ingredients">
          {/* An optional ingredient that is out tonight (with no stand-in) is simply left off. */}
          {recipe.lines.filter((line) => line.required || line.available || line.use_instead).map((line) => {
            // Alternates (migration 034): the in-stock ones after the leading ingredient, muted, same line.
            const or = altWords(line);
            return (
            <li key={line.position}>
              <span className="measure">{lineText(line.amount, line.unit, line.name).amount}</span>
              <span className="ingredient">
                <span className={line.available ? "" : "out"}>{lineText(line.amount, line.unit, line.name).name}</span>
                {or.text ? <AltOr text={or.text} more={or.more} /> : null}
                {!line.available ? <span className="tag-out">out tonight</span> : null}
                {line.use_instead ? <strong> (use {cap(line.use_instead)})</strong> : null}
                {!line.required ? <span className="quiet"> (optional)</span> : null}
                {line.bottles ? (
                  <span className="quiet bottles">
                    {/* A featured bottle (migration 030) is copper with the tag, and listed first. */}
                    {/* With alternates the leading ingredient's bottles stop at 2 + "+N more", so the line stays short. */}
                    {bottleParts(line.bottles, PHONE_DOT, line.preferred, or.text ? 2 : 3, line.featured).map((part, i) =>
                      part.featured ? <span key={i}><span className="feat-name">{part.text}</span><FeaturedTag /></span> : part.text)}
                  </span>
                ) : null}
                {/* A "Grand Marnier preferred" note is already in the bottle line as "Grand Marnier (preferred)". */}
                {line.note && !line.preferred ? <span className="quiet note">{line.note}</span> : null}
                {or.notes.map((n, i) => <span key={i} className="quiet note">{n}</span>)}
              </span>
            </li>
            );
          })}
        </ul>
      </section>

      {method.length > 0 ? (
        <section>
          <h2>{methodLabel}</h2>
          {method.map((p, i) => (
            <p key={i} className="method">{p}</p>
          ))}
        </section>
      ) : null}

      <RateDrink kind="recipe" id={recipe.id} name={recipe.name} initial={rating} />
    </PhoneShell>
  );
}
