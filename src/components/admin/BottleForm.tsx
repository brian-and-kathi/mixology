"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Family, ProductRow, SpecOption } from "@/lib/admin-data";
import { api } from "./api";
import { BackLink, SaveBar, useUnsavedGuard } from "./SaveBar";
import { SharedPhoto } from "./SharedPhoto";
import { SpecPicker } from "./SpecPicker";

type Form = {
  display_name: string; spec_id: string | null; family_id: string; in_stock: boolean; pourable: boolean;
  serves_neat: boolean; serves_rocks: boolean; serves_chilled: boolean; description: string;
  brand: string; origin: string; abv: string; serve_note: string; upc: string; fortified: boolean;
  wine_color: string; wine_effervescence: string;
};

function initial(p: ProductRow | null): Form {
  return {
    display_name: p?.display_name ?? "", spec_id: p?.spec_id ?? null, family_id: p?.family_id ?? "",
    in_stock: p?.in_stock ?? true, pourable: p ? !p.mix_only : true, serves_neat: p?.serves_neat ?? false,
    serves_rocks: p?.serves_rocks ?? false, serves_chilled: p?.serves_chilled ?? false, description: p?.description ?? "",
    brand: p?.brand ?? "", origin: p?.origin ?? "", abv: p?.abv ? String(Number(p.abv)) : "", serve_note: p?.serve_note ?? "",
    upc: p?.upc ?? "", fortified: p?.fortified ?? false, wine_color: p?.wine_color ?? "not_applicable",
    wine_effervescence: p?.wine_effervescence ?? "not_applicable",
  };
}

