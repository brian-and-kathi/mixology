"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { StockItem } from "@/lib/admin-data";
import { SEARCH } from "@/lib/search-cookie";
import { specLabel } from "@/lib/spec-label";
import { originSearchExtra } from "@/lib/us-states";
import { api } from "./api";
import { useRememberedSearch } from "./useRememberedSearch";
import { StockToggle } from "./StockToggle";

const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

/**
 * Which bottle is in which decanter. The switch is the whole point of the row; the name still opens
 * the bottle. The quiet line is the badge on the glass ("Bourbon"). The recipe card marks the bottle.
 */
export function DecantBoard({ items, initialQuery }: { items: StockItem[]; initialQuery: string }) {
  const [q, setQ] = useRememberedSearch(SEARCH.decanters, initialQuery);
  const [only, setOnly] = useState(false);
  const [override, setOverride] = useState<Record<string, boolean>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [takenOut, setTakenOut] = useState<string | null>(null);
  const decantOf = (it: StockItem) => override[it.id] ?? it.decanting;
  const badgeOf = (it: StockItem) => specLabel(it.spec, it.label);

  async function flip(it: StockItem, to: boolean) {
    // Same primary ingredient shares one decanter. Turning this bottle on takes the other one out.
    const siblings = to ? items.filter((other) => other.id !== it.id && it.spec && other.spec === it.spec && decantOf(other)) : [];
    setOverride((o) => {
      const next = { ...o, [it.id]: to };
      for (const other of siblings) next[other.id] = false;
      return next;
    });
    setTakenOut(null);
    setRowError(({ [it.id]: _gone, ...rest }) => rest);
    navigator.vibrate?.(10);
    try {
      const saved = await api<{ cleared: { id: string; name: string }[] }>("/api/admin/decanting", "POST", { id: it.id, decanting: to });
      const cleared = saved.cleared ?? [];
      if (cleared.length) {
        setOverride((o) => {
          const next = { ...o };
          for (const bottle of cleared) next[bottle.id] = false;
          return next;
        });
        const names = cleared.map((bottle) => bottle.name);
        setTakenOut(names.length === 1 ? `${names[0]} was taken out of the decanter.` : `${names.join(", ")} were taken out of the decanter.`);
      }
    } catch (e) {
      setOverride((o) => {
        const next = { ...o, [it.id]: !to };
        for (const other of siblings) next[other.id] = true;
        return next;
      });
      setRowError((m) => ({ ...m, [it.id]: e instanceof Error ? e.message : "Couldn't save." }));
    }
  }

  const needle = fold(q.trim());
  const matches = (it: StockItem) => {
    if (!needle) return true;
    const badge = badgeOf(it) ?? "";
    return fold(it.name).includes(needle) || fold(it.spec ?? "").includes(needle) || fold(badge).includes(needle) || fold(`${it.origin ?? ""} ${originSearchExtra(it.origin) ?? ""}`).includes(needle);
  };
  const visible = items.filter((it) => matches(it) && (!only || decantOf(it)));
  const groups: { family: string; items: StockItem[] }[] = [];
  for (const it of visible) {
    const g = groups[groups.length - 1];
    if (g && g.family === it.family) g.items.push(it);
    else groups.push({ family: it.family, items: [it] });
  }
  const decanted = items.filter((it) => decantOf(it)).length;

  const clashes = useMemo(() => {
    const bySpec = new Map<string, string[]>();
    for (const it of items) {
      if (!decantOf(it) || !it.spec) continue;
      const names = bySpec.get(it.spec) ?? [];
      names.push(it.name);
      bySpec.set(it.spec, names);
    }
    return [...bySpec.entries()].filter(([, names]) => names.length > 1);
  }, [items, override]);

  return (
    <div className="a-stock">
      <div className="a-searchbar">
        <div className="a-search">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search bottles" aria-label="Search bottles" enterKeyHint="search" />
          {q ? <button type="button" className="a-clear" onClick={() => setQ("")} aria-label="Clear search">×</button> : null}
        </div>
        <div className="a-chips" role="group" aria-label="Filter">
          <button type="button" className={only ? "a-chip" : "a-chip on"} onClick={() => setOnly(false)} aria-pressed={!only}>All</button>
          <button type="button" className={only ? "a-chip on" : "a-chip"} onClick={() => setOnly(true)} aria-pressed={only}>In a decanter · {decanted}</button>
        </div>
      </div>

      {takenOut ? <p className="a-ok" role="status">{takenOut}</p> : null}
      {clashes.map(([spec, names]) => (
        <p key={spec} className="a-warn" role="status">
          {names.length} bottles of {spec} are decanted: {names.join(", ")}. Turn one on to leave only that bottle in the decanter.
        </p>
      ))}

      {groups.length === 0 ? (
        <p className="a-quiet a-empty">{only ? (needle ? "No decanted bottles match." : "Nothing is in a decanter.") : needle ? "No bottles match." : "No bottles yet."}</p>
      ) : null}
      {groups.map((g) => {
        const n = g.items.filter((it) => decantOf(it)).length;
        return (
          <section key={g.family} className="a-group">
            <h2 className="a-group-head">{g.family.replace(/^./, (c) => c.toUpperCase())}<span className="a-quiet"> · {g.items.length}{n ? ` · ${n} decanting` : ""}</span></h2>
            <ul className="a-rows">
              {g.items.map((it) => {
                const on = decantOf(it);
                const badge = badgeOf(it);
                const sub = [badge, it.in_stock ? null : "Out"].filter(Boolean).join(" · ");
                return (
                  <li key={it.id}>
                    <div className="a-srow">
                      <StockToggle
                        name={it.name}
                        inStock={on}
                        wide
                        onText="Decant"
                        offText="Bottle"
                        ariaLabel={on ? `${it.name} is in the ${badge ?? "unlabelled"} decanter` : `${it.name} is in its bottle`}
                        onToggle={(to) => void flip(it, to)}
                      />
                      <Link href={`/admin/bottles/${it.id}`} className="a-srow-link">
                        {sub ? (
                          <span className="a-srow-text">
                            <span className="a-srow-name">{it.name}</span>
                            <span className="a-srow-sub">{sub}</span>
                          </span>
                        ) : (
                          <span className="a-srow-name">{it.name}</span>
                        )}
                      </Link>
                    </div>
                    {rowError[it.id] ? <p className="a-error a-row-error" role="alert">{rowError[it.id]}</p> : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
