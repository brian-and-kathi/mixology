import { AutoRefresh } from "@/components/AutoRefresh";
import { MenuQr } from "@/components/MenuQr";
import { TvBoard } from "@/components/TvBoard";
import { BAR_NAME } from "@/lib/brand";
import { loadMenu, SECTIONS } from "@/lib/menu";
import { commitHash } from "@/lib/version";

export const dynamic = "force-dynamic";

/** TV billboard: names only, three sections in fixed order, no interactive chrome. */
export default async function TvPage() {
  const menu = await loadMenu().catch(() => null);
  // Empty sections are omitted entirely (DESIGN §5.1).
  const columns = menu
    ? SECTIONS.map((s) => ({ id: s.id, label: s.label, items: menu[s.id] })).filter((c) => c.items.length > 0)
    : [];

  return (
    <div className="tv">
      {/* The TV is a billboard: hide the mouse cursor on this route only. */}
      <style>{"html, body { cursor: none; overflow: hidden; }"}</style>
      <AutoRefresh seconds={60} />
      <span className="tv-hash" aria-label={`Build ${commitHash()}`}>{commitHash()}</span>
      <header className="tv-header">
        <h1 className="wordmark tv-wordmark">{BAR_NAME}</h1>
        <MenuQr />
      </header>
      {!menu ? (
        <p className="tv-empty">Menu unavailable</p>
      ) : columns.length === 0 ? (
        <p className="tv-empty">Nothing available tonight</p>
      ) : (
        <TvBoard columns={columns} />
      )}
    </div>
  );
}
