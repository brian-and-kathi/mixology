"use client";

import Link from "next/link";
import { useState } from "react";
import type { StockItem } from "@/lib/admin-data";
import { KindSwitch, useAdminKind } from "./KindSwitch";
import { Disclosure } from "./Disclosure";

const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

/**
 * Bottles, split Spirits | Wines like Stock. Wines: in-stock first, out wines folded into a quiet
 * "Out · N" section (opens by itself when a search matches one). "Add wine" preselects a wine type.
 */
export function BottleList({ items, saved }: { items: StockItem[]; saved?: string }) {
  const [q, setQ] = useState("");
  const [kind, setKindRaw] = useAdminKind();
  const [outOpen, setOutOpen] = useState<boolean | null>(null);
  const setKind = (k: typeof kind) => {
    setKindRaw(k);
    setOutOpen(null);
  };
  const wines = kind === "wines";
  const needle = fold(q.trim());
  const shown = items.filter((i) => i.wine === wines && (!needle || fold(i.name).includes(needle) || fold(i.spec ?? "").includes(needle)));
  const main = wines ? shown.filter((i) => i.in_stock) : shown;
  const out = wines ? shown.filter((i) => !i.in_stock) : [];
  const outExpanded = outOpen ?? (needle !== "" && out.length > 0);
  const row = (i: StockItem) => (
    <li key={i.id}>
      <Link href={`/admin/bottles/${i.id}`} className={i.in_stock ? "a-list-row" : "a-list-row is-out"}>
        <span>{i.name}<span className="a-quiet a-small"> · {i.spec ?? i.family}</span></span>
        {/* Plain status text, not a pill: the whole row opens the bottle, stock is toggled on Stock. */}
        <span className={i.in_stock ? "a-state" : wines ? "a-state" : "a-state out"}>{i.in_stock ? "In" : "Out"}</span>
        <span className="a-chev" aria-hidden>›</span>
      </Link>
    </li>
  );
  return (
    <>
      <div className="a-titlebar">
        <h1 className="a-h1">Bottles</h1>
        <Link href={wines ? "/admin/bottles/new?kind=wine" : "/admin/bottles/new"} className="a-btn a-btn-primary">{wines ? "Add wine" : "Add bottle"}</Link>
      </div>
      {saved ? <p className="a-ok" role="status">Saved {saved}.</p> : null}
      <KindSwitch kind={kind} onChange={setKind} />
      <div className="a-search">
        <input type="search" value={q} onChange={(e) => { setQ(e.target.value); if (outOpen === false) setOutOpen(null); }} placeholder={wines ? "Search wines" : "Search spirits"} aria-label={wines ? "Search wines" : "Search spirits"} />
        {q ? <button type="button" className="a-clear" onClick={() => setQ("")} aria-label="Clear search">×</button> : null}
      </div>
      <ul className="a-list">{main.map(row)}</ul>
      {out.length > 0 ? (
        <section className="a-outsec" aria-label="Out wines">
          <Disclosure headClassName="a-outsec-head" id="out-bottles" open={outExpanded} onOpenChange={setOutOpen} summary={<>Out · {out.length}</>}>
            <ul className="a-list">{out.map(row)}</ul>
          </Disclosure>
        </section>
      ) : null}
      {shown.length === 0 ? <p className="a-quiet">{wines ? (needle ? "No wines match." : "No wines yet.") : "No bottles match."}</p> : null}
    </>
  );
}
