import { ClosedPage } from "@/components/ClosedPage";
import { guestGate, publicStatus } from "@/lib/bar-status";
import { notFound } from "next/navigation";
import { DrinkLead } from "@/components/DrinkLead";
import { FeaturedTag } from "@/components/FeaturedTag";
import { PhoneShell } from "@/components/PhoneShell";
import { RateDrink } from "@/components/Rating";
import { isAdmin } from "@/lib/admin-guard";
import { cap, wineServeLine } from "@/lib/format";
import { loadWine, wineGlass } from "@/lib/menu";
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
  if (!wine) notFound();
  const [admin, rating] = await Promise.all([isAdmin(), loadRating("product", wine.id)]);
  const editHref = admin ? `/admin/bottles/${wine.id}` : undefined;

  const lower = wine.name.toLowerCase();
  const details = [
    wine.brand && !lower.includes(wine.brand.toLowerCase()) ? wine.brand : null,
    wine.origin,
    wine.type && !lower.includes(wine.type.toLowerCase()) ? cap(wine.type) : null,
    wine.abv && Number(wine.abv) > 0 ? `${Number(wine.abv)}%\u00a0ABV` : null,
  ].filter(Boolean);
  const serve = wineServeLine(wine.serves_chilled, wine.serves_neat, wine.serves_rocks);

  return (
    <PhoneShell bar={bar} title={wine.name} titleBadge={wine.featured ? <FeaturedTag /> : undefined} editHref={editHref} back={{ href: "/menu?tab=cellar", label: "Cellar" }}
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