/** Add / edit a bottle. Short form first; rarer fields under "More details". */
export function BottleForm({ product, specs: initialSpecs, families, shared }: { product: ProductRow | null; specs: SpecOption[]; families: Family[]; shared: boolean | null }) {
  const router = useRouter();
  const [specs, setSpecs] = useState(initialSpecs);
  const [f, setF] = useState<Form>(() => initial(product));
  const [base] = useState(() => JSON.stringify(initial(product)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(f) !== base;
  useUnsavedGuard(dirty && !saving);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((o) => ({ ...o, [k]: v }));
  const spec = specs.find((s) => s.id === f.spec_id) ?? null;
  const isWine = families.find((x) => x.id === (f.family_id || spec?.family_id))?.kind === "wine";

  // Family follows the type ("What is it?"); only a brand-new type asks for one (in the picker).
  // A new bottle's "Can be poured on its own" starts from the type: drinks-only types start unticked.
  function pickSpec(id: string, list = specs) {
    const s = list.find((x) => x.id === id);
    setF((o) => ({
      ...o, spec_id: id, family_id: s?.family_id ?? o.family_id,
      pourable: product ? o.pourable : !(s?.ingredient_only ?? false),
      ...(product || !s?.ingredient_only ? {} : { serves_neat: false, serves_rocks: false, serves_chilled: false }),
    }));
  }
  const ready = f.display_name.trim().length > 0 && !!f.spec_id;
  const familyName = families.find((x) => x.id === f.family_id)?.name ?? spec?.family ?? null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = { ...f, family_id: f.family_id || spec?.family_id || null };
      if (product) await api(`/api/admin/products/${product.id}`, "PUT", body);
      else await api("/api/admin/products", "POST", body);
      router.push(`/admin/bottles?saved=${encodeURIComponent(f.display_name)}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
      setSaving(false);
    }
  }

  return (
    <form className="a-form" onSubmit={submit}>
      <BackLink href="/admin/bottles" label="Bottles" dirty={dirty} />
      <h1 className="a-h1">{product ? "Edit bottle" : "Add bottle"}</h1>
      {!product ? <SharedPhoto fromShare={shared === true} /> : null}
      {shared === false ? <p className="a-quiet a-small">The photo couldn&apos;t be kept this time (the app wasn&apos;t ready). Share it again if you want it as a reference.</p> : null}

      <label className="a-field">
        <span className="a-label">Name</span>
        <input value={f.display_name} onChange={(e) => set("display_name", e.target.value)} placeholder="Brand and expression, e.g. Buffalo Trace Bourbon" required maxLength={120} />
      </label>

      <SpecPicker label="What is it?" specs={specs} families={families} value={f.spec_id} onChange={(id) => pickSpec(id)} onCreate={(s) => { const next = [...specs, s].sort((a, b) => a.name.localeCompare(b.name)); setSpecs(next); pickSpec(s.id, next); }} />
      {spec?.ingredient_only ? <p className="a-hint">{spec.name.replace(/^./, (c) => c.toUpperCase())} is drinks-only: it won&apos;t appear on Pours or Cellar, but recipes can use it.</p> : null}

      {spec && familyName ? <p className="a-hint">Filed under {familyName.replace(/^./, (c) => c.toUpperCase())} (from the type).</p> : null}
      {spec && !familyName ? (
        <label className="a-field">
          <span className="a-label">Family</span>
          <select className="a-select" value={f.family_id} onChange={(e) => set("family_id", e.target.value)}>
            <option value="">Choose…</option>
            {families.map((x) => <option key={x.id} value={x.id}>{x.name.replace(/^./, (c) => c.toUpperCase())}</option>)}
          </select>
          <span className="a-quiet a-small">This type has no family yet; pick where the bottle is filed on Stock.</span>
        </label>
      ) : null}

      <label className="a-check">
        <input type="checkbox" checked={f.in_stock} onChange={(e) => set("in_stock", e.target.checked)} />
        <span>In stock</span>
      </label>
      <label className="a-check">
        <input type="checkbox" checked={f.pourable} onChange={(e) => set("pourable", e.target.checked)} />
        <span>Can be poured on its own</span>
      </label>
      {f.pourable ? (
        <fieldset className="a-fieldset">
          <legend className="a-label">Usually served</legend>
          <div className="a-toggles">
            <label className="a-check"><input type="checkbox" checked={f.serves_neat} onChange={(e) => set("serves_neat", e.target.checked)} /><span>Neat</span></label>
            <label className="a-check"><input type="checkbox" checked={f.serves_rocks} onChange={(e) => set("serves_rocks", e.target.checked)} /><span>Rocks</span></label>
            <label className="a-check"><input type="checkbox" checked={f.serves_chilled} onChange={(e) => set("serves_chilled", e.target.checked)} /><span>Chilled</span></label>
          </div>
          <p className="a-quiet a-small">Water is always offered on request.</p>
        </fieldset>
      ) : null}

      <label className="a-field">
        <span className="a-label">Notes</span>
        <textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="Tasting note guests see on the pour card" maxLength={2000} />
      </label>

      <details className="a-more">
        <summary>More details</summary>
        <label className="a-field"><span className="a-label">Brand</span><input value={f.brand} onChange={(e) => set("brand", e.target.value)} maxLength={120} /></label>
        <label className="a-field"><span className="a-label">Where it&apos;s from</span><input value={f.origin} onChange={(e) => set("origin", e.target.value)} maxLength={120} /></label>
        <label className="a-field"><span className="a-label">ABV %</span><input value={f.abv} onChange={(e) => set("abv", e.target.value)} inputMode="decimal" /></label>
        <label className="a-field"><span className="a-label">Serving note</span><input value={f.serve_note} onChange={(e) => set("serve_note", e.target.value)} maxLength={200} placeholder="e.g. Best with a single large cube" /></label>
        <label className="a-field"><span className="a-label">Barcode</span><input value={f.upc} onChange={(e) => set("upc", e.target.value)} inputMode="numeric" /></label>
        {isWine ? (
          <>
            <label className="a-field"><span className="a-label">Wine color</span>
              <select value={f.wine_color} onChange={(e) => set("wine_color", e.target.value)}>
                <option value="not_applicable">Not a wine</option><option value="red">Red</option><option value="white">White</option><option value="rose">Rosé</option><option value="unknown">Not sure</option>
              </select>
            </label>
            <label className="a-field"><span className="a-label">Bubbles</span>
              <select value={f.wine_effervescence} onChange={(e) => set("wine_effervescence", e.target.value)}>
                <option value="not_applicable">Not a wine</option><option value="still">Still</option><option value="sparkling">Sparkling</option>
              </select>
            </label>
            <label className="a-check"><input type="checkbox" checked={f.fortified} onChange={(e) => set("fortified", e.target.checked)} /><span>Fortified (vermouth, sherry, port)</span></label>
          </>
        ) : null}
      </details>

      <SaveBar isNew={!product} dirty={dirty} ready={ready} saving={saving} error={error} newLabel="Add bottle" />
    </form>
  );
}
