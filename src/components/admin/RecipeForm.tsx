"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { GlassIcon } from "@/components/GlassIcon";
import type { Family, Glass, RecipeRow, SpecOption } from "@/lib/admin-data";
import { altGlassLine, cap, glassLine, lineText, methodParts, METHOD_STYLES, NO_AMOUNT_UNITS, glassName } from "@/lib/format";
import { api } from "./api";
import { BackLink, SaveBar, useUnsavedGuard } from "./SaveBar";
import { SpecPicker } from "./SpecPicker";
import { MoodPicker } from "./MoodPicker";
import { MAX_ALTERNATES, orText } from "@/lib/alternates";

/** An alternate (migration 034): blank amount = the line's; `own` = "different amount" opened. */
type Alt = { key: number; spec_id: string; amount: string; unit: string; note: string; own: boolean };
type Line = { key: number; spec_id: string | null; amount: string; unit: string; required: boolean; role: string; note: string; alts: Alt[]; adding?: boolean };
type Form = { name: string; description: string; method_style: string; glass_id: string; service_style: string; alt_glass_id: string; alt_service_style: string; glass_note: string; moods: string[]; featured: boolean; lines: Line[] };

const SERVICES: [string, string][] = [["", "—"], ["up", "Up (chilled, no ice)"], ["on the rocks", "Rocks (over ice)"], ["neat", "Neat (no ice)"], ["hot", "Hot"]];
const ROLE_LABELS: [string, string][] = [["", "—"], ["base", "Base"], ["modifier", "Modifier"], ["juice", "Juice"], ["sweetener", "Sweetener"], ["garnish", "Garnish"], ["other", "Other"]];

let seq = 0;
function initial(r: RecipeRow | null): Form {
  return {
    name: r?.name ?? "", description: r?.description ?? "", method_style: r?.method_style ?? "",
    glass_id: r?.glass_id ? String(r.glass_id) : "", service_style: r?.service_style ?? "",
    alt_glass_id: r?.alt_glass_id ? String(r.alt_glass_id) : "", alt_service_style: r?.alt_service_style ?? "",
    glass_note: r?.glass_note ?? "", moods: r?.moods ?? [], featured: r?.featured ?? false,
    lines: (r?.lines ?? []).map((l) => ({
      key: ++seq, spec_id: l.spec_id, amount: l.amount ? String(Number(l.amount)) : "", unit: l.unit ?? "",
      required: l.required, role: l.role ?? "", note: l.note ?? "",
      alts: (l.alternates ?? []).map((a) => ({
        key: ++seq, spec_id: a.spec_id, amount: a.amount ? String(Number(a.amount)) : "", unit: a.unit ?? "", note: a.note ?? "",
        own: a.amount !== null || a.unit !== null,
      })),
    })),
  };
}
const snapshot = (f: Form) => JSON.stringify({ ...f, lines: f.lines.map(({ key: _k, adding: _a, alts, ...l }) => ({ ...l, alts: alts.map(({ key: _ak, own, ...a }) => ({ ...a, amount: own ? a.amount : "", unit: own ? a.unit : "" })) })) });

