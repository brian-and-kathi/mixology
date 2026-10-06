"use client";

import { useId, useMemo, useState } from "react";
import type { Family, SpecOption } from "@/lib/admin-data";
import { cap } from "@/lib/format";
import { api } from "./api";

const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

/**
 * Searchable ingredient picker. Shows an availability dot, matches aliases, and can create a
 * new ingredient inline (name + family). onCreate lets the parent add it to its option list.
 */
export function SpecPicker({
  specs, families, value, onChange, onCreate, label = "Ingredient", allowCreate = true, compact = false, defaultOpen = false, exclude = [], onDismiss,
}: {
  specs: SpecOption[];
  families: Family[];
  value: string | null;
  onChange: (id: string) => void;
  onCreate?: (s: SpecOption) => void;
  label?: string;
  allowCreate?: boolean;
  compact?: boolean;
  /** Open with the search focused (the recipe editor's "+ or…"). */
  defaultOpen?: boolean;
  /** Ingredients not to offer (a line's own ingredient and its other alternates). */
  exclude?: string[];
  /** Closed without a choice (only with defaultOpen). */
  onDismiss?: () => void;
}) {
  const id = useId();
  const current = specs.find((s) => s.id === value) ?? null;
  const [open, setOpen] = useState(defaultOpen);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [family, setFamily] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const needle = fold(q.trim());
  const matches = useMemo(() => {
    const pool = exclude.length ? specs.filter((s) => !exclude.includes(s.id)) : specs;
    if (!needle) return pool.slice(0, 40);
    return pool.filter((s) => fold(s.name).includes(needle) || s.aliases.some((a) => fold(a).includes(needle))).slice(0, 40);
  }, [specs, needle, exclude]);
  const exact = specs.some((s) => fold(s.name) === needle);

  async function create() {
    setErr(null);
    if (!family) return setErr("Choose a family.");
    setBusy(true);
    try {
      const r = await api<{ id: string; name: string }>("/api/admin/specs", "POST", { name: q.trim(), family_id: family });
      const fam = families.find((f) => f.id === family);
      const s: SpecOption = { id: r.id, name: r.name, family: fam?.name ?? null, family_id: family, available: false, in_stock: false, ingredient_only: false, aliases: [] };
      onCreate?.(s);
      onChange(s.id);
      setOpen(false);
      setCreating(false);
      setQ("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't add it.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? "a-picker compact" : "a-picker"}>
      {!compact ? <label className="a-label" htmlFor={id}>{label}</label> : null}
      <button type="button" id={id} className="a-picker-current" onClick={() => { if (open && !current) onDismiss?.(); setOpen((o) => !o); }} aria-expanded={open}>
        {current ? (
          <>
            <span className={current.available ? "a-dot on" : "a-dot"} aria-hidden />
            <span>{cap(current.name)}</span>
            <span className="a-quiet a-small">{current.available ? (current.in_stock ? "in stock" : "via stand-in") : "out"}</span>
          </>
        ) : <span className="a-quiet">Choose…</span>}
      </button>
      {open ? (
        <div className="a-picker-pop">
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setCreating(false); }} placeholder="Search ingredients" aria-label="Search ingredients" autoFocus={defaultOpen}
            onKeyDown={(e) => { if (e.key === "Escape" && onDismiss) { e.preventDefault(); setOpen(false); onDismiss(); } }} />
          <ul className="a-picker-list" role="listbox">
            {matches.map((s) => (
              <li key={s.id}>
                <button type="button" role="option" aria-selected={s.id === value} onClick={() => { onChange(s.id); setOpen(false); setQ(""); }}>
                  <span className={s.available ? "a-dot on" : "a-dot"} aria-hidden />
                  <span>{cap(s.name)}</span>
                  <span className="a-quiet a-small">{s.family ?? ""}{s.ingredient_only ? " · drinks only" : ""}</span>
                </button>
              </li>
            ))}
            {matches.length === 0 ? <li className="a-quiet a-small a-pad">No match.</li> : null}
          </ul>
          {allowCreate && needle && !exact ? (
            creating ? (
              <div className="a-create">
                <p>New ingredient: <strong>{q.trim().toLowerCase()}</strong></p>
                <select value={family} onChange={(e) => setFamily(e.target.value)} aria-label="Family">
                  <option value="">Family…</option>
                  {families.map((f) => <option key={f.id} value={f.id}>{cap(f.name)}</option>)}
                </select>
                {err ? <p className="a-error">{err}</p> : null}
                <button type="button" className="a-btn a-btn-primary" disabled={busy} onClick={create}>{busy ? "Adding…" : "Add ingredient"}</button>
              </div>
            ) : (
              <button type="button" className="a-link a-pad" onClick={() => setCreating(true)}>+ Add “{q.trim()}” as a new ingredient</button>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
