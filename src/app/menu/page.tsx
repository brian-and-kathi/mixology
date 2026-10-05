import { ClosedPage } from "@/components/ClosedPage";
import { guestGate, publicStatus } from "@/lib/bar-status";
import { AutoRefresh } from "@/components/AutoRefresh";
import { MenuBrowser } from "@/components/MenuBrowser";
import { PhoneShell } from "@/components/PhoneShell";
import { isAdmin } from "@/lib/admin-guard";
import { barVersions } from "@/lib/bar-versions";
import { loadMenu, SECTIONS } from "@/lib/menu";
import type { BrowseSection, Facet } from "@/lib/menu-filter";
import { loadMenuFacets } from "@/lib/menu-search";
import { ratingKey } from "@/lib/rating-key";
import { loadAllRatings } from "@/lib/ratings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Menu" };

const NOUNS = { pours: ["pour", "pours"], cocktails: ["cocktail", "cocktails"], cellar: ["wine", "wines"] } as const;
const NO_FACET: Facet = { moods: [], chip: null, grape: null, notes: [] };

/**
 * Phone guest menu: the same sections and order as the TV, with search and filters (components/MenuBrowser,
 * 2026-10-04). Tabs: All plus one per non-empty section (?tab=pours|cocktails|cellar opens on that section).
 */
export default async function MenuPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  // Open/Closed (DESIGN §3.1): while Closed, guests get the closed page (admins get the page and the pill).
  const gate = await guestGate();
  const bar = publicStatus(gate);
  if (!gate.allowed) return <ClosedPage bar={bar} />;
  // Read before the menu, so a change during the render counts as newer (AutoRefresh).
  const version = await barVersions().catch(() => null);
  // Guest ratings, the TV board's single query and rounding; a failure just shows no ratings. Facets (moods,
  // section chips, searchable notes; migration 033): a failure just means plain search and no chips.
  const [menu, ratings, facets, admin] = await Promise.all([
    loadMenu().catch(() => null),
    loadAllRatings().catch((): Record<string, number> => ({})),
    loadMenuFacets().catch((): Record<string, Facet> => ({})),
    isAdmin(),
  ]);
  if (!menu) {
    return (
      <PhoneShell bar={bar} admin={admin}>
        <p className="notice">The menu can&apos;t be loaded right now. Try again in a minute.</p>
      </PhoneShell>
    );
  }
  const sections: BrowseSection[] = SECTIONS.filter((s) => menu[s.id].length > 0).map((s) => ({
    id: s.id,
    label: s.label,
    noun: [NOUNS[s.id][0], NOUNS[s.id][1]],
    items: menu[s.id].map((item) => {
      // The TV-only fields stay on the server.
      const { fit: _fit, measure: _measure, originTv: _originTv, abv: _abv, ...rest } = item;
      return { ...rest, facet: facets[`${s.id}:${item.id}`] ?? NO_FACET, rating: ratings[ratingKey(s.id, item.id)] ?? null };
    }),
  }));
  if (sections.length === 0) {
    return (
      <PhoneShell bar={bar} admin={admin}>
        <p className="notice">Nothing available tonight.</p>
      </PhoneShell>
    );
  }
  const initialTab = sections.find((s) => s.id === tab)?.id ?? "all";

  return (
    <PhoneShell bar={bar} admin={admin}>
      {/* Live updates only while the relay is on (no polling from phones otherwise). */}
      <AutoRefresh topic="bar:menu" version={version?.menu ?? null} />
      <MenuBrowser sections={sections} initialTab={initialTab} />
    </PhoneShell>
  );
}