/** Recipe editor: live "On the menu / Missing" banner, lines with up/down, and a guest preview. */
export function RecipeForm({ recipe, specs: initialSpecs, families, glassware, units }: { recipe: RecipeRow | null; specs: SpecOption[]; families: Family[]; glassware: Glass[]; units: string[] }) {
  const router = useRouter();
  const [specs, setSpecs] = useState(initialSpecs);
  const [f, setF] = useState<Form>(() => initial(recipe));
  const base = useRef(snapshot(initial(recipe)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dupBusy, setDupBusy] = useState(false);
  const [saved, setSaved] = useState(false);
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
  // Alternates (migration 034): sub-rows of a line, position = guest priority.
  const setAlts = (key: number, fn: (alts: Alt[], l: Line) => Alt[]) => setF((o) => ({ ...o, lines: o.lines.map((l) => (l.key === key ? { ...l, alts: fn(l.alts, l) } : l)) }));
  const setAlt = (key: number, akey: number, patch: Partial<Alt>) => setAlts(key, (alts) => alts.map((a) => (a.key === akey ? { ...a, ...patch } : a)));
  const moveAlt = (key: number, j: number, d: number) => setAlts(key, (alts) => {
    const k = j + d;
    if (k < 0 || k >= alts.length) return alts;
    const out = [...alts];
    [out[j], out[k]] = [out[k], out[j]];
    return out;
  });
  const addAlt = (key: number, spec_id: string) => setF((o) => ({ ...o, lines: o.lines.map((l) => {
    if (l.key !== key) return l;
    if (spec_id === l.spec_id || l.alts.some((a) => a.spec_id === spec_id) || l.alts.length >= MAX_ALTERNATES) return { ...l, adding: false };
    return { ...l, adding: false, alts: [...l.alts, { key: ++seq, spec_id, amount: "", unit: "", note: "", own: false }] };
  }) }));
  // "Make main": the alternate and the line's ingredient trade places, each keeping its own amount and note.
  const makeMain = (key: number, akey: number) => setF((o) => ({ ...o, lines: o.lines.map((l) => {
    if (l.key !== key || !l.spec_id) return l;
    const a = l.alts.find((x) => x.key === akey);
    if (!a) return l;
    const back: Alt = { key: a.key, spec_id: l.spec_id, note: l.note, own: a.own, amount: a.own ? l.amount : "", unit: a.own ? l.unit : "" };
    return { ...l, spec_id: a.spec_id, note: a.note, amount: a.own ? a.amount : l.amount, unit: a.own ? a.unit : l.unit, alts: l.alts.map((x) => (x.key === akey ? back : x)) };
  }) }));
  const byId = new Map(specs.map((s) => [s.id, s]));
  const glassName = (id: string) => glassware.find((g) => String(g.id) === id)?.name ?? null;

  const chosen = f.lines.filter((l) => l.spec_id);
  // A line is covered when its ingredient or any alternate is available (same rule as menu_mixed).
  const covered = (l: Line) => !!byId.get(l.spec_id!)?.available || l.alts.some((a) => byId.get(a.spec_id)?.available);
  const missing = chosen.filter((l) => l.required && !covered(l)).map((l) => byId.get(l.spec_id!)!);
  const onMenu = chosen.length > 0 && missing.length === 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        ...f,
        glass_id: f.glass_id || null, alt_glass_id: f.alt_glass_id || null,
        service_style: f.service_style || null, alt_service_style: f.alt_service_style || null, method_style: f.method_style || null,
        lines: f.lines.filter((l) => l.spec_id).map(({ key: _k, adding: _a, alts, ...l }) => {
          const noAmount = NO_AMOUNT_UNITS.includes(l.unit);
          return {
            ...l, amount: noAmount ? null : l.amount || null, unit: noAmount ? l.unit : l.amount ? l.unit || null : null, role: l.role || null,
            // Blank amount = the line's (stored as NULL); "top"/"rinse" take no amount.
            alternates: alts.map((a) => {
              const own = a.own && (a.amount !== "" || NO_AMOUNT_UNITS.includes(a.unit));
              const none = NO_AMOUNT_UNITS.includes(a.unit);
              return { spec_id: a.spec_id, note: a.note.trim() || null, amount: own && !none ? a.amount : null, unit: own ? a.unit || null : null };
            }),
          };
        }),
      };
      const r = recipe
        ? await api<{ id: string }>(`/api/admin/recipes/${recipe.id}`, "PUT", body)
        : await api<{ id: string }>("/api/admin/recipes", "POST", body);
      base.current = snapshot(f);
      setSaving(false);
      setSaved(true);
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
  const preview = methodParts(f.description || null, f.method_style || null);
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

      {/* Featured (migration 040), mirroring the bottle switch: copper tag and first in its section on the phone,
          flourish and pinned first on the TV. A drink that needs a reserved bottle is locked and never shows as featured. */}
      <div className="a-checks-row">
        <label className="a-check">
          <input type="checkbox" checked={f.featured} onChange={(e) => set("featured", e.target.checked)} />
          <span>Featured</span>
        </label>
      </div>

      <fieldset className="a-fieldset">
        <legend className="a-label">Glass</legend>
        <div className="a-glasses" role="radiogroup" aria-label="Glass">
          <button type="button" role="radio" aria-checked={!f.glass_id} className={!f.glass_id ? "a-glass on" : "a-glass"} onClick={() => set("glass_id", "")}><span className="a-glass-none">—</span><span>None</span></button>
          {glassware.map((g) => (
            <button key={g.id} type="button" role="radio" aria-checked={f.glass_id === String(g.id)} className={f.glass_id === String(g.id) ? "a-glass on" : "a-glass"} onClick={() => set("glass_id", String(g.id))}>
              <GlassIcon glass={g.name} /><span>{glassName(g.name)}</span>
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
            {glassware.map((g) => <option key={g.id} value={g.id}>{glassName(g.name)}</option>)}
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
              {/* Name on its own full-width row, then amount + unit, then role + optional, then actions. */}
              <SpecPicker compact specs={specs} families={families} value={l.spec_id} onChange={(id) => setLine(l.key, { spec_id: id, alts: l.alts.filter((a) => a.spec_id !== id) })} onCreate={(s) => setSpecs((x) => [...x, s].sort((a, b) => a.name.localeCompare(b.name)))} />
              <div className="a-line-row">
                <input value={NO_AMOUNT_UNITS.includes(l.unit) ? "" : l.amount} onChange={(e) => setLine(l.key, { amount: e.target.value })} inputMode="decimal"
                  placeholder={NO_AMOUNT_UNITS.includes(l.unit) ? "No amount" : "Amount"} aria-label="Amount" disabled={NO_AMOUNT_UNITS.includes(l.unit)} />
                <select value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value })} aria-label="Unit">
                  <option value="">unit</option>
                  {units.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="a-line-row">
                <select value={l.role} onChange={(e) => setLine(l.key, { role: e.target.value })} aria-label="Role">{ROLE_LABELS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
                <label className="a-check a-line-opt"><input type="checkbox" checked={!l.required} onChange={(e) => setLine(l.key, { required: !e.target.checked })} /><span>Optional</span></label>
              </div>
              <input className="a-line-note" value={l.note} onChange={(e) => setLine(l.key, { note: e.target.value })} placeholder="Note (optional)" aria-label="Note" maxLength={200} />
              {/* Alternates (migration 034): indented "or" rows; ↑↓ = guest priority. */}
              {l.alts.length ? (
                <ol className="a-alts" aria-label="Alternates">
                  {l.alts.map((a, j) => {
                    const sp = byId.get(a.spec_id);
                    return (
                      <li key={a.key} className="a-alt">
                        <div className="a-alt-row">
                          <span className="a-alt-move">
                            <button type="button" className="a-icon a-icon-sm" onClick={() => moveAlt(l.key, j, -1)} disabled={j === 0} aria-label={`Move ${sp?.name ?? "alternate"} up`}>↑</button>
                            <button type="button" className="a-icon a-icon-sm" onClick={() => moveAlt(l.key, j, 1)} disabled={j === l.alts.length - 1} aria-label={`Move ${sp?.name ?? "alternate"} down`}>↓</button>
                          </span>
                          <span className="a-alt-or">or</span>
                          <span className="a-alt-name">{cap(sp?.name ?? "?")}</span>
                          <span className={sp?.in_stock ? "a-dot on" : "a-dot"} role="img" aria-label={sp?.in_stock ? "in stock" : sp?.available ? "via stand-in" : "out"} title={sp?.in_stock ? "In stock" : sp?.available ? "Via stand-in" : "Out"} />
                          <button type="button" className="a-link a-alt-main" onClick={() => makeMain(l.key, a.key)}>Make main</button>
                          <button type="button" className="a-icon a-icon-sm a-alt-x" onClick={() => setAlts(l.key, (alts) => alts.filter((x) => x.key !== a.key))} aria-label={`Remove ${sp?.name ?? "alternate"}`}>×</button>
                        </div>
                        <div className="a-alt-more">
                          {a.own ? (
                            <span className="a-alt-amount">
                              <input value={NO_AMOUNT_UNITS.includes(a.unit) ? "" : a.amount} onChange={(e) => setAlt(l.key, a.key, { amount: e.target.value })} inputMode="decimal"
                                placeholder={NO_AMOUNT_UNITS.includes(a.unit) ? "No amount" : "Amount"} aria-label={`Amount of ${sp?.name ?? "alternate"}`} disabled={NO_AMOUNT_UNITS.includes(a.unit)} />
                              <select value={a.unit || l.unit} onChange={(e) => setAlt(l.key, a.key, { unit: e.target.value })} aria-label={`Unit of ${sp?.name ?? "alternate"}`}>
                                <option value="">unit</option>
                                {units.map((u) => <option key={u} value={u}>{u}</option>)}
                              </select>
                              <button type="button" className="a-link a-small" onClick={() => setAlt(l.key, a.key, { own: false, amount: "", unit: "" })}>same amount</button>
                            </span>
                          ) : (
                            // "1½ oz · change": the line's amount, on one line under the "or"; "change" opens the override.
                            <span className="a-alt-same">
                              <span>{lineText(l.amount || null, l.unit || null, "").amount || l.unit || "no amount"}</span>
                              <span aria-hidden="true">{"\u00a0·\u00a0"}</span>
                              <button type="button" className="a-link a-small" onClick={() => setAlt(l.key, a.key, { own: true, unit: a.unit || l.unit })}
                                aria-label={`Change the amount for ${sp?.name ?? "this alternate"}`}>change</button>
                            </span>
                          )}
                          <input className="a-alt-note" value={a.note} onChange={(e) => setAlt(l.key, a.key, { note: e.target.value })} placeholder="Note (optional)" aria-label={`Note for ${sp?.name ?? "alternate"}`} maxLength={200} />
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : null}
              {l.adding ? (
                <div className="a-alt-add">
                  <SpecPicker compact defaultOpen specs={specs} families={families} value={null} exclude={[l.spec_id ?? "", ...l.alts.map((a) => a.spec_id)]}
                    onChange={(id) => addAlt(l.key, id)} onDismiss={() => setLine(l.key, { adding: false })}
                    onCreate={(s) => setSpecs((x) => [...x, s].sort((a, b) => a.name.localeCompare(b.name)))} />
                </div>
              ) : l.spec_id && l.alts.length < MAX_ALTERNATES ? (
                <button type="button" className="a-link a-alt-plus" onClick={() => setLine(l.key, { adding: true })}>+ or…</button>
              ) : null}
              <div className="a-line-actions">
                <button type="button" className="a-icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                <button type="button" className="a-icon" onClick={() => move(i, 1)} disabled={i === f.lines.length - 1} aria-label="Move down">↓</button>
                <button type="button" className="a-icon a-icon-remove" onClick={() => setF((o) => ({ ...o, lines: o.lines.filter((x) => x.key !== l.key) }))} aria-label="Remove ingredient">Remove</button>
              </div>
            </li>
          ))}
        </ol>
        <button type="button" className="a-btn" onClick={() => setF((o) => ({ ...o, lines: [...o.lines, { key: ++seq, spec_id: null, amount: "", unit: "oz", required: true, role: "", note: "", alts: [] }] }))}>+ Add ingredient</button>
      </fieldset>

      <label className="a-field"><span className="a-label">Style</span>
        <select value={f.method_style} onChange={(e) => set("method_style", e.target.value)}>
          <option value="">—</option>
          {METHOD_STYLES.map((m) => <option key={m} value={m}>{cap(m)}</option>)}
        </select>
      </label>
      <label className="a-field"><span className="a-label">Method</span>
        <textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={5} maxLength={4000} placeholder="How to make it. A blank line starts a new paragraph." />
      </label>

      {/* Mood tags (migration 033): the phone menu's mood chips. */}
      <MoodPicker value={f.moods} onChange={(m) => set("moods", m)} />

      <section className="a-preview" aria-label="Guest preview">
        <h2 className="a-label">Guest preview</h2>
        <div className="a-preview-card">
          <div className="a-preview-title">{glass ? <GlassIcon glass={glass} /> : null}<strong>{f.name || "Untitled"}</strong></div>
          {glass ? <p>{glassLine(glass, f.service_style || null, f.glass_note || null)}</p> : null}
          {alt ? <p className="a-quiet">{altGlassLine(alt, f.alt_service_style || null, f.service_style || null)}</p> : null}
          <ul className="a-preview-lines">
            {chosen.filter((l) => l.required || covered(l)).map((l) => {
              // Like the guest page: in-stock choices only; an alternate leads when the line's ingredient is out.
              const own = byId.get(l.spec_id!)!;
              const inAlts = l.alts.filter((a) => byId.get(a.spec_id)?.in_stock);
              const lead = own.in_stock ? null : inAlts[0] ?? null;
              const s = lead ? byId.get(lead.spec_id)! : own;
              const amount = lead?.own ? lead.amount : l.amount, unit = lead?.own ? lead.unit || l.unit : l.unit;
              const t = lineText(NO_AMOUNT_UNITS.includes(unit) ? null : amount || null, NO_AMOUNT_UNITS.includes(unit) || amount ? unit || null : null, s.name);
              const or = orText(inAlts.filter((a) => a !== lead).map((a) => cap(byId.get(a.spec_id)!.name)));
              return (
                <li key={l.key}>
                  <span className="a-quiet">{t.amount}</span>
                  <span>{t.name}{or.text ? <span className="alt-or"> {or.text}{or.more.length ? ` +${or.more.length}` : ""}</span> : null}{!s.in_stock ? <span className="tag-out">out tonight</span> : null}{!l.required ? <span className="a-quiet"> (optional)</span> : null}</span>
                </li>
              );
            })}
          </ul>
          {preview.paragraphs.length ? (
            <div className="a-preview-method">
              <p className="a-label">{preview.label}</p>
              {preview.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
            </div>
          ) : null}
          {!onMenu && chosen.length ? <p className="a-quiet a-small">Guests won&apos;t see this recipe until it can be made.</p> : null}
        </div>
      </section>

      <SaveBar isNew={!recipe} dirty={dirty} ready={f.name.trim().length > 0 && chosen.length > 0} saving={saving} saved={saved} error={error} newLabel="Add recipe">
        {recipe ? <button type="button" className="a-btn" onClick={duplicate} disabled={dupBusy}>{dupBusy ? "Duplicating…" : "Duplicate"}</button> : null}
      </SaveBar>
    </form>
  );
}
