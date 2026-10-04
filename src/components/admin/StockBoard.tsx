"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Change, StockItem } from "@/lib/admin-data";
import { api } from "./api";
import { KindSwitch, useAdminKind, type Kind } from "./KindSwitch";
import { useRememberedSearch } from "./useRememberedSearch";
import { SEARCH } from "@/lib/search-cookie";
import { StockRow } from "./StockToggle";
import { specLabel } from "@/lib/spec-label";

type Result = { name: string; in_stock: boolean; log_id: number | null; blocked: string[]; unlocked: string[] };
type Toast = { text: string; undo?: { id: string; to: boolean; logId: number | null } };

const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const list = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** Menu impact as a sentence. Up to three drinks are named; more than that becomes a count. */
function impact(r: Result): string {
  const say = (names: string[], where: string) =>
    names.length <= 3 ? `${list(names)} ${names.length === 1 ? "is" : "are"} ${where}.` : `${names.length} cocktails are ${where}.`;
  if (r.blocked.length) return say(r.blocked, "off the menu");
  if (r.unlocked.length) return say(r.unlocked, "back on the menu");
  return "";
}

/** "just now", "4 min ago", "2 hr ago", "yesterday", then a date. */
function ago(iso: string, now: number): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  if (s < 172800) return "yesterday";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Stock: one tap on the row's In/Out toggle (left edge) flips a bottle (optimistic), with an undo toast
 * that shows the menu impact. The rest of the row opens the bottle; the type is a quiet second line.
 * Spirits | Wines switch: both list every bottle by family with All / Out only chips (counted per view),
 * so an out bottle stays in its group with the amber Out toggle. Wine outs are never shopping items
 * (Glance counts spirits only); the Wines chip counts just the wines.
 */
export function StockBoard({ items, recent, initialQuery }: { items: StockItem[]; recent: Change[]; initialQuery: string }) {
  const router = useRouter();
  const [q, setQ] = useRememberedSearch(SEARCH.stock, initialQuery);
  const [outOnly, setOutOnly] = useState(false);
  const [kind, setKindRaw] = useAdminKind();
  const setKind = (k: Kind) => {
    setKindRaw(k);
    setOutOnly(false);
  };
  const [override, setOverride] = useState<Record<string, boolean>>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setClock(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, []);

  const stockOf = (it: StockItem) => override[it.id] ?? it.in_stock;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Group headers stick right under the search bar. Measure it instead of assuming a height (the chips
  // can wrap, fonts vary): a header parked too high tucked under the bar, and one parked too low let
  // rows show between them.
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = barRef.current, root = rootRef.current;
    if (!bar || !root || typeof ResizeObserver === "undefined") return;
    const set = () => root.style.setProperty("--a-search-h", `${Math.round(bar.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);
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
      const what = `${r.name} ${to ? "in stock" : "out"}.`;
      const extra = impact(r);
      const text = `${undoOf ? "Undone: " : ""}${what}${extra ? ` ${extra}` : ""}`;
      show(undoOf ? { text } : { text, undo: { id: it.id, to: !to, logId: r.log_id } });
      setClock(Date.now());
      router.refresh();
    } catch (e) {
      setOverride((o) => ({ ...o, [it.id]: !to }));
      setRowError((m) => ({ ...m, [it.id]: e instanceof Error ? e.message : "Couldn't save." }));
    }
  }

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const needle = fold(q.trim());
  const wines = kind === "wines";
  // Name, type or Origin ("michigan", "traverse city"), case- and accent-insensitive.
  const matches = (it: StockItem) => !needle || fold(it.name).includes(needle) || fold(it.spec ?? "").includes(needle) || fold(it.origin ?? "").includes(needle);
  const inView = items.filter((it) => it.wine === wines);
  // Out only: a row tapped this visit stays put (in or out), so nothing jumps away under your thumb.
  const visible = inView.filter((it) => matches(it) && !(outOnly && stockOf(it) && !touched.has(it.id)));
  const groups: { family: string; items: StockItem[] }[] = [];
  for (const it of visible) {
    const g = groups[groups.length - 1];
    if (g && g.family === it.family) g.items.push(it);
    else groups.push({ family: it.family, items: [it] });
  }
  // Counted per view: the Spirits chip counts spirits, the Wines chip counts wines.
  const outTotal = inView.filter((i) => !stockOf(i)).length;
  // Latest stock change per bottle that hasn't been undone. Undo entries themselves are not listed
  // (undoing puts things back, so there is nothing new to show or to undo again).
  const seen = new Set<string>();
  const undoable = recent
    .filter((c) => {
      if (c.action !== "stock" && c.action !== "undo") return false;
      if (seen.has(c.entity_id)) return false;
      seen.add(c.entity_id);
      return c.action === "stock" && !c.undone && byId.has(c.entity_id);
    })
    .slice(0, 5);

  return (
    <div className="a-stock" ref={rootRef}>
      <KindSwitch kind={kind} onChange={setKind} />
      <div className="a-searchbar" ref={barRef}>
        <div className="a-search">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={wines ? "Search wines" : "Search spirits"} aria-label={wines ? "Search wines" : "Search spirits"} enterKeyHint="search" />
          {q ? <button type="button" className="a-clear" onClick={() => setQ("")} aria-label="Clear search">×</button> : null}
        </div>
        <div className="a-chips" role="group" aria-label="Filter">
          <button type="button" className={outOnly ? "a-chip" : "a-chip on"} onClick={() => setOutOnly(false)} aria-pressed={!outOnly}>All</button>
          <button type="button" className={outOnly ? "a-chip on" : "a-chip"} onClick={() => setOutOnly(true)} aria-pressed={outOnly}>Out only · {outTotal}</button>
        </div>
      </div>

      {/* Hidden while the toast is up, so the same Undo never shows twice at once. */}
      {undoable.length > 0 && !needle && !toast ? (
        <section className="a-recent" aria-label="Recently changed">
          <h2>Recently changed</h2>
          <ul>
            {undoable.map((c) => {
              const it = byId.get(c.entity_id)!;
              const now = stockOf(it);
              const canUndo = c.after?.in_stock === now;
              return (
                <li key={c.id}>
                  <span>{c.summary} <span className="a-quiet a-small" suppressHydrationWarning>· {ago(new Date(c.at).toISOString(), clock)}</span></span>
                  {canUndo ? <button type="button" className="a-link" onClick={() => flip(it, !now, c.id)}>Undo</button> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {groups.length === 0 ? (
        <p className="a-quiet a-empty">{outOnly ? (needle ? (wines ? "No out wines match." : "No out bottles match.") : "Nothing is out.") : wines ? (needle ? "No wines match." : "No wines yet.") : "No bottles match."}</p>
      ) : null}
      {groups.map((g) => {
        const out = g.items.filter((i) => !stockOf(i)).length;
        return (
          <section key={g.family} className="a-group">
            <h2 className="a-group-head">{g.family.replace(/^./, (c) => c.toUpperCase())}<span className="a-quiet"> · {g.items.length}{out ? ` · ${out} out` : ""}</span></h2>
            <ul className="a-rows">
              {g.items.map((it) => <StockRow key={it.id} id={it.id} name={it.name} sub={specLabel(it.spec, it.label)} inStock={stockOf(it)} featured={it.featured} error={rowError[it.id]} onToggle={(to) => void flip(it, to)} />)}
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
