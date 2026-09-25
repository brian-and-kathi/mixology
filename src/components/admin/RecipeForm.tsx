"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { GlassIcon } from "@/components/GlassIcon";
import type { Family, Glass, RecipeRow, SpecOption } from "@/lib/admin-data";
import { altGlassLine, cap, glassLine, measure } from "@/lib/format";
import { api } from "./api";
import { BackLink, SaveBar, useUnsavedGuard } from "./SaveBar";
import { SpecPicker } from "./SpecPicker";

type Line = { key: number; spec_id: string | null; amount: string; unit: string; required: boolean; role: string; note: string };
type Form = { name: string; description: string; glass_id: string; service_style: string; alt_glass_id: string; alt_service_style: string; glass_note: string; lines: Line[] };

const SERVICES: [string, string][] = [["", "—"], ["up", "Up (chilled, no ice)"], ["on the rocks", "Rocks (over ice)"], ["neat", "Neat (no ice)"], ["hot", "Hot"]];
const ROLE_LABELS: [string, string][] = [["", "—"], ["base", "Base"], ["modifier", "Modifier"], ["juice", "Juice"], ["sweetener", "Sweetener"], ["garnish", "Garnish"], ["other", "Other"]];

let seq = 0;
function initial(r: RecipeRow | null): Form {
  return {
    name: r?.name ?? "", description: r?.description ?? "",
    glass_id: r?.glass_id ? String(r.glass_id) : "", service_style: r?.service_style ?? "",
    alt_glass_id: r?.alt_glass_id ? String(r.alt_glass_id) : "", alt_service_style: r?.alt_service_style ?? "",
    glass_note: r?.glass_note ?? "",
    lines: (r?.lines ?? []).map((l) => ({
      key: ++seq, spec_id: l.spec_id, amount: l.amount ? String(Number(l.amount)) : "", unit: l.unit ?? "",
      required: l.required, role: l.role ?? "", note: l.note ?? "",
    })),
  };
}
const snapshot = (f: Form) => JSON.stringify({ ...f, lines: f.lines.map(({ key: _k, ...l }) => l) });

