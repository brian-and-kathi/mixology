"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Change, StockItem } from "@/lib/admin-data";
import { api } from "./api";
import { KindSwitch, useAdminKind, type Kind } from "./KindSwitch";
import { Disclosure } from "./Disclosure";

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
 * Stock: one tap flips a bottle In/Out (optimistic), with an undo toast that shows the menu impact.
 * Spirits | Wines switch: Spirits is the short list whose outs matter (red Out, "Out only", counts).
 * Wines (the guest Cellar's bottles) lists in-stock wines by type, with the out ones folded into a
 * quiet "Out · N" section at the bottom; wine outs never count as shopping or "out" numbers.
 */
export function StockBoard({ items, recent, initialQuery }: { items: StockItem[]; recent: Change[]; initialQuery: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [outOnly, setOutOnly] = useState(false);
  const [kind, setKindRaw] = useAdminKind();
  // Wines keep the section they were in when first tapped this visit, so a row never jumps away under
  // your thumb (marking a wine out leaves it in place with a gray Out until the next visit).
  const [pinned, setPinned] = useState<Record<string, boolean>>({});
  // Out section: null = automatic (collapsed, or open while a search matches out wines); true/false = the user's choice.
  const [outOpen, setOutOpen] = useState<boolean | null>(null);
  const setKind = (k: Kind) => {
    setKindRaw(k);
    setPinned({});
    setOutOpen(null);
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
  function show(t: Toast) {
    setToast(t);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 5000);
  }

  async function flip(it: StockItem, to: boolean, undoOf?: number | null) {
    if (it.wine) setPinned((p) => (it.id in p ? p : { ...p, [it.id]: stockOf(it) }));
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
  const matches = (it: StockItem) => !needle || fold(it.name).includes(needle) || fold(it.spec ?? "").includes(needle);
  const inView = items.filter((it) => it.wine === wines);
  const shelf = (it: StockItem) => pinned[it.id] ?? stockOf(it); // wines: which section the row sits in
  const visible = inView.filter((it) => {
    if (!matches(it)) return false;
    if (wines) return shelf(it);
    if (outOnly && stockOf(it) && !touched.has(it.id)) return false;
    return true;
  });
  const outWines = wines ? inView.filter((it) => !shelf(it) && matches(it)) : [];
  const outWinesCount = outWines.filter((it) => !stockOf(it)).length;
  const outExpanded = outOpen ?? (needle !== "" && outWines.length > 0);
  const groups: { family: string; items: StockItem[] }[] = [];
  for (const it of visible) {
    const g = groups[groups.length - 1];
    if (g && g.family === it.family) g.items.push(it);
    else groups.push({ family: it.family, items: [it] });
  }
  // Out counts are spirits only: wines are routinely out and never a shopping item.
  const outTotal = items.filter((i) => !i.wine && !stockOf(i)).length;
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
    <div className="a-stock">
      <KindSwitch kind={kind} onChange={setKind} />
      <div className="a-searchbar">
        <div className="a-search">
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); if (outOpen === false) setOutOpen(null); }} placeholder={wines ? "Search wines" : "Search spirits"} aria-label={wines ? "Search wines" : "Search spirits"} enterKeyHint="search" />
          {q ? <button type="button" className="a-clear" onClick={() => setQ("")} aria-label="Clear search">×</button> : null}
        </div>
        {!wines ? (
          <div className="a-chips" role="group" aria-label="Filter">
            <button type="button" className={outOnly ? "a-chip" : "a-chip on"} onClick={() => setOutOnly(false)} aria-pressed={!outOnly}>All</button>
            <button type="button" className={outOnly ? "a-chip on" : "a-chip"} onClick={() => setOutOnly(true)} aria-pressed={outOnly}>Out only · {outTotal}</button>
          </div>
        ) : null}
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

      {groups.length === 0 && !(wines && outWines.length) ? (
        <p className="a-quiet a-empty">{wines ? (needle ? "No wines match." : "No wines yet.") : outOnly ? "Nothing is out." : "No bottles match."}</p>
      ) : null}
      {groups.map((g) => {
        const out = g.items.filter((i) => !stockOf(i)).length;
        return (
          <section key={g.family} className="a-group">
            <h2 className="a-group-head">{g.family.replace(/^./, (c) => c.toUpperCase())}<span className="a-quiet"> · {g.items.length}{out && !wines ? ` · ${out} out` : ""}</span></h2>
            <ul className="a-rows">
              {g.items.map((it) => <StockRow key={it.id} it={it} inStock={stockOf(it)} quiet={wines} error={rowError[it.id]} onFlip={flip} />)}
            </ul>
          </section>
        );
      })}

      {wines && outWines.length > 0 ? (
        <section className="a-outsec" aria-label="Out wines">
          <Disclosure headClassName="a-outsec-head" id="out-wines" open={outExpanded} onOpenChange={setOutOpen} summary={<>Out · {outWinesCount}</>}>
            <ul className="a-rows">
              {outWines.map((it) => <StockRow key={it.id} it={it} inStock={stockOf(it)} quiet error={rowError[it.id]} onFlip={flip} />)}
            </ul>
          </Disclosure>
        </section>
      ) : null}

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

/** One tap-to-flip row. `quiet`: wines, where Out is a neutral gray, not the red spirits Out. */
function StockRow({ it, inStock, quiet, error, onFlip }: { it: StockItem; inStock: boolean; quiet: boolean; error?: string; onFlip: (it: StockItem, to: boolean) => void }) {
  return (
    <li>
      <button type="button" className={inStock ? "a-row" : "a-row is-out"} onClick={() => onFlip(it, !inStock)} aria-pressed={inStock} aria-label={`${it.name}: ${inStock ? "in stock" : "out"}. Tap to mark ${inStock ? "out" : "in"}.`}>
        <span className="a-row-name">{it.name}</span>
        <span className={inStock ? "a-pill in" : quiet ? "a-pill gray" : "a-pill out"}>{inStock ? "In" : "Out"}</span>
      </button>
      {error ? <p className="a-error a-row-error" role="alert">{error}</p> : null}
    </li>
  );
}
