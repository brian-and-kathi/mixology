"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Family, SpecOption, Sub } from "@/lib/admin-data";
import { cap } from "@/lib/format";
import { api } from "./api";
import { SpecPicker } from "./SpecPicker";

const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
const VERMOUTH = new Set(["sweet vermouth", "dry vermouth"]);

/** Ingredients tab: stand-ins as sentences (with the vermouth rule), then all ingredients by family. */
export function IngredientsPanel({ specs: initialSpecs, families, subs }: { specs: SpecOption[]; families: Family[]; subs: Sub[] }) {
  const router = useRouter();
  const [specs, setSpecs] = useState(initialSpecs);
  const [q, setQ] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [both, setBoth] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);

  const name = (id: string | null) => specs.find((s) => s.id === id)?.name ?? "";
  const vermouthBlocked = !!source && !!target && VERMOUTH.has(name(source)) && VERMOUTH.has(name(target)) && source !== target;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!source || !target || vermouthBlocked) return;
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/admin/substitutions", "POST", { source_id: source, target_id: target, both_ways: both, note });
      setMsg({ ok: `${cap(name(source))} can stand in for ${name(target)}${both ? " (both ways)" : ""}.` });
      setSource(null); setTarget(null); setNote("");
      router.refresh();
    } catch (err) {
      setMsg({ error: err instanceof Error ? err.message : "Couldn't add it." });
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: Sub) {
    if (!confirm(`Remove: ${s.source} for ${s.target}${s.two_way ? " (both ways)" : ""}?`)) return;
    try {
      await api("/api/admin/substitutions", "DELETE", { source_id: s.source_id, target_id: s.target_id, both_ways: s.two_way });
      router.refresh();
    } catch (err) {
      setMsg({ error: err instanceof Error ? err.message : "Couldn't remove it." });
    }
  }

  const needle = fold(q.trim());
  const shown = specs.filter((s) => !needle || fold(s.name).includes(needle) || s.aliases.some((a) => fold(a).includes(needle)));
  const groups = new Map<string, SpecOption[]>();
  for (const s of shown) {
    const k = s.family ?? "other";
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const order = [...families.map((f) => f.name), "other"];

  return (
    <div className="a-ingredients">
      <section className="a-card">
        <h2 className="a-h2">Stand-ins</h2>
        {subs.length === 0 ? <p className="a-quiet">No stand-ins yet.</p> : (
          <ul className="a-subs">
            {subs.map((s) => (
              <li key={`${s.source_id}:${s.target_id}`}>
                <span>{cap(s.source)} can stand in for {s.target}{s.two_way ? " (both ways)" : ""}.{s.note ? <span className="a-quiet"> {s.note}</span> : null}</span>
                <button type="button" className="a-link" onClick={() => remove(s)}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        <form className="a-subform" onSubmit={add}>
          <SpecPicker label="This ingredient…" specs={specs} families={families} value={source} onChange={setSource} allowCreate={false} />
          <SpecPicker label="…can stand in for" specs={specs} families={families} value={target} onChange={setTarget} allowCreate={false} />
          <label className="a-check"><input type="checkbox" checked={both} onChange={(e) => setBoth(e.target.checked)} /><span>Both ways</span></label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional), e.g. use slightly less" aria-label="Note" maxLength={200} />
          {vermouthBlocked ? <p className="a-error">Sweet and dry vermouth can&apos;t stand in for each other: they taste completely different, so a recipe would come out wrong.</p> : null}
          {msg?.error ? <p className="a-error" role="alert">{msg.error}</p> : null}
          {msg?.ok ? <p className="a-ok" role="status">{msg.ok}</p> : null}
          <button type="submit" className="a-btn a-btn-primary" disabled={!source || !target || busy || vermouthBlocked}>{busy ? "Adding…" : "Add stand-in"}</button>
        </form>
      </section>

      <section>
        <h2 className="a-h2">All ingredients</h2>
        <div className="a-search">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ingredients" aria-label="Search ingredients" />
          {q ? <button type="button" className="a-clear" onClick={() => setQ("")} aria-label="Clear search">×</button> : null}
        </div>
        <details className="a-more">
          <summary>+ Add an ingredient</summary>
          <SpecPicker label="Type a new name, then add it" specs={specs} families={families} value={null}
            onChange={(id) => router.push(`/admin/ingredients/${id}`)}
            onCreate={(s) => setSpecs((l) => [...l, s].sort((a, b) => a.name.localeCompare(b.name)))} />
        </details>
        {order.filter((k) => groups.has(k)).map((k) => (
          <div key={k} className="a-group">
            <h3 className="a-group-head">{cap(k)}<span className="a-quiet"> · {groups.get(k)!.length}</span></h3>
            <ul className="a-list">
              {groups.get(k)!.map((s) => (
                <li key={s.id}>
                  <Link href={`/admin/ingredients/${s.id}`} className="a-list-row">
                    <span className={s.available ? "a-dot on" : "a-dot"} aria-hidden />
                    <span>{cap(s.name)}{s.aliases.length ? <span className="a-quiet a-small"> · {s.aliases.join(", ")}</span> : null}</span>
                    <span className="a-quiet a-small">{s.ingredient_only ? "drinks only" : ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