/** Recipe editor: live "On the menu / Missing" banner, lines with up/down, and a guest preview. */
export function RecipeForm({ recipe, specs: initialSpecs, families, glassware, units }: { recipe: RecipeRow | null; specs: SpecOption[]; families: Family[]; glassware: Glass[]; units: string[] }) {
  const router = useRouter();
  const [specs, setSpecs] = useState(initialSpecs);
  const [f, setF] = useState<Form>(() => initial(recipe));
  const base = useRef(snapshot(initial(recipe)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dupBusy, setDupBusy] = useState(false);
  const dirty = snapshot(f) !== base.current;
  useUnsavedGuard(dirty && !saving);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((o) => ({ ...o, [k]: v }));
  const setLine = (key: number, patch: Partial<Line>) => setF((o) => ({ ...o, lines: o.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const move = (i: number, d: number) => setF((o) => {
    const lines = [...o.lines];
    const j = i + d;
    if (j < 0 || j >= lines.length) return o;
    [lines[i], lines[j]] = [lines[j], lines[i]];
    return { ...o, lines };
  });
  const byId = new Map(specs.map((s) => [s.id, s]));
  const glassName = (id: string) => glassware.find((g) => String(g.id) === id)?.name ?? null;

  const chosen = f.lines.filter((l) => l.spec_id);
  const missing = chosen.filter((l) => l.required && !byId.get(l.spec_id!)?.available).map((l) => byId.get(l.spec_id!)!);
  const onMenu = chosen.length > 0 && missing.length === 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        ...f,
        glass_id: f.glass_id || null, alt_glass_id: f.alt_glass_id || null,
        service_style: f.service_style || null, alt_service_style: f.alt_service_style || null,
        lines: f.lines.filter((l) => l.spec_id).map(({ key: _k, ...l }) => ({ ...l, amount: l.amount || null, unit: l.amount ? l.unit || null : null, role: l.role || null })),
      };
      const r = recipe
        ? await api<{ id: string }>(`/api/admin/recipes/${recipe.id}`, "PUT", body)
        : await api<{ id: string }>("/api/admin/recipes", "POST", body);
      base.current = snapshot(f);
      setSaving(false);
      if (!recipe) router.push(`/admin/recipes/${r.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
      setSaving(false);
    }
  }

  async function duplicate() {
    if (!recipe) return;
    if (dirty && !confirm("Duplicate the saved version? Your unsaved changes won't be copied.")) return;
    setDupBusy(true);
    try {
      const r = await api<{ id: string }>(`/api/admin/recipes/${recipe.id}/duplicate`, "POST");
      base.current = snapshot(f); // skip the unsaved-changes prompt
      router.push(`/admin/recipes/${r.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't duplicate.");
      setDupBusy(false);
    }
  }

  const glass = glassName(f.glass_id);
  const alt = glassName(f.alt_glass_id);

  return (
    <form className="a-form" onSubmit={submit}>
      <BackLink href="/admin/recipes" label="Recipes" dirty={dirty} />
      <div className={onMenu ? "a-banner ok" : "a-banner"} role="status">
        {chosen.length === 0 ? "Add ingredients to see if it can be made." : onMenu ? "On the menu" : (
          <>Missing: {missing.map((s, i) => (
            <span key={s.id}>{i ? ", " : ""}<Link href={`/admin?q=${encodeURIComponent(s.name)}`}>{cap(s.name)}</Link></span>
          ))}</>
        )}
      </div>
      <h1 className="a-h1">{recipe ? "Edit recipe" : "New recipe"}</h1>

      <label className="a-field"><span className="a-label">Name</span>
        <input value={f.name} onChange={(e) => set("name", e.target.value)} required maxLength={120} />
      </label>

      <fieldset className="a-fieldset">
        <legend className="a-label">Glass</legend>
        <div className="a-glasses" role="radiogroup" aria-label="Glass">
          <button type="button" role="radio" aria-checked={!f.glass_id} className={!f.glass_id ? "a-glass on" : "a-glass"} onClick={() => set("glass_id", "")}><span className="a-glass-none">—</span><span>None</span></button>
          {glassware.map((g) => (
            <button key={g.id} type="button" role="radio" aria-checked={f.glass_id === String(g.id)} className={f.glass_id === String(g.id) ? "a-glass on" : "a-glass"} onClick={() => set("glass_id", String(g.id))}>
              <GlassIcon glass={g.name} /><span>{cap(g.name)}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="a-grid2">
        <label className="a-field"><span className="a-label">Served</span>
          <select value={f.service_style} onChange={(e) => set("service_style", e.target.value)}>{SERVICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <label className="a-field"><span className="a-label">Glass note</span>
          <input value={f.glass_note} onChange={(e) => set("glass_note", e.target.value)} placeholder="e.g. one large cube" maxLength={120} />
        </label>
        <label className="a-field"><span className="a-label">Other glass that works</span>
          <select value={f.alt_glass_id} onChange={(e) => set("alt_glass_id", e.target.value)}>
            <option value="">—</option>
            {glassware.map((g) => <option key={g.id} value={g.id}>{cap(g.name)}</option>)}
          </select>
        </label>
        <label className="a-field"><span className="a-label">Served in that glass</span>
          <select value={f.alt_service_style} onChange={(e) => set("alt_service_style", e.target.value)} disabled={!f.alt_glass_id}>{SERVICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
      </div>

      <fieldset className="a-fieldset">
        <legend className="a-label">Ingredients</legend>
        <ol className="a-lines">
          {f.lines.map((l, i) => (
            <li key={l.key} className="a-line">
              <div className="a-line-top">
                <SpecPicker compact specs={specs} families={families} value={l.spec_id} onChange={(id) => setLine(l.key, { spec_id: id })} onCreate={(s) => setSpecs((x) => [...x, s].sort((a, b) => a.name.localeCompare(b.name)))} />
                <div className="a-line-order">
                  <button type="button" className="a-icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                  <button type="button" className="a-icon" onClick={() => move(i, 1)} disabled={i === f.lines.length - 1} aria-label="Move down">↓</button>
                  <button type="button" className="a-icon" onClick={() => setF((o) => ({ ...o, lines: o.lines.filter((x) => x.key !== l.key) }))} aria-label="Remove ingredient">×</button>
                </div>
              </div>
              <div className="a-line-fields">
                <input value={l.amount} onChange={(e) => setLine(l.key, { amount: e.target.value })} inputMode="decimal" placeholder="Amount" aria-label="Amount" />
                <select value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value })} aria-label="Unit">
                  <option value="">unit</option>
                  {units.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <select value={l.role} onChange={(e) => setLine(l.key, { role: e.target.value })} aria-label="Role">{ROLE_LABELS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
                <label className="a-check a-small"><input type="checkbox" checked={!l.required} onChange={(e) => setLine(l.key, { required: !e.target.checked })} /><span>Optional</span></label>
              </div>
              <input className="a-line-note" value={l.note} onChange={(e) => setLine(l.key, { note: e.target.value })} placeholder="Note (optional)" aria-label="Note" maxLength={200} />
            </li>
          ))}
        </ol>
        <button type="button" className="a-btn" onClick={() => setF((o) => ({ ...o, lines: [...o.lines, { key: ++seq, spec_id: null, amount: "", unit: "oz", required: true, role: "", note: "" }] }))}>+ Add ingredient</button>
      </fieldset>

      <label className="a-field"><span className="a-label">Method</span>
        <textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={5} maxLength={4000} placeholder="How to make it. A blank line starts a new paragraph." />
      </label>

      <section className="a-preview" aria-label="Guest preview">
        <h2 className="a-label">Guest preview</h2>
        <div className="a-preview-card">
          <div className="a-preview-title">{glass ? <GlassIcon glass={glass} /> : null}<strong>{f.name || "Untitled"}</strong></div>
          {glass ? <p>{glassLine(glass, f.service_style || null, f.glass_note || null)}</p> : null}
          {alt ? <p className="a-quiet">{altGlassLine(alt, f.alt_service_style || null, f.service_style || null)}</p> : null}
          <ul className="a-preview-lines">
            {chosen.filter((l) => l.required || byId.get(l.spec_id!)?.available).map((l) => {
              const s = byId.get(l.spec_id!)!;
              return (
                <li key={l.key}>
                  <span className="a-quiet">{measure(l.amount || null, l.amount ? l.unit || null : null)}</span>
                  <span>{cap(s.name)}{!s.in_stock ? <span className="tag-out">out tonight</span> : null}{!l.required ? <span className="a-quiet"> · optional</span> : null}</span>
                </li>
              );
            })}
          </ul>
          {!onMenu && chosen.length ? <p className="a-quiet a-small">Guests won&apos;t see this recipe until it can be made.</p> : null}
        </div>
      </section>

      <SaveBar dirty={dirty} saving={saving} error={error} label={recipe ? "Save" : "Add recipe"}>
        {recipe ? <button type="button" className="a-btn" onClick={duplicate} disabled={dupBusy}>{dupBusy ? "Duplicating…" : "Duplicate"}</button> : null}
      </SaveBar>
    </form>
  );
}
