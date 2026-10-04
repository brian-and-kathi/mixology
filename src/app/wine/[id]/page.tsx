import { ClosedPage } from "@/components/ClosedPage";
import { guestGate, publicStatus } from "@/lib/bar-status";
import { notFound } from "next/navigation";
import { DrinkLead } from "@/components/DrinkLead";
import { FeaturedTag } from "@/components/FeaturedTag";
import { PhoneShell } from "@/components/PhoneShell";
import { RateDrink } from "@/components/Rating";
import { isAdmin } from "@/lib/admin-guard";
import { cap, wineServeLine } from "@/lib/format";
import { loadLocked, loadWine, wineGlass } from "@/lib/menu";
import { LockedPage } from "@/components/LockedPage";
import { loadRating } from "@/lib/ratings";

export const dynamic = "force-dynamic";

/** Cellar wine card: same layout as the pour page. Wines aren't cast to the TV. */
export default async function WinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Open/Closed (DESIGN §3.1): while Closed, guests get the closed page (admins get the page and the pill).
  const gate = await guestGate();
  const bar = publicStatus(gate);
  if (!gate.allowed) return <ClosedPage bar={bar} />;
  const wine = await loadWine(id);
  if (!wine) {
    // Reserved (migration 032): a locked wine shows only its name and occasion, even when opened directly.
    const locked = await loadLocked("wine", id);
    if (!locked) notFound();
    return <LockedPage locked={locked} bar={bar} back={{ href: "/menu?tab=cellar", label: "Cellar" }} editHref={(await isAdmin()) ? `/admin/bottles/${id}` : undefined} />;
  }
  const [admin, rating] = await Promise.all([isAdmin(), loadRating("product", wine.id)]);
  const editHref = admin ? `/admin/bottles/${wine.id}` : undefined;

  const lower = wine.name.toLowerCase();
  // A grape (migration 031) is always the title badge, as on the Cellar, even when the name says it ("… Merlot 2020").
  // With no grape, the type stays in the detail line as before ("Sangria"), left out when the name says it.
  const grape = wine.grape?.trim() || null;
  const details = [
    wine.brand && !lower.includes(wine.brand.toLowerCase()) ? wine.brand : null,
    wine.origin,
    !grape && wine.type && !lower.includes(wine.type.toLowerCase()) ? cap(wine.type) : null,
    wine.abv && Number(wine.abv) > 0 ? `${Number(wine.abv)}%\u00a0ABV` : null,
  ].filter(Boolean);
  const serve = wineServeLine(wine.serves_chilled, wine.serves_neat, wine.serves_rocks);

  return (
    <PhoneShell bar={bar} title={wine.name} titleBadge={grape || wine.featured ? <span className="title-badges">{grape ? <span className="spec-badge title-badge">{grape}</span> : null}{wine.featured ? <FeaturedTag /> : null}</span> : undefined} editHref={editHref} back={{ href: "/menu?tab=cellar", label: "Cellar" }}
      lead={<DrinkLead glass={wineGlass(wine.sparkling, wine.type)} kind="product" id={wine.id} rating={rating} />}>
      {details.length > 0 ? <p className="quiet">{details.join(" · ")}</p> : null}
      {serve ? (
        <section>
          <h2>How it's served</h2>
          <p className="quiet">{serve}</p>
        </section>
      ) : null}
      {wine.serve_note ? <p>{wine.serve_note}</p> : null}
      {wine.description ? (
        <section>
          <h2>Tasting note</h2>
          <p className="method">{wine.description}</p>
        </section>
      ) : null}
      {wine.pairing_notes ? (
        <section>
          <h2>Pairs with</h2>
          <p className="method">{wine.pairing_notes.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(" · ")}</p>
        </section>
      ) : null}
      <RateDrink kind="product" id={wine.id} name={wine.name} initial={rating} />
    </PhoneShell>
  );
}
