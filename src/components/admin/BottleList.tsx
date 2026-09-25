"use client";

import Link from "next/link";
import { useState } from "react";
import type { StockItem } from "@/lib/admin-data";

const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

export function BottleList({ items }: { items: StockItem[] }) {
  const [q, setQ] = useState("");
  const needle = fold(q.trim());
  const shown = items.filter((i) => !needle || fold(i.name).includes(needle) || fold(i.spec ?? "").includes(needle));
  return (
    <>
      <div className="a-search">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search bottles" aria-label="Search bottles" />
        {q ? <button type="button" className="a-clear" onClick={() => setQ("")} aria-label="Clear search">×</button> : null}
      </div>
      <ul className="a-list">
        {shown.map((i) => (
          <li key={i.id}>
            <Link href={`/admin/bottles/${i.id}`} className={i.in_stock ? "a-list-row" : "a-list-row is-out"}>
              <span>{i.name}<span className="a-quiet a-small"> · {i.spec ?? i.family}</span></span>
              <span className={i.in_stock ? "a-pill in small" : "a-pill out small"}>{i.in_stock ? "In" : "Out"}</span>
            </Link>
          </li>
        ))}
      </ul>
      {shown.length === 0 ? <p className="a-quiet">No bottles match.</p> : null}
    </>
  );
}
