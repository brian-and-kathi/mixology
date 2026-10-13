import { ClosedPage } from "@/components/ClosedPage";
import { guestGate, publicStatus } from "@/lib/bar-status";
import { notFound } from "next/navigation";
import { CastButton } from "@/components/CastButton";
import { DecanterSeal } from "@/components/DecanterSeal";
import { DrinkLead } from "@/components/DrinkLead";
import { FeaturedTag } from "@/components/FeaturedTag";
import { PhoneShell } from "@/components/PhoneShell";
import { RateDrink } from "@/components/Rating";
import { isAdmin } from "@/lib/admin-guard";
import { abvLabel, serveLine } from "@/lib/format";
import { loadLocked, loadPour } from "@/lib/menu";
import { LockedPage } from "@/components/LockedPage";
import { loadRating } from "@/lib/ratings";
import { spelledOrigin } from "@/lib/us-states";

export const dynamic = "force-dynamic";

/** Pour serve card (DESIGN §3.5): how it is usually served, as plain text (not a choice). */
export default async function PourPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Open/Closed (DESIGN §3.1): while Closed, guests get the closed page (admins get the page and the pill).
  const gate = await guestGate();
  const bar = publicStatus(gate);
  if (!gate.allowed) return <ClosedPage bar={bar} />;
  const pour = await loadPour(id);
  if (!pour) {
    // Reserved (migration 032): a locked pour shows only its name and occasion, even when opened directly.
    const locked = await loadLocked("pour", id);
    if (!locked) notFound();
    return <LockedPage locked={locked} bar={bar} back={{ href: "/menu?tab=pours", label: "Pours" }} editHref={(await isAdmin()) ? `/admin/bottles/${id}` : undefined} />;
  }
  // Only a link goes to the client, and only for a signed-in admin device.
  const [admin, rating] = await Promise.all([isAdmin(), loadRating("product", pour.id)]);
  const editHref = admin ? `/admin/bottles/${pour.id}` : undefined;

  // Origin: stored "City, ST", shown "City, State" like the board (display only, Vincent 2026-10-06).
  const abv = abvLabel(pour.abv).replace(/ /g, "\u00a0");
  const details = [pour.brand && pour.brand !== pour.full_name ? pour.brand : null, spelledOrigin(pour.origin) || null, abv || null].filter(Boolean);

  return (
    // Title: the short name; the type badge always sits on its own line under it, so the title keeps the full width.
    <PhoneShell bar={bar} title={pour.name} titleBadge={pour.spec || pour.featured ? <span className="title-badges">{pour.spec ? <span className="spec-badge title-badge">{pour.spec}</span> : null}{pour.featured ? <FeaturedTag /> : null}</span> : undefined} mark={pour.decanting ? <DecanterSeal label={pour.decanterLabel} /> : undefined} editHref={editHref} back={{ href: "/menu?tab=pours", label: "Pours" }} lead={<DrinkLead glass="rocks" kind="product" id={pour.id} rating={rating} />}>
      {details.length > 0 ? <p className="quiet">{details.join(" · ")}</p> : null}
      <CastButton type="pour" id={pour.id} barOpen={bar.open} />
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
