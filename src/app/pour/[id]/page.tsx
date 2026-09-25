import { notFound } from "next/navigation";
import { GlassIcon } from "@/components/GlassIcon";
import { PhoneShell } from "@/components/PhoneShell";
import { loadPour } from "@/lib/menu";

export const dynamic = "force-dynamic";

/**
 * Pour serve card (DESIGN §3.5): serve options, not a recipe. All three options are offered;
 * the ones the bottle is flagged for (serves_neat / serves_rocks) are highlighted.
 */
export default async function PourPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pour = await loadPour(id);
  if (!pour) notFound();

  const options = [
    { label: "Neat", suggested: pour.serves_neat },
    { label: "Rocks", suggested: pour.serves_rocks },
    { label: "With water", suggested: false },
  ];
  const details = [pour.brand && pour.brand !== pour.name ? pour.brand : null, pour.origin, pour.abv ? `${Number(pour.abv)}% ABV` : null].filter(Boolean);

  return (
    <PhoneShell title={pour.name} back={{ href: "/menu?tab=pours", label: "Pours" }} lead={<GlassIcon glass="rocks" className="glass-lg" />}>
      {details.length > 0 ? <p className="quiet">{details.join(" · ")}</p> : null}
      <section>
        <h2>How would you like it?</h2>
        <div className="chips">
          {options.map((o) => (
            <span key={o.label} className={o.suggested ? "chip chip-lg suggested" : "chip chip-lg"}>
              {o.label}
            </span>
          ))}
        </div>
        {options.some((o) => o.suggested) ? <p className="quiet small">Highlighted: how we usually pour it.</p> : null}
        {pour.serves_chilled ? <p className="quiet">Best served chilled.</p> : null}
      </section>
      {/* Guests only see notes and ratings that exist; no "No tasting note" filler. */}
      {pour.serve_note ? <p>{pour.serve_note}</p> : null}
      {pour.description ? (
        <section>
          <h2>Tasting note</h2>
          <p className="method">{pour.description}</p>
        </section>
      ) : null}
      {pour.rating ? (
        <section className="rating" aria-label={`Rated ${pour.rating} of 5`}>
          {"★".repeat(pour.rating)}
          <span className="quiet">{"★".repeat(Math.max(0, 5 - pour.rating))}</span>
        </section>
      ) : null}
    </PhoneShell>
  );
}
