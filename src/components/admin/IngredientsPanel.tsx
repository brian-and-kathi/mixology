"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Family, SpecOption, Sub } from "@/lib/admin-data";
import { cap } from "@/lib/format";
import { api } from "./api";
import { SpecPicker } from "./SpecPicker";
import { Disclosure } from "./Disclosure";
import { useRememberedSearch } from "./useRememberedSearch";
import { SEARCH } from "@/lib/search-cookie";

const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
const VERMOUTH = new Set(["sweet vermouth", "dry vermouth"]);

/** Specs tab (route /admin/ingredients): all specs by family, then stand-ins as sentences (with the vermouth rule). New ingredients are added in /db (Specs). */
export function IngredientsPanel({ specs, families, subs, initialQuery = "" }: { specs: SpecOption[]; families: Family[]; subs: Sub[]; initialQuery?: string }) {
  const router = useRouter();
  const [q, setQ] = useRememberedSearch(SEARCH.ingredients, initialQuery);
  const [source, setSource] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [both, setBoth] = useState(false);
  const [adding, setAdding] = useState(false);
  const [outOnly, setOutOnly] = useState(false);
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
      setSource(null); setTarget(null); setNote(""); setBoth(false); setAdding(false);
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
  const outTotal = specs.filter((s) => !s.available).length;
  const shown = specs.filter((s) => (!outOnly || !s.available) && (!needle || fold(s.name).includes(needle) || s.aliases.some((a) => fold(a).includes(needle))));
  // Bartender groupings rather than raw families.
  const famById = new Map(families.map((f) => [f.id, f]));
  const bucket = (s: SpecOption) => {
    const f = s.family_id ? famById.get(s.family_id) : undefined;
    if (!f) return "Other";
    if (f.kind === "spirit") return "Spirits";
    if (f.slug === "liqueur") return "Liqueurs";
    if (f.slug === "bitter") return "Bitters";
    if (f.kind === "wine") return "Wine & fortified";
    if (f.slug === "sweetener") return "Syrups & sweeteners";
    if (f.slug === "citrus") return "Citrus & juice";
    if (f.slug === "garnish") return "Garnish";
    if (f.kind === "mixer" || f.kind === "staple") return "Mixers";
    return "Other";
  };
  const ORDER = ["Spirits", "Liqueurs", "Wine & fortified", "Mixers", "Syrups & sweeteners", "Citrus & juice", "Bitters", "Garnish", "Other"];
  const groups = new Map<string, SpecOption[]>();
  for (const s of shown) groups.set(bucket(s), [...(groups.get(bucket(s)) ?? []), s]);

  return (
    <div className="a-ingredients">
      <div className="a-searchbar">
        <div className="a-search">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search specs" aria-label="Search specs" enterKeyHint="search" />
          {q ? <button type="button" className="a-clear" onClick={() => setQ("")} aria-label="Clear search">×</button> : null}
        </div>
        <div className="a-chips" role="group" aria-label="Filter">
          <button type="button" className={outOnly ? "a-chip" : "a-chip on"} onClick={() => setOutOnly(false)} aria-pressed={!outOnly}>All</button>
          <button type="button" className={outOnly ? "a-chip on" : "a-chip"} onClick={() => setOutOnly(true)} aria-pressed={outOnly}>Out only · {outTotal}</button>
        </div>
      </div>

      {ORDER.filter((k) => groups.has(k)).map((k) => {
        const list = groups.get(k)!;
        const out = list.filter((s) => !s.available).length;
        return (
          <section key={k} className="a-group">
            <h2 className="a-group-head a-sticky">{k}<span className="a-quiet"> · {list.length}{out && !outOnly ? ` · ${out} out` : ""}</span></h2>
            <ul className="a-list">
              {list.map((s) => (
                <li key={s.id}>
                  <Link href={`/admin/ingredients/${s.id}`} className="a-list-row">
                    <span className={s.available ? "a-dot on" : "a-dot"} aria-hidden />
                    <span>{cap(s.name)}{s.aliases.length ? <span className="a-quiet a-small"> · {s.aliases.join(", ")}</span> : null}</span>
                    <span className="a-quiet a-small">{s.ingredient_only ? "drinks only" : s.available ? "" : "out"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {groups.size === 0 ? <p className="a-quiet a-empty">{outOnly ? "Nothing is out." : "No specs match."}</p> : null}

      <Disclosure className="a-more a-standins" headClassName="a-more-head" bodyClassName="a-more-body" summary={<>Stand-ins <span className="a-quiet">· {subs.length}</span></>}>
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
        {msg?.ok ? <p className="a-ok" role="status">{msg.ok}</p> : null}
        {!adding ? (
          <button type="button" className="a-btn" onClick={() => { setAdding(true); setMsg(null); }}>Add stand-in</button>
        ) : (
          <form className="a-subform" onSubmit={add}>
            <SpecPicker label="This ingredient…" specs={specs} families={families} value={source} onChange={setSource} allowCreate={false} />
            <SpecPicker label="…can stand in for" specs={specs} families={families} value={target} onChange={setTarget} allowCreate={false} />
            <label className="a-check"><input type="checkbox" checked={both} onChange={(e) => setBoth(e.target.checked)} /><span>Both ways</span></label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional), e.g. use slightly less" aria-label="Note" maxLength={200} />
            {vermouthBlocked ? <p className="a-error">Sweet and dry vermouth can&apos;t stand in for each other: they taste completely different, so a recipe would come out wrong.</p> : null}
            {msg?.error ? <p className="a-error" role="alert">{msg.error}</p> : null}
            <div className="a-row-btns">
              <button type="button" className="a-btn" onClick={() => setAdding(false)}>Cancel</button>
              <button type="submit" className="a-btn a-btn-primary" disabled={!source || !target || busy || vermouthBlocked}>{busy ? "Adding…" : "Add stand-in"}</button>
            </div>
          </form>
        )}
      </Disclosure>
    </div>
  );
}
