import { KeyIcon } from "@/components/ReservedIcon";
import { PhoneShell } from "@/components/PhoneShell";
import type { BarView } from "@/components/BarWatch";
import type { Locked } from "@/lib/menu";

/**
 * A reserved drink's page (migration 032): the name, the occasion if there is one ("Saved for Kathi's 50th")
 * and "Reserved". Nothing else: no recipe, specs, serve, method, rating or Show on TV. The same page answers
 * a direct visit to the recipe, pour or wine URL, so nothing leaks from there either.
 */
export function LockedPage({ locked, bar, back, editHref }: { locked: Locked; bar: BarView; back: { href: string; label: string }; editHref?: string }) {
  return (
    <PhoneShell bar={bar} title={locked.name} editHref={editHref} back={back}
      lead={<div className="lead locked-lead"><KeyIcon className="locked-key" /></div>}>
      <section className="locked">
        {locked.note ? <p className="locked-note">Saved for {locked.note}</p> : null}
        <p className="locked-ask">Reserved</p>
      </section>
    </PhoneShell>
  );
}
