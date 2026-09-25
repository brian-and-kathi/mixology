import { notFound } from "next/navigation";
import { CastButton } from "@/components/CastButton";
import { DrinkLead } from "@/components/DrinkLead";
import { PhoneShell } from "@/components/PhoneShell";
import { BadgedName } from "@/components/SpecBadge";
import { RateDrink } from "@/components/Rating";
import { isAdmin } from "@/lib/admin-guard";
import { serveLine } from "@/lib/format";
import { loadPour } from "@/lib/menu";
import { loadRating } from "@/lib/ratings";

export const dynamic = "force-dynamic";

/** Pour serve card (DESIGN §3.5): how it is usually served, as plain text (not a choice). */
export default async function PourPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pour = await loadPour(id);
  if (!pour) notFound();
  // Only a link goes to the client, and only for a signed-in admin device.
  const [admin, rating] = await Promise.all([isAdmin(), loadRating("product", pour.id)]);
  const editHref = admin ? `/admin/bottles/${pour.id}` : undefined;

  const details = [pour.brand && pour.brand !== pour.full_name ? pour.brand : null, pour.origin, pour.abv ? `${Number(pour.abv)}%\u00a0ABV` : null].filter(Boolean);

  return (
    // Title: the short name with the type badge after it, as on Pours ("Bowright Recurve [Rye]").
    <PhoneShell title={<BadgedName name={pour.name} spec={pour.spec} />} editHref={editHref} back={{ href: "/menu?tab=pours", label: "Pours" }} lead={<DrinkLead glass="rocks" kind="product" id={pour.id} rating={rating} />}>
      {details.length > 0 ? <p className="quiet">{details.join(" · ")}</p> : null}
      <CastButton type="pour" id={pour.id} />
      <section>
        <h2>How it's served</h2>
        <p className="quiet">{serveLine(pour.serves_neat, pour.serves_rocks, pour.serves_chilled)}</p>
      </section>
      {/* Guests only see notes that exist; no "No tasting note" filler. */}
      {pour.serve_note ? <p>{pour.serve_note}</p> : null}
      {pour.description ? (
        <section>
          <h2>Tasting note</h2>
          <p className="method">{pour.description}</p>
        </section>
      ) : null}
      <RateDrink kind="product" id={pour.id} name={pour.name} initial={rating} />
    </PhoneShell>
  );
}
