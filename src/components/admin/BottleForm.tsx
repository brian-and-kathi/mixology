"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Family, ProductRow, SpecOption } from "@/lib/admin-data";
import { api } from "./api";
import { BackLink, SaveBar, useUnsavedGuard } from "./SaveBar";
import { SharedPhoto } from "./SharedPhoto";
import { SpecPicker } from "./SpecPicker";
import { specLabel } from "@/lib/spec-label";
import { Disclosure } from "./Disclosure";
import { formatUpc } from "@/lib/format";
import { KeyIcon } from "@/components/ReservedIcon";
import { MoodPicker } from "./MoodPicker";

type Form = {
  display_name: string; short_name: string; spec_label: string; spec_id: string | null; family_id: string; in_stock: boolean; featured: boolean; reserved: boolean; reserved_note: string; pourable: boolean;
  serves_neat: boolean; serves_rocks: boolean; serves_chilled: boolean; description: string;
  brand: string; origin: string; abv: string; serve_note: string; upc: string; fortified: boolean;
  wine_color: string; wine_effervescence: string; grape: string; moods: string[];
};

function initial(p: ProductRow | null): Form {
  return {
    display_name: p?.display_name ?? "", short_name: p?.short_name ?? "", spec_label: p?.spec_label ?? "", spec_id: p?.spec_id ?? null, family_id: p?.family_id ?? "",
    in_stock: p?.in_stock ?? true, featured: p?.featured ?? false, reserved: p?.reserved ?? false, reserved_note: p?.reserved_note ?? "", pourable: p ? !p.mix_only : true, serves_neat: p?.serves_neat ?? false,
    serves_rocks: p?.serves_rocks ?? false, serves_chilled: p?.serves_chilled ?? false, description: p?.description ?? "",
    brand: p?.brand ?? "", origin: p?.origin ?? "", abv: p?.abv ? String(Number(p.abv)) : "", serve_note: p?.serve_note ?? "",
    upc: p?.upc ?? "", fortified: p?.fortified ?? false, wine_color: p?.wine_color ?? "not_applicable",
    wine_effervescence: p?.wine_effervescence ?? "not_applicable", grape: p?.grape ?? "", moods: p?.moods ?? [],
  };
}

