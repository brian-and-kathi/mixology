"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StockItem } from "@/lib/admin-data";
import { KindSwitch, useAdminKind } from "./KindSwitch";
import { useRememberedSearch } from "./useRememberedSearch";
import { SEARCH } from "@/lib/search-cookie";
import { Disclosure } from "./Disclosure";
import { specLabel } from "@/lib/spec-label";
import { api } from "./api";
import { StockRow } from "./StockToggle";

const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

/**
 * Bottles, split Spirits | Wines like Stock. Wines: in-stock first, out wines folded into a quiet
 * "Out · N" section (opens by itself when a search matches one). Adding bottles is in /db (Products);
 * /admin/bottles/new stays for the phone share target.
 * Each row starts with the shared In/Out toggle, which flips stock in place through the same
 * POST /api/admin/stock as Stock (optimistic, rolled back on error); the rest of the row opens the bottle.
 */
export function BottleList({ items, saved, initialQuery = "" }: { items: StockItem[]; saved?: string; initialQuery?: string }) {
  const [q, setQ] = useRememberedSearch(SEARCH.bottles, initialQuery);
  const [kind, setKindRaw] = useAdminKind();
  const [outOpen, setOutOpen] = useState<boolean | null>(null);
  const router = useRouter();
  const [override, setOverride] = useState<Record<string, boolean>>({});
  // Wines stay in the section they were in when first flipped this visit, so a row never jumps away
  // under your thumb (same rule as Stock).
  const [pinned, setPinned] = useState<Record<string, boolean>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const setKind = (k: typeof kind) => {
    setKindRaw(k);
    setOutOpen(null);
    setPinned({});
  };
  const stockOf = (i: StockItem) => override[i.id] ?? i.in_stock;
  async function flip(i: StockItem, to: boolean) {
    if (i.wine) setPinned((p) => (i.id in p ? p : { ...p, [i.id]: stockOf(i) }));
    setOverride((o) => ({ ...o, [i.id]: to }));
    setRowError(({ [i.id]: _gone, ...rest }) => rest);
    navigator.vibrate?.(10);
    try {
      await api("/api/admin/stock", "POST", { id: i.id, in_stock: to });
      router.refresh();
    } catch (e) {
      setOverride((o) => ({ ...o, [i.id]: !to }));
      setRowError((m) => ({ ...m, [i.id]: e instanceof Error ? e.message : "Couldn't save." }));
    }
  }
  const wines = kind === "wines";
  const needle = fold(q.trim());
  const shown = items.filter((i) => i.wine === wines && (!needle || fold(i.name).includes(needle) || fold(i.spec ?? "").includes(needle)));
  const shelf = (i: StockItem) => pinned[i.id] ?? stockOf(i);
  const main = wines ? shown.filter(shelf) : shown;
  const out = wines ? shown.filter((i) => !shelf(i)) : [];
  const outExpanded = outOpen ?? (needle !== "" && out.length > 0);
  const row = (i: StockItem) => (
    <StockRow key={i.id} id={i.id} name={i.name} inStock={stockOf(i)} error={rowError[i.id]} onToggle={(to) => void flip(i, to)}>
      {/* The badge as guests see it on Pours ("Rye", or the bottle's own label); no type: the family. */}
      <span className="a-quiet a-small"> · {specLabel(i.spec, i.label) ?? i.family}</span>
    </StockRow>
  );
  return (
    <>
      <h1 className="a-h1">Bottles</h1>
      {saved ? <p className="a-ok" role="status">Saved {saved}.</p> : null}
      <KindSwitch kind={kind} onChange={setKind} />
      <div className="a-search">
        <input type="search" value={q} onChange={(e) => { setQ(e.target.value); if (outOpen === false) setOutOpen(null); }} placeholder={wines ? "Search wines" : "Search spirits"} aria-label={wines ? "Search wines" : "Search spirits"} />
        {q ? <button type="button" className="a-clear" onClick={() => setQ("")} aria-label="Clear search">×</button> : null}
      </div>
      <ul className="a-list">{main.map(row)}</ul>
      {out.length > 0 ? (
        <section className="a-outsec" aria-label="Out wines">
          <Disclosure headClassName="a-outsec-head" id="out-bottles" open={outExpanded} onOpenChange={setOutOpen} summary={<>Out · {out.filter((i) => !stockOf(i)).length}</>}>
            <ul className="a-list">{out.map(row)}</ul>
          </Disclosure>
        </section>
      ) : null}
      {shown.length === 0 ? <p className="a-quiet">{wines ? (needle ? "No wines match." : "No wines yet.") : "No bottles match."}</p> : null}
    </>
  );
}
