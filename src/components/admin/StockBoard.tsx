"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Change, StockItem } from "@/lib/admin-data";
import { api } from "./api";

type Result = { name: string; in_stock: boolean; log_id: number | null; blocked: string[]; unlocked: string[] };
type Toast = { text: string; undo?: { id: string; to: boolean; logId: number | null } };

const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function impact(r: Result): string {
  if (r.blocked.length) return r.blocked.length === 1 ? `${r.blocked[0]} is now off the menu` : `${plural(r.blocked.length, "cocktail", "cocktails")} now off the menu`;
  if (r.unlocked.length) return r.unlocked.length === 1 ? `${r.unlocked[0]} is back on the menu` : `${plural(r.unlocked.length, "cocktail", "cocktails")} back on the menu`;
  return "";
}

/** Stock: one tap flips a bottle In/Out (optimistic), with an undo toast that shows the menu impact. */
export function StockBoard({ items, recent, initialQuery }: { items: StockItem[]; recent: Change[]; initialQuery: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [outOnly, setOutOnly] = useState(false);
  const [override, setOverride] = useState<Record<string, boolean>>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const stockOf = (it: StockItem) => override[it.id] ?? it.in_stock;

  useEffect(() => () => window.clearTimeout(timer.current), []);
  function show(t: Toast) {
    setToast(t);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 5000);
  }

  async function flip(it: StockItem, to: boolean, undoOf?: number | null) {
    setOverride((o) => ({ ...o, [it.id]: to }));
    setTouched((t) => new Set(t).add(it.id));
    setRowError(({ [it.id]: _gone, ...rest }) => rest);
    navigator.vibrate?.(10);
    try {
      const r = await api<Result>("/api/admin/stock", "POST", { id: it.id, in_stock: to, undo_of: undoOf ?? undefined });
      const what = `${r.name} marked ${to ? "in" : "out"}`;
      const extra = impact(r);
      show(undoOf ? { text: `Undone · ${what}${extra ? ` · ${extra}` : ""}` } : { text: `${what}${extra ? ` · ${extra}` : ""}`, undo: { id: it.id, to: !to, logId: r.log_id } });
      router.refresh();
    } catch (e) {
      setOverride((o) => ({ ...o, [it.id]: !to }));
      setRowError((m) => ({ ...m, [it.id]: e instanceof Error ? e.message : "Couldn't save." }));
    }
  }

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const needle = fold(q.trim());
  const visible = items.filter((it) => {
    if (needle && !fold(it.name).includes(needle) && !fold(it.spec ?? "").includes(needle)) return false;
    if (outOnly && stockOf(it) && !touched.has(it.id)) return false;
    return true;
  });
  const groups: { family: string; items: StockItem[] }[] = [];
  for (const it of visible) {
    const g = groups[groups.length - 1];
    if (g && g.family === it.family) g.items.push(it);
    else groups.push({ family: it.family, items: [it] });
  }
  const outTotal = items.filter((i) => !stockOf(i)).length;
  const undoable = recent.filter((c) => (c.action === "stock" || c.action === "undo") && !c.undone && byId.has(c.entity_id)).slice(0, 4);

  return (
    <div className="a-stock">
      <div className="a-searchbar">
        <div className="a-search">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search bottles" aria-label="Search bottles" enterKeyHint="search" />
          {q ? <button type="button" className="a-clear" onClick={() => setQ("")} aria-label="Clear search">×</button> : null}
        </div>
        <div className="a-chips" role="group" aria-label="Filter">
          <button type="button" className={outOnly ? "a-chip" : "a-chip on"} onClick={() => setOutOnly(false)} aria-pressed={!outOnly}>All</button>
          <button type="button" className={outOnly ? "a-chip on" : "a-chip"} onClick={() => setOutOnly(true)} aria-pressed={outOnly}>Out only · {outTotal}</button>
        </div>
      </div>

      {undoable.length > 0 && !needle ? (
        <section className="a-recent" aria-label="Recently changed">
          <h2>Recently changed</h2>
          <ul>
            {undoable.map((c) => {
              const it = byId.get(c.entity_id)!;
              const now = stockOf(it);
              const canUndo = c.after?.in_stock === now;
              return (
                <li key={c.id}>
                  <span>{c.summary}</span>
                  {canUndo ? <button type="button" className="a-link" onClick={() => flip(it, !now, c.id)}>Undo</button> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {groups.length === 0 ? <p className="a-quiet a-empty">{outOnly ? "Nothing is out." : "No bottles match."}</p> : null}
      {groups.map((g) => {
        const out = g.items.filter((i) => !stockOf(i)).length;
        return (
          <section key={g.family} className="a-group">
            <h2 className="a-group-head">{g.family.replace(/^./, (c) => c.toUpperCase())}<span className="a-quiet"> · {out ? `${out} out` : `${g.items.length}`}</span></h2>
            <ul className="a-rows">
              {g.items.map((it) => {
                const inStock = stockOf(it);
                return (
                  <li key={it.id}>
                    <button type="button" className={inStock ? "a-row" : "a-row is-out"} onClick={() => flip(it, !inStock)} aria-pressed={inStock} aria-label={`${it.name}: ${inStock ? "in stock" : "out"}. Tap to mark ${inStock ? "out" : "in"}.`}>
                      <span className="a-row-name">{it.name}</span>
                      <span className={inStock ? "a-pill in" : "a-pill out"}>{inStock ? "In" : "Out"}</span>
                    </button>
                    {rowError[it.id] ? <p className="a-error a-row-error" role="alert">{rowError[it.id]}</p> : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <div className="a-toast-wrap" aria-live="polite">
        {toast ? (
          <div className="a-toast">
            <span>{toast.text}</span>
            {toast.undo ? (
              <button type="button" className="a-toast-undo" onClick={() => {
                const u = toast.undo!;
                const it = byId.get(u.id);
                setToast(null);
                if (it) void flip(it, u.to, u.logId);
              }}>Undo</button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