/** Add / edit a bottle. Short form first; rarer fields under "More details". */
/** `wine` + `presetSpecId`: "Add wine" from the Wines view, with a wine type already chosen in "What is it?". */
/** `grapes`: grapes already on a bottle (migration 031), offered as suggestions in the wine-only Grape field. */
export function BottleForm({ product, specs: initialSpecs, families, shared, wine = false, presetSpecId = null, featuredCount = 0, grapes = [] }: { product: ProductRow | null; specs: SpecOption[]; families: Family[]; shared: boolean | null; wine?: boolean; presetSpecId?: string | null; featuredCount?: number; grapes?: string[] }) {
  const router = useRouter();
  const [specs, setSpecs] = useState(initialSpecs);
  const kindOf = (s: SpecOption | undefined) => families.find((x) => x.id === s?.family_id)?.kind;
  // A new wine starts "Chilled", or "Room temp" when the type is red (per Rachel). Wines reuse the same
  // columns as spirits: Room temp = serves_neat, Over ice = serves_rocks, Chilled = serves_chilled.
  const wineServe = (s: SpecOption | undefined) => {
    const red = /\bred\b/i.test(s?.name ?? "");
    return { serves_neat: red, serves_rocks: false, serves_chilled: !red };
  };
  const start = () => {
    const f0 = initial(product);
    const s0 = !product && presetSpecId ? initialSpecs.find((x) => x.id === presetSpecId) : undefined;
    if (!s0) return f0;
    const serve = kindOf(s0) === "wine" && !s0.ingredient_only ? wineServe(s0) : {};
    return { ...f0, spec_id: s0.id, family_id: s0.family_id ?? "", pourable: !s0.ingredient_only, ...serve };
  };
  const [f, setF] = useState<Form>(start);
  const [base] = useState(() => JSON.stringify(start()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serveTouched, setServeTouched] = useState(false);
  const dirty = JSON.stringify(f) !== base;
  useUnsavedGuard(dirty && !saving);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((o) => ({ ...o, [k]: v }));
  const spec = specs.find((s) => s.id === f.spec_id) ?? null;
  const isWine = families.find((x) => x.id === (f.family_id || spec?.family_id))?.kind === "wine";

  // Family follows the type ("What is it?"); only a brand-new type asks for one (in the picker).
  // A new bottle's "Can be poured on its own" starts from the type: drinks-only types start unticked.
  // A new bottle's "Usually served" follows the type until someone ticks a box: wines get the wine default.
  function pickSpec(id: string, list = specs) {
    const s = list.find((x) => x.id === id);
    const none = { serves_neat: false, serves_rocks: false, serves_chilled: false };
    const serve = product ? {} : s?.ingredient_only ? none : serveTouched ? {} : kindOf(s) === "wine" ? wineServe(s) : none;
    setF((o) => ({
      ...o, spec_id: id, family_id: s?.family_id ?? o.family_id,
      pourable: product ? o.pourable : !(s?.ingredient_only ?? false), ...serve,
    }));
  }
  const setServe = (k: "serves_neat" | "serves_rocks" | "serves_chilled", v: boolean) => { setServeTouched(true); set(k, v); };
  const serveChoices: ["serves_neat" | "serves_rocks" | "serves_chilled", string][] = isWine
    ? [["serves_chilled", "Chilled"], ["serves_neat", "Room temp"], ["serves_rocks", "Over ice"]]
    : [["serves_neat", "Neat"], ["serves_rocks", "Rocks"], ["serves_chilled", "Chilled"]];
  const ready = f.display_name.trim().length > 0 && !!f.spec_id;
  const familyName = families.find((x) => x.id === f.family_id)?.name ?? spec?.family ?? null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // Grape is for wines only: anything else saves none (migration 031).
      const body = { ...f, family_id: f.family_id || spec?.family_id || null, grape: isWine ? f.grape.trim() : "", reserved_note: f.reserved ? f.reserved_note.trim() : "" };
      if (product) await api(`/api/admin/products/${product.id}`, "PUT", body);
      else await api("/api/admin/products", "POST", body);
      router.push(`/admin?saved=${encodeURIComponent(f.display_name)}`); // Stock (the Bottles list is gone)
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
      setSaving(false);
    }
  }

  return (
    <form className="a-form" onSubmit={submit}>
      <BackLink href="/admin" label="Stock" dirty={dirty} />
      <h1 className="a-h1">{product ? "Edit bottle" : wine ? "Add wine" : "Add bottle"}</h1>
      {!product ? <SharedPhoto fromShare={shared === true} /> : null}
      {shared === false ? <p className="a-quiet a-small">The photo couldn&apos;t be kept this time (the app wasn&apos;t ready). Share it again if you want it as a reference.</p> : null}

      <label className="a-field">
        <span className="a-label">Name</span>
        <input value={f.display_name} onChange={(e) => set("display_name", e.target.value)} placeholder={wine ? "Producer and wine, e.g. Barefoot Moscato" : "Brand and expression, e.g. Buffalo Trace Bourbon"} required maxLength={120} />
      </label>

      {/* Short name (migration 023): what guests read where the type is already said. Plain admin styling. */}
      <label className="a-field">
        <span className="a-label">Short name</span>
        <input value={f.short_name} onChange={(e) => set("short_name", e.target.value)} placeholder={f.display_name.trim() || "e.g. Buffalo Trace"} maxLength={120} />
        <span className="a-quiet a-small">
          {isWine && !spec?.ingredient_only
            ? "Cellar wines show their full name for now."
            : `The name without its type, e.g. “Bowright Recurve” for Bowright Recurve Rye. Guests see it on Pours${spec ? ` next to “${specLabel(spec.name)}”` : " next to the type"} and under recipe ingredients. Leave empty to use the full name.`}
        </span>
      </label>

      <SpecPicker label="What is it?" specs={specs} families={families} value={f.spec_id} onChange={(id) => pickSpec(id)} onCreate={(s) => { const next = [...specs, s].sort((a, b) => a.name.localeCompare(b.name)); setSpecs(next); pickSpec(s.id, next); }} />
      {spec?.ingredient_only ? <p className="a-hint">{spec.name.replace(/^./, (c) => c.toUpperCase())} is drinks-only: it won&apos;t appear on Pours or Cellar, but recipes can use it.</p> : null}

      {/* Region and ABV sit with the type: guests see them under the name on Pours and Cellar. */}
      <div className="a-grid2 a-grid2-tight">
        <label className="a-field"><span className="a-label">Region</span><input value={f.origin} onChange={(e) => set("origin", e.target.value)} maxLength={120} placeholder={wine ? "e.g. California" : "e.g. Kentucky"} /></label>
        <label className="a-field"><span className="a-label">ABV %</span><input value={f.abv} onChange={(e) => set("abv", e.target.value)} inputMode="decimal" placeholder={isWine || (wine && !spec) ? "e.g. 13" : "e.g. 40"} /></label>
      </div>

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

      <div className="a-checks-row">
        <label className="a-check">
          <input type="checkbox" checked={f.in_stock} onChange={(e) => set("in_stock", e.target.checked)} />
          <span>In stock</span>
        </label>
        {/* Featured and Reserved (migration 032) are never both on: turning one on turns the other off (saveProduct
            and a CHECK enforce it too). Neither touches In stock. */}
        <label className="a-check">
          <input type="checkbox" checked={f.featured} onChange={(e) => setF((o) => ({ ...o, featured: e.target.checked, reserved: e.target.checked ? false : o.reserved }))} />
          <span>Featured</span>
        </label>
        <label className="a-check">
          <input type="checkbox" checked={f.reserved} onChange={(e) => setF((o) => ({ ...o, reserved: e.target.checked, featured: e.target.checked ? false : o.featured }))} />
          <span className="a-reserved-label"><KeyIcon /> Reserved</span>
        </label>
      </div>
      {f.reserved ? (
        <label className="a-field">
          <span className="a-label">Occasion note (optional)</span>
          <input value={f.reserved_note} onChange={(e) => set("reserved_note", e.target.value)} maxLength={40} placeholder="What's it's purpose?" />
          <span className="a-quiet a-small">Guests still see it on the menu, locked: “Reserved”{f.reserved_note.trim() ? `, “Saved for ${f.reserved_note.trim()}”` : ""}. Drinks that need it are locked too.</span>
        </label>
      ) : null}
      {/* Soft warning (migration 030): more than 3 bottles Featured and in stock (what guests see). Non-blocking.
          featuredCount is the saved total; this bottle counts as it is on the form. */}
      {(featuredCount + (f.featured && f.in_stock ? 1 : 0) - (product?.featured && product.in_stock ? 1 : 0)) > 3 ? (
        <p className="a-warn" role="status">More than 3 in-stock bottles are Featured. Guests will see them all; three or fewer usually works best.</p>
      ) : null}
      <label className="a-check">
        <input type="checkbox" checked={f.pourable} onChange={(e) => set("pourable", e.target.checked)} />
        <span>Can be poured on its own</span>
      </label>
      {f.pourable ? (
        <fieldset className="a-fieldset">
          <legend className="a-label">Usually served</legend>
          <div className="a-toggles">
            {serveChoices.map(([k, label]) => (
              <label key={k} className="a-check"><input type="checkbox" checked={f[k]} onChange={(e) => setServe(k, e.target.checked)} /><span>{label}</span></label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <label className="a-field">
        <span className="a-label">Notes</span>
        <textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="Tasting note guests see on the pour card" maxLength={2000} />
      </label>

      {/* Mood tags (migration 033): the phone menu's mood chips. */}
      <MoodPicker value={f.moods} onChange={(m) => set("moods", m)} />

      <Disclosure className="a-more" headClassName="a-more-head" bodyClassName="a-more-body" summary="More details">
        <label className="a-field"><span className="a-label">Brand</span><input value={f.brand} onChange={(e) => set("brand", e.target.value)} maxLength={120} /></label>
        <label className="a-field"><span className="a-label">Serving note</span><input value={f.serve_note} onChange={(e) => set("serve_note", e.target.value)} maxLength={200} placeholder="e.g. Best with a single large cube" /></label>
        <label className="a-field"><span className="a-label">Barcode</span><input value={f.upc} onChange={(e) => set("upc", e.target.value)} inputMode="numeric" />
          {/* The input keeps the stored digits; the printed form (lib/format formatUpc) is shown under it. Display only. */}
          {f.upc.trim() && formatUpc(f.upc.trim()) !== f.upc.trim() ? <span className="a-quiet a-small">Printed: {formatUpc(f.upc.trim())}</span> : null}
        </label>
        {isWine ? (
          <>
            <label className="a-field"><span className="a-label">Wine color</span>
              <select value={f.wine_color} onChange={(e) => set("wine_color", e.target.value)}>
                <option value="not_applicable">Not a wine</option><option value="red">Red</option><option value="white">White</option><option value="rose">Rosé</option><option value="unknown">Not sure</option>
              </select>
            </label>
            {/* Grape (migration 031): the wine's category on the Cellar. Free text, with the grapes already in use as
                suggestions; empty = the type's label (Sangria, Sake). Not an ingredient: recipes still match the type. */}
            <label className="a-field"><span className="a-label">Grape</span>
              <input value={f.grape} onChange={(e) => set("grape", e.target.value)} list="grape-suggestions" maxLength={80} placeholder="e.g. Cabernet Sauvignon" autoComplete="off" />
              <datalist id="grape-suggestions">{grapes.map((g) => <option key={g} value={g} />)}</datalist>
              <span className="a-quiet a-small">Guests see it as the wine&apos;s category on the Cellar. Leave empty to use the type{spec ? ` (“${specLabel(spec.name)}”)` : ""}.</span>
            </label>
            <label className="a-field"><span className="a-label">Bubbles</span>
              <select value={f.wine_effervescence} onChange={(e) => set("wine_effervescence", e.target.value)}>
                <option value="not_applicable">Not a wine</option><option value="still">Still</option><option value="sparkling">Sparkling</option>
              </select>
            </label>
            <label className="a-check"><input type="checkbox" checked={f.fortified} onChange={(e) => set("fortified", e.target.checked)} /><span>Fortified (vermouth, sherry, port)</span></label>
          </>
        ) : null}
      </Disclosure>

      <SaveBar isNew={!product} dirty={dirty} ready={ready} saving={saving} error={error} newLabel={wine ? "Add wine" : "Add bottle"} />
    </form>
  );
}
