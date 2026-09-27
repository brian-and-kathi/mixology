"use client";

import Link from "next/link";
import { useState } from "react";
import type { RecipeStatus } from "@/lib/admin-data";
import { cap } from "@/lib/format";
import { SEARCH } from "@/lib/search-cookie";
import { useRememberedSearch } from "./useRememberedSearch";

const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

/** Recipes tab: search by name or a missing ingredient, and narrow to on-the-menu or missing. */
export function RecipeList({ recipes, initialQuery = "" }: { recipes: RecipeStatus[]; initialQuery?: string }) {
  const [q, setQ] = useRememberedSearch(SEARCH.recipes, initialQuery);
  const [mode, setMode] = useState<"all" | "on" | "missing">("all");
  const needle = fold(q.trim());
  const onCount = recipes.filter((r) => r.on_menu).length;
  const missingCount = recipes.length - onCount;
  const shown = recipes.filter((r) => {
    if (mode === "on" && !r.on_menu) return false;
    if (mode === "missing" && r.on_menu) return false;
    if (!needle) return true;
    return fold(r.name).includes(needle) || r.missing.some((name) => fold(name).includes(needle));
  });
  const empty = needle
    ? "No recipes match."
    : mode === "on"
      ? "Nothing is on the menu."
      : mode === "missing"
        ? "Nothing is missing an ingredient."
        : "No recipes yet.";

  return (
    <>
      <div className="a-searchbar">
        <div className="a-search">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes" aria-label="Search recipes" enterKeyHint="search" />
          {q ? <button type="button" className="a-clear" onClick={() => setQ("")} aria-label="Clear search">×</button> : null}
        </div>
        <div className="a-chips" role="group" aria-label="Filter">
          <button type="button" className={mode === "all" ? "a-chip on" : "a-chip"} onClick={() => setMode("all")} aria-pressed={mode === "all"}>All</button>
          <button type="button" className={mode === "on" ? "a-chip on" : "a-chip"} onClick={() => setMode("on")} aria-pressed={mode === "on"}>On the menu · {onCount}</button>
          <button type="button" className={mode === "missing" ? "a-chip on" : "a-chip"} onClick={() => setMode("missing")} aria-pressed={mode === "missing"}>Missing · {missingCount}</button>
        </div>
      </div>
      {shown.length === 0 ? <p className="a-quiet a-empty">{empty}</p> : (
        <ul className="a-list">
          {shown.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/recipes/${r.id}`} className="a-list-row">
                <span>{r.name}</span>
                <span className={r.on_menu ? "a-badge ok" : "a-badge"}>{r.on_menu ? "On the menu" : `Missing: ${r.missing.map(cap).join(", ")}`}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
