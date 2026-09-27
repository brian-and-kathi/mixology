import { AutoRefresh } from "@/components/AutoRefresh";
import { Frame } from "@/components/Frame";
import { MenuQr } from "@/components/MenuQr";
import { TvBoard } from "@/components/TvBoard";
import { TvCastLayer } from "@/components/TvCast";
import { BAR_NAME } from "@/lib/brand";
import { loadMenu, SECTIONS } from "@/lib/menu";
import { loadAllRatings } from "@/lib/ratings";
import { commitHash } from "@/lib/version";

export const dynamic = "force-dynamic";

/** TV billboard: names only, three sections in fixed order, no interactive chrome. */
export default async function TvPage() {
  // Guest ratings for the board, one query; refreshed with the page (AutoRefresh). Never blocks the menu.
  const [menu, ratings] = await Promise.all([loadMenu().catch(() => null), loadAllRatings().catch(() => ({}))]);
  // Empty sections are omitted entirely (DESIGN §5.1).
  const columns = menu
    ? SECTIONS.map((s) => ({ id: s.id, label: s.label, items: menu[s.id] })).filter((c) => c.items.length > 0)
    : [];

  return (
    <>
    <TvCastLayer>
      <style>{"html, body { overflow: hidden; }"}</style>
      <AutoRefresh seconds={60} topic="bar:menu" />
      <header className="tv-header">
        <h1 className="wordmark tv-wordmark">{BAR_NAME}</h1>
        <MenuQr above={<span className="tv-hash" aria-label={`Build ${commitHash()}`}>{commitHash()}</span>} />
      </header>
      {!menu ? (
        <p className="tv-empty">Menu unavailable</p>
      ) : columns.length === 0 ? (
        <p className="tv-empty">Nothing available tonight</p>
      ) : (
        <TvBoard columns={columns} ratings={ratings} />
      )}
    </TvCastLayer>
    <Frame />
    </>
  );
}
