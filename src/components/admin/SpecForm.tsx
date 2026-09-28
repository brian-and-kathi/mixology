"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { Family, SpecRow } from "@/lib/admin-data";
import { cap } from "@/lib/format";
import { api } from "./api";
import { BackLink, SaveBar, useUnsavedGuard } from "./SaveBar";

type Form = { name: string; family_id: string; description: string; ingredient_only: boolean; always_available: boolean; aliases: string[] };

/** Edit an ingredient: name, family, other names (aliases), and the two menu flags. */
export function SpecForm({ spec, families }: { spec: SpecRow; families: Family[] }) {
  const router = useRouter();
  const init = (): Form => ({ name: spec.name, family_id: spec.family_id ?? "", description: spec.description ?? "", ingredient_only: spec.ingredient_only, always_available: spec.always_available, aliases: spec.aliases });
  const [f, setF] = useState<Form>(init);
  const base = useRef(JSON.stringify(init()));
  const [alias, setAlias] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(f) !== base.current;
  useUnsavedGuard(dirty && !saving);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((o) => ({ ...o, [k]: v }));

  function addAlias() {
    const a = alias.trim().toLowerCase();
    if (a && !f.aliases.includes(a) && a !== f.name.trim().toLowerCase()) set("aliases", [...f.aliases, a].sort());
    setAlias("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/api/admin/specs/${spec.id}`, "PUT", f);
      base.current = JSON.stringify(f);
      setSaving(false);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
      setSaving(false);
    }
  }

  return (
    <form className="a-form" onSubmit={submit}>
      <BackLink href="/admin/ingredients" label="Specs" dirty={dirty} />
      <h1 className="a-h1">{cap(spec.name)}</h1>
      <label className="a-field"><span className="a-label">Name</span>
        <input value={f.name} onChange={(e) => set("name", e.target.value)} required maxLength={80} />
      </label>
      <label className="a-field"><span className="a-label">Family</span>
        <select value={f.family_id} onChange={(e) => set("family_id", e.target.value)} required>
          <option value="">Choose…</option>
          {families.map((x) => <option key={x.id} value={x.id}>{cap(x.name)}</option>)}
        </select>
      </label>
      <div className="a-field">
        <span className="a-label">Also called</span>
        <ul className="a-tags">
          {f.aliases.map((a) => (
            <li key={a}>{a}<button type="button" aria-label={`Remove ${a}`} onClick={() => set("aliases", f.aliases.filter((x) => x !== a))}>×</button></li>
          ))}
        </ul>
        <div className="a-inline">
          <input value={alias} onChange={(e) => setAlias(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAlias(); } }} placeholder="Another name, e.g. triple sec" maxLength={80} aria-label="Another name" />
          <button type="button" className="a-btn" onClick={addAlias} disabled={!alias.trim()}>Add</button>
        </div>
      </div>
      <label className="a-check">
        <input type="checkbox" checked={f.ingredient_only} onChange={(e) => set("ingredient_only", e.target.checked)} />
        <span>Drinks only <span className="a-quiet a-small">(hide from Pours and Cellar; recipes still use it)</span></span>
      </label>
      <label className="a-check">
        <input type="checkbox" checked={f.always_available} onChange={(e) => set("always_available", e.target.checked)} />
        <span>Always on hand <span className="a-quiet a-small">(never needs a bottle, e.g. water)</span></span>
      </label>
      <label className="a-field"><span className="a-label">Description</span>
        <textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={3} maxLength={1000} />
      </label>
      <p className="a-quiet a-small">Bottles: {spec.bottles.length ? spec.bottles.join(", ") : "none yet"}.</p>
      <p className="a-quiet a-small">Used in: {spec.recipes.length ? spec.recipes.join(", ") : "no recipes"}.</p>
      <SaveBar dirty={dirty} ready={f.name.trim().length > 0} saving={saving} saved={saved} error={error} />
    </form>
  );
}
