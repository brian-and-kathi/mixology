import { randomUUID } from "node:crypto";
import { lineStatements, readAlternates } from "@/lib/alternates-db";
import { addSubstitution, deleteSubstitution, RECIPE_UNITS } from "@/lib/admin-write";
import { formatUpc, upcSearchText } from "@/lib/format";
import { normalizeOrigin } from "@/lib/us-states";
import {
  EFFERVESCENCE, KINDS, RATINGS, ROLES, SECTIONS, UNITS, WINE_COLORS,
  area, check, esc, field, heading, options, page, select, text,
} from "@/lib/db-admin/html";
import {
  aliasesFromText, blank, checked, dbMessage, isUserError, isUuid, log, lowerName, many, numberOrNull, q, slugify, tx, ValidationError,
} from "@/lib/db-admin/util";

const DB = "/db";
const NO_AMOUNT = new Set(["top", "rinse"]);
const METHOD = ["", "stirred", "shaken", "built", "blended", "rolled", "thrown", "swizzled", "warm", "warm, in a mug", "warm, batch"];
const SERVICE = ["", "up", "on the rocks", "neat", "hot"];

type Bag = Record<string, unknown>;

function html(status: number, body: string): Response {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
function go(req: Request, path: string): Response {
  return Response.redirect(new URL(path, req.url), 303);
}
function notFound(active: string, message: string): Response {
  return html(404, page({ title: "Not found", active, body: `<p>${esc(message)}</p>` }));
}
function requireUuid(value: string): string {
  if (!isUuid(value)) throw Object.assign(new Error("Not found"), { status: 404 });
  return value;
}

function deleteForm(action: string, label: string) {
  return `<form method="post" action="${action}" onsubmit="return confirm('Delete this record?')">
    <button class="danger" type="submit">${esc(label)}</button></form>`;
}
function deleteIcon(action: string, label: string, confirmText: string) {
  return `<form method="post" action="${action}" onsubmit="return confirm('${confirmText.replace(/'/g, "")}')">
    <button class="icon" type="submit" aria-label="${esc(label)}" title="${esc(label)}">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13M10 11v6M14 11v6"/>
      </svg>
    </button></form>`;
}
function searchForm(tip: string, key: string) {
  return `<form class="search" onsubmit="return false">
    <span class="label" data-tip="${esc(tip)}">Search</span>
    <span class="search-box">
      <input data-live-search data-search-key="${esc(key)}" name="q" value="" placeholder="Search" aria-label="Search" autocomplete="off">
      <button type="button" class="search-clear" data-search-clear aria-label="Clear search" hidden>x</button>
    </span></form>`;
}

async function formOf(req: Request): Promise<Bag> {
  const fd = await req.formData();
  const body: Bag = {};
  for (const [key, value] of fd.entries()) {
    if (typeof value !== "string") continue;
    const nested = key.match(/^([^[]+)\[(\d+)\]\[([^\]]+)\]$/);
    if (nested) {
      const [, group, index, fieldName] = nested;
      const bucket = (body[group] ??= {}) as Record<string, Bag>;
      (bucket[index] ??= {})[fieldName] = value;
      continue;
    }
    if (key in body) {
      const prev = body[key];
      body[key] = Array.isArray(prev) ? [...prev, value] : [prev, value];
    } else body[key] = value;
  }
  return body;
}

async function familyChoices() {
  return q<{ id: string; canonical_name: string; allows_flavoring: boolean }>(
    "SELECT id, canonical_name, allows_flavoring FROM families ORDER BY sort_order, canonical_name",
  );
}
async function specChoices() {
  return q<{ id: string; canonical_name: string }>("SELECT id, canonical_name FROM specs ORDER BY canonical_name");
}
async function glasses() {
  return q<{ id: number; name: string }>("SELECT id, name FROM glassware ORDER BY name");
}

function familyForm(family: Bag | null, aliases: string, error: string | null) {
  const value = family ?? { slug: "", canonical_name: "", kind: "spirit" };
  const creating = !family?.id;
  return page({
    title: creating ? "New family" : String(value.canonical_name),
    active: `${DB}/families`,
    error,
    body: `${heading(creating ? "New family" : "Edit family")}
      <form class="card" method="post" action="${creating ? `${DB}/families` : `${DB}/families/${family?.id}`}">
        <div class="grid">
          ${field("Name", text("canonical_name", value.canonical_name, 'id="family-name" required'), "The browse name, such as whiskey or gin. Stored in lowercase.")}
          ${field("Slug", text("slug", value.slug, 'id="family-slug" data-slug-from="family-name" required pattern="[a-z0-9]+(-[a-z0-9]+)*"'), "A short id for this family. It fills in from the name until you change it.")}
          ${field("Kind", select("kind", options(KINDS), value.kind), "What this group is. Wine kinds can show on the wine list.")}
          <div class="span-2">${field("Aliases", area("aliases", aliases, 'rows="4"'), "Other names for this same family, one per line. Put whisky here instead of making a second family.")}</div>
        </div>
        <div class="form-actions">
          <button type="submit">${creating ? "Create family" : "Save family"}</button>
          <a class="button quiet" href="${DB}/families">Cancel</a>
        </div>
      </form>
      ${creating ? "" : deleteForm(`${DB}/families/${family?.id}/delete`, "Delete family")}`,
  });
}

function familyInput(body: Bag) {
  const name = lowerName(body.canonical_name);
  if (!name) throw new ValidationError("Name is required.");
  const slug = blank(body.slug) ?? slugify(name);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new ValidationError("Slug uses lowercase letters, numbers, and hyphens.");
  if (!KINDS.some(([k]) => k === body.kind)) throw new ValidationError("Choose a kind.");
  return { name, slug, kind: String(body.kind), aliases: aliasesFromText(body.aliases) };
}

async function saveFamily(id: string | null, input: ReturnType<typeof familyInput>) {
  const familyId = id ?? randomUUID();
  const after = { ...input, id: familyId };
  const stmts: [string, unknown[]][] = [];
  if (id) {
    stmts.push(log("family", id, "update", `Edited family ${input.name}`, { id }, after));
    stmts.push(["UPDATE families SET canonical_name = $2, slug = $3, kind = $4 WHERE id = $1", [id, input.name, input.slug, input.kind]]);
    stmts.push(["DELETE FROM family_aliases WHERE family_id = $1", [id]]);
  } else {
    stmts.push([
      `INSERT INTO families (id, canonical_name, slug, kind, sort_order)
       VALUES ($1, $2, $3, $4, COALESCE((SELECT MAX(sort_order) FROM families), 0) + 10)`,
      [familyId, input.name, input.slug, input.kind],
    ]);
    stmts.push(log("family", familyId, "create", `Added family ${input.name}`, null, after));
  }
  for (const alias of input.aliases) stmts.push(["INSERT INTO family_aliases (family_id, alias) VALUES ($1, $2)", [familyId, alias]]);
  await tx(stmts);
}

const SPEC_FLAGS: [string, string, string][] = [
  ["fortified", "F", "Fortified"],
  ["as_ingredient", "I", "Ingredient"],
  ["as_neat", "P", "Pours"],
  ["as_wine_glass", "W", "Wine glass"],
  ["always_available", "A", "Always"],
  ["ingredient_only", "H", "Hidden from Pours and Cellar"],
];

function specForm(spec: Bag | null, aliases: string, primaryFamilyId: string, extraFamilyIds: string[], families: { id: string; canonical_name: string; allows_flavoring: boolean }[], error: string | null) {
  const value = spec ?? {
    slug: "", canonical_name: "", description: "", flavoring: "",
    wine_color: "not_applicable", wine_effervescence: "not_applicable",
    fortified: false, as_ingredient: true, as_neat: false, as_wine_glass: false, always_available: false, ingredient_only: false,
  };
  const creating = !spec?.id;
  const extras = new Set(extraFamilyIds);
  const familyOptions = families.map((family) => check("family_ids", extras.has(family.id), family.canonical_name, `value="${family.id}"`)).join("");
  return page({
    title: creating ? "New spec" : String(value.canonical_name),
    active: `${DB}/specs`,
    error,
    body: `${heading(creating ? "New spec" : "Edit spec")}
      <form class="card" method="post" action="${creating ? `${DB}/specs` : `${DB}/specs/${spec?.id}`}">
        <div class="stack">
          <div class="grid grid-3 spec-fields">
            ${field("Name", text("canonical_name", value.canonical_name, 'id="spec-name" required'), "The generic thing a recipe asks for, such as bourbon. Stored in lowercase. Not a brand or a bottle.")}
            ${field("Slug", text("slug", value.slug, 'id="spec-slug" data-slug-from="spec-name" required pattern="[a-z0-9]+(-[a-z0-9]+)*"'), "A short id for this spec. It fills in from the name until you change it.")}
            ${field("Primary family", select("primary_family_id", options(families.map((family) => [family.id, family.canonical_name, `data-allows-flavoring="${family.allows_flavoring ? "true" : "false"}"`]), "Choose a family"), primaryFamilyId, 'required id="primary-family"'), "The main family this spec belongs to.")}
            ${field("Flavoring", `<span class="flavor-wrap">${text("flavoring", value.flavoring, 'id="spec-flavoring"')}</span>`, "A flavor that makes this spec its own thing, such as vanilla. Only a base spirit can use this.")}
            ${field("Wine color", select("wine_color", options(WINE_COLORS), value.wine_color), "Red, white, or rosé if this spec is wine. Otherwise leave it as not applicable.")}
            ${field("Effervescence", select("wine_effervescence", options(EFFERVESCENCE), value.wine_effervescence), "Still or sparkling if this spec is wine. Otherwise leave it as not applicable.")}
          </div>
          ${field("Description", area("description", value.description), "A short note about what this spec means.")}
          <div class="check-split spec-extra">
            <div class="checks checks-stack">
              ${check("fortified", value.fortified, "Fortified", "", "A fortified or aromatized wine, such as vermouth, sherry, or port.")}
              ${check("as_ingredient", value.as_ingredient, "Ingredient", "", "Recipes can call for this spec.")}
              ${check("as_neat", value.as_neat, "Pours", "", "A bottle of this spec can show on Pours, even when that bottle is not itself marked neat or on the rocks. Drinks only still hides it.")}
              ${check("as_wine_glass", value.as_wine_glass, "Wine glass", "", "This is normally served in a wine glass.")}
              ${check("always_available", value.always_available, "Always available", "", "Treat this as on hand with no bottle. Use it for ice and water.")}
              ${check("ingredient_only", value.ingredient_only, "Drinks only", "", "Hide bottles of this spec from Pours and from Cellar. Recipes can still use it.")}
            </div>
            ${field("Secondary families", `<div class="picker" data-also-in>${familyOptions}</div>`, "Other families this spec also belongs to. Belonging to a family does not let one spec stand in for another.")}
            ${field("Aliases", area("aliases", aliases, 'rows="8"'), "Other names for this same spec, one per line.")}
          </div>
        </div>
        <div class="form-actions">
          <button type="submit">${creating ? "Create spec" : "Save spec"}</button>
          <a class="button quiet" href="${DB}/specs">Cancel</a>
        </div>
      </form>`,
  });
}

function specInput(body: Bag) {
  const name = lowerName(body.canonical_name);
  if (!name) throw new ValidationError("Name is required.");
  const slug = blank(body.slug) ?? slugify(name);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new ValidationError("Slug uses lowercase letters, numbers, and hyphens.");
  const primary = blank(body.primary_family_id);
  if (!isUuid(primary)) throw new ValidationError("Choose a primary family.");
  return {
    name, slug, description: blank(body.description), flavoring: blank(body.flavoring),
    wineColor: String(body.wine_color || "not_applicable"), effervescence: String(body.wine_effervescence || "not_applicable"),
    fortified: checked(body.fortified), asIngredient: checked(body.as_ingredient), asNeat: checked(body.as_neat),
    asWineGlass: checked(body.as_wine_glass), alwaysAvailable: checked(body.always_available), ingredientOnly: checked(body.ingredient_only),
    primary, extras: many(body.family_ids).filter((id) => id !== primary && isUuid(id)), aliases: aliasesFromText(body.aliases),
  };
}

async function saveSpec(id: string | null, input: ReturnType<typeof specInput>) {
  const [family] = await q<{ allows_flavoring: boolean }>("SELECT allows_flavoring FROM families WHERE id = $1", [input.primary]);
  if (!family) throw new ValidationError("Choose a primary family.");
  if (!family.allows_flavoring) input.flavoring = null;
  const specId = id ?? randomUUID();
  const cols = [input.name, input.slug, input.description, input.flavoring, input.wineColor, input.effervescence, input.fortified, input.asIngredient, input.asNeat, input.asWineGlass, input.alwaysAvailable, input.ingredientOnly];
  const stmts: [string, unknown[]][] = [];
  if (id) {
    stmts.push(log("spec", id, "update", `Edited ingredient ${input.name}`, { id }, { ...input, id }));
    stmts.push([
      `UPDATE specs SET canonical_name = $2, slug = $3, description = $4, flavoring = $5, wine_color = $6, wine_effervescence = $7,
         fortified = $8, as_ingredient = $9, as_neat = $10, as_wine_glass = $11, always_available = $12, ingredient_only = $13 WHERE id = $1`,
      [id, ...cols],
    ]);
    stmts.push(["DELETE FROM spec_families WHERE spec_id = $1", [id]]);
    stmts.push(["DELETE FROM spec_aliases WHERE spec_id = $1", [id]]);
  } else {
    stmts.push([
      `INSERT INTO specs (id, canonical_name, slug, description, flavoring, wine_color, wine_effervescence,
         fortified, as_ingredient, as_neat, as_wine_glass, always_available, ingredient_only)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [specId, ...cols],
    ]);
    stmts.push(log("spec", specId, "create", `Added ingredient ${input.name}`, null, { ...input, id: specId }));
  }
  stmts.push(["INSERT INTO spec_families (spec_id, family_id, is_primary) VALUES ($1, $2, true)", [specId, input.primary]]);
  for (const familyId of input.extras) stmts.push(["INSERT INTO spec_families (spec_id, family_id, is_primary) VALUES ($1, $2, false)", [specId, familyId]]);
  for (const alias of input.aliases) stmts.push(["INSERT INTO spec_aliases (spec_id, alias) VALUES ($1, $2)", [specId, alias]]);
  await tx(stmts);
}

function productForm(product: Bag | null, selectedSpecs: string[], primarySpecId: string, families: { id: string; canonical_name: string }[], specs: { id: string; canonical_name: string }[], error: string | null) {
  const value = product ?? {
    upc: "", packaged_name: "", display_name: "", short_name: "", spec_label: "", brand: "", description: "", rating: "",
    origin: "", pairing_notes: "", serve_note: "", family_id: "", wine_color: "not_applicable", wine_effervescence: "not_applicable", grape: "",
    fortified: false, net_contents_amount: "", net_contents_unit: "", abv: "", in_stock: false, serves_neat: false, serves_rocks: false,
    serves_chilled: false, mix_only: false, serves_glass: false, serves_bottle: false, decanting: false,
  };
  const creating = !product?.id;
  const chosen = new Set(selectedSpecs);
  const picker = specs.map((spec) => `<label class="check">
      <input type="checkbox" name="spec_ids" value="${spec.id}"${chosen.has(spec.id) ? " checked" : ""}>
      <input type="radio" name="primary_spec_id" value="${spec.id}"${primarySpecId === spec.id ? " checked" : ""}>
      ${esc(spec.canonical_name)}
    </label>`).join("");
  return page({
    title: creating ? "New product" : String(value.display_name),
    active: `${DB}/products`,
    error,
    body: `${heading(creating ? "New product" : "Edit product", "The display name is what menus show. The short name is what Pours shows, with the primary spec beside it.")}
      <form class="card" method="post" action="${creating ? `${DB}/products` : `${DB}/products/${product?.id}`}">
        <div class="stack">
          <div class="grid grid-3">
            ${field("Display name", text("display_name", value.display_name, "required"), "The cleaned full name. Leave the size out of this name.")}
            ${field("Short name", text("short_name", value.short_name), "The name on Pours, without the type. Leave empty to use the full name.")}
            ${field("Packaged name", text("packaged_name", value.packaged_name, "required"), "The name on the label or from a scan. It can stay wordy.")}
            ${field("Brand", text("brand", value.brand), "The brand on the bottle. A brand is not a spec.")}
            ${field("UPC", `${text("upc", value.upc)}${value.upc && formatUpc(String(value.upc)) !== value.upc ? `<div class="hint">Printed: ${esc(formatUpc(String(value.upc)))}</div>` : ""}`, "The barcode, digits only. Leave empty for homemade items and produce.")}
            ${field("Family", select("family_id", options(families.map((family) => [family.id, family.canonical_name]), "No family yet"), value.family_id), "The browse group.")}
            ${field("Rating", select("rating", options(RATINGS), value.rating ?? ""), "Your score for this bottle, from 1 to 5. This is not the guest star rating.")}
            ${field("Origin", text("origin", value.origin), "Where it is from: a country, region, or appellation.")}
            ${field("Best served", text("serve_note", value.serve_note), "A short serving note, such as neat, rocks, or chilled.")}
            ${field("ABV", text("abv", value.abv, 'inputmode="decimal"'), "Alcohol percent. Leave empty if you do not know it.")}
            ${field("Net contents", `<span class="actions">${text("net_contents_amount", value.net_contents_amount, 'inputmode="decimal"')} ${select("net_contents_unit", options(UNITS), value.net_contents_unit ?? "")}</span>`, "How much is in the package, such as 750 ml.")}
            ${field("Wine color", select("wine_color", options(WINE_COLORS), value.wine_color), "This bottle's color.")}
            ${field("Grape", text("grape", value.grape), "Wines only: the grape, such as Cabernet Sauvignon. The Cellar shows it as the category. Leave empty for none. Not a spec.")}
            ${field("Effervescence", select("wine_effervescence", options(EFFERVESCENCE), value.wine_effervescence), "Still or sparkling.")}
          </div>
          <div class="grid">
            ${field("Description", area("description", value.description), "Your notes about this bottle.")}
            ${field("Pairing notes", area("pairing_notes", value.pairing_notes), "What to serve it with. Mostly used for wine.")}
          </div>
          <div class="check-split product-extra">
            <div class="checks checks-stack">
              ${check("in_stock", value.in_stock, "In stock", "", "On the shelf right now.")}
              ${check("decanting", value.decanting, "Decanting", "", "This product is in a decanter, not its labelled bottle.")}
              ${check("fortified", value.fortified, "Fortified", "", "Fortified or aromatized, such as vermouth, sherry, or port.")}
              ${check("serves_neat", value.serves_neat, "Neat", "", "Offer this bottle neat.")}
              ${check("serves_rocks", value.serves_rocks, "Rocks", "", "Offer this bottle on the rocks.")}
              ${check("serves_chilled", value.serves_chilled, "Chilled", "", "Serve this bottle chilled.")}
              ${check("mix_only", value.mix_only, "Mix only", "", "Hide this bottle from Pours. It can still be used in a mixed drink.")}
              ${check("serves_glass", value.serves_glass, "Glass", "", "Serve it in a wine glass.")}
              ${check("serves_bottle", value.serves_bottle, "Bottle", "", "It can be served by the bottle.")}
            </div>
            ${field("Satisfies", `<div class="picker">${picker}</div>`, "Specs this bottle can fill. Check each one. The round button marks the main spec.")}
          </div>
        </div>
        <div class="form-actions">
          <button type="submit">${creating ? "Create product" : "Save product"}</button>
          <a class="button quiet" href="${DB}/products">Cancel</a>
        </div>
      </form>
      ${creating ? "" : lookupCard(product!)}`,
  });
}

function lookupCard(product: Bag) {
  const lookup = (product.lookup ?? null) as Bag | null;
  const raw = !lookup?.raw ? "{\n}" : typeof lookup.raw === "string" ? lookup.raw : JSON.stringify(lookup.raw, null, 2);
  return `<h2>Last lookup</h2>
    <p class="lede">Saving a lookup does not change the display name, short name, rating, notes, or spec links.</p>
    <form class="card" method="post" action="${DB}/products/${product.id}/lookup">
      <div class="grid">
        ${field("Source", text("source", lookup?.source ?? ""), "Where this lookup came from.")}
        ${field("Title", text("title", lookup?.title ?? ""), "The product title the lookup returned.")}
        ${field("Brand", text("brand", lookup?.brand ?? ""), "The brand the lookup returned.")}
        ${field("Size text", text("size_text", lookup?.size_text ?? ""), "The size as the lookup printed it.")}
        ${field("Image URL", text("image_url", lookup?.image_url ?? ""), "A picture address from the lookup.")}
        ${field("Origin", text("origin", lookup?.origin ?? ""), "Origin text from the lookup.")}
        ${field("ABV", text("abv", lookup?.abv ?? "", 'inputmode="decimal"'), "Alcohol percent from the lookup.")}
        ${field("Net contents", `<span class="actions">${text("net_contents_amount", lookup?.net_contents_amount ?? "", 'inputmode="decimal"')} ${select("net_contents_unit", options(UNITS), lookup?.net_contents_unit ?? "")}</span>`, "The size from the lookup.")}
        <div class="span-2">${field("Description", area("description", lookup?.description ?? ""), "Description text from the lookup.")}</div>
        <div class="span-2">${field("Raw payload", area("raw", raw, 'rows="8" spellcheck="false"'), "The lookup's original data, as JSON.")}</div>
      </div>
      <div class="form-actions"><button type="submit">${lookup ? "Replace lookup" : "Save lookup"}</button></div>
    </form>
    ${lookup ? `<div class="form-actions">${deleteForm(`${DB}/products/${product.id}/lookup/delete`, "Remove lookup")}</div>` : ""}`;
}

function productInput(body: Bag) {
  const displayName = blank(body.display_name);
  const packagedName = blank(body.packaged_name);
  if (!displayName || !packagedName) throw new ValidationError("Display name and packaged name are required.");
  const amount = numberOrNull(body.net_contents_amount, "Net contents");
  const unit = blank(body.net_contents_unit);
  if ((amount == null) !== (unit == null)) throw new ValidationError("Net contents need both an amount and a unit.");
  const upc = blank(body.upc)?.replace(/\D/g, "") ?? null;
  if (upc && !/^[0-9]{8,14}$/.test(upc)) throw new ValidationError("UPC must be 8 to 14 digits.");
  const abv = numberOrNull(body.abv, "ABV");
  if (abv != null && (abv < 0 || abv > 100)) throw new ValidationError("ABV must be between 0 and 100.");
  const rating = numberOrNull(body.rating, "Rating");
  if (rating != null && (rating < 1 || rating > 5)) throw new ValidationError("Rating must be from 1 to 5.");
  const familyId = blank(body.family_id);
  if (familyId && !isUuid(familyId)) throw new ValidationError("Family is not valid.");
  const specIds = many(body.spec_ids).filter((id) => isUuid(id));
  let primary = blank(body.primary_spec_id);
  if (specIds.length === 1 && !primary) primary = specIds[0];
  if (specIds.length && primary && !specIds.includes(primary)) throw new ValidationError("The primary spec has to be one of the checked specs.");
  if (specIds.length && !primary) throw new ValidationError("Choose a primary spec.");
  const servesNeat = checked(body.serves_neat);
  const servesRocks = checked(body.serves_rocks);
  const mixOnly = checked(body.mix_only);
  if (mixOnly && (servesNeat || servesRocks)) throw new ValidationError("Mix only means this bottle is not served neat or on the rocks.");
  const wineColor = String(body.wine_color || "not_applicable");
  const eff = String(body.wine_effervescence || "not_applicable");
  if (!WINE_COLORS.some(([v]) => v === wineColor)) throw new ValidationError("Wine color is not valid.");
  if (!EFFERVESCENCE.some(([v]) => v === eff)) throw new ValidationError("Effervescence is not valid.");
  return {
    displayName, packagedName, shortName: blank(body.short_name), specLabel: null, upc, familyId,
    brand: blank(body.brand), description: blank(body.description), rating, origin: normalizeOrigin(blank(body.origin)),
    pairing: blank(body.pairing_notes), serve: blank(body.serve_note), abv, amount, unit, wineColor, eff, grape: blank(body.grape),
    fortified: checked(body.fortified), inStock: checked(body.in_stock), servesNeat, servesRocks,
    servesChilled: checked(body.serves_chilled), mixOnly, servesGlass: checked(body.serves_glass),
    servesBottle: checked(body.serves_bottle), decanting: checked(body.decanting), specIds, primary,
  };
}

async function saveProduct(id: string | null, input: ReturnType<typeof productInput>) {
  const productId = id ?? randomUUID();
  const params = [
    productId, input.upc, input.packagedName, input.displayName, input.shortName, input.specLabel, input.brand, input.description, input.rating,
    input.origin, input.pairing, input.serve, input.servesNeat, input.servesRocks, input.servesChilled, input.mixOnly,
    input.servesGlass, input.servesBottle, input.familyId, input.wineColor, input.eff, input.fortified, input.amount, input.unit, input.abv, input.inStock, input.decanting,
    input.grape,
  ];
  const set = `upc = $2, packaged_name = $3, display_name = $4, short_name = $5, spec_label = $6, brand = $7, description = $8, rating = $9,
    origin = $10, pairing_notes = $11, serve_note = $12, serves_neat = $13, serves_rocks = $14, serves_chilled = $15, mix_only = $16,
    serves_glass = $17, serves_bottle = $18, family_id = $19, wine_color = $20, wine_effervescence = $21, fortified = $22,
    net_contents_amount = $23, net_contents_unit = $24, abv = $25, in_stock = $26, decanting = $27, grape = $28`;
  const stmts: [string, unknown[]][] = [];
  if (id) {
    stmts.push(log("product", id, "update", `Edited ${input.displayName}`, { id }, { ...input, id }));
    stmts.push([`UPDATE products SET ${set} WHERE id = $1`, params]);
    stmts.push(["DELETE FROM product_specs WHERE product_id = $1", [id]]);
  } else {
    stmts.push([
      `INSERT INTO products (id, upc, packaged_name, display_name, short_name, spec_label, brand, description, rating, origin, pairing_notes, serve_note,
         serves_neat, serves_rocks, serves_chilled, mix_only, serves_glass, serves_bottle, family_id, wine_color, wine_effervescence, fortified,
         net_contents_amount, net_contents_unit, abv, in_stock, decanting, grape)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)`,
      params,
    ]);
    stmts.push(log("product", productId, "create", `Added ${input.displayName}`, null, { ...input, id: productId }));
  }
  for (const specId of input.specIds) {
    stmts.push(["INSERT INTO product_specs (product_id, spec_id, is_primary) VALUES ($1, $2, $3)", [productId, specId, specId === input.primary]]);
  }
  await tx(stmts);
  return productId;
}

function recipeLines(lines: Bag[]) {
  const source = lines.length ? lines : [{ position: 1, spec_id: "", required: true, amount: "", unit: "", role: "", note: "" }];
  const unitOptions = options([["", "Unit"], ...RECIPE_UNITS.map((u) => [u, u] as [string, string])]);
  return source.map((line, index) => `<tr data-line>
    <td><input name="lines[${index}][position]" value="${esc(line.position ?? index + 1)}" inputmode="numeric"></td>
    <td><select name="lines[${index}][spec_id]"><option value="">Spec</option>${line.options ?? ""}</select></td>
    <td><label class="check"><input type="checkbox" name="lines[${index}][required]" value="on"${line.required ? " checked" : ""}> <span>Required</span></label></td>
    <td><input name="lines[${index}][amount]" value="${esc(line.amount ?? "")}" inputmode="decimal"></td>
    <td><select name="lines[${index}][unit]">${unitOptions.map((o) => `<option value="${esc(o.value)}"${String(line.unit ?? "") === o.value ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select></td>
    <td><select name="lines[${index}][role]">${ROLES.map(([value, label]) => `<option value="${esc(value)}"${line.role === value ? " selected" : ""}>${esc(label)}</option>`).join("")}</select></td>
    <td><input name="lines[${index}][note]" value="${esc(line.note ?? "")}"></td>
    <td><button class="quiet" type="button" data-remove-line>Remove</button></td>
  </tr>`).join("");
}

function recipeForm(recipe: Bag | null, lines: Bag[], specs: { id: string; canonical_name: string }[], glassRows: { id: number; name: string }[], error: string | null) {
  const value = recipe ?? { name: "", description: "", rating: "", section: "mixed", glass_id: "", service_style: "", alt_glass_id: "", alt_service_style: "", glass_note: "", method_style: "" };
  const creating = !recipe?.id;
  const rendered = (lines.length ? lines : [{ position: 1, required: true }]).map((line) => ({
    ...line,
    options: specs.map((spec) => `<option value="${spec.id}"${spec.id === line.spec_id ? " selected" : ""}>${esc(spec.canonical_name)}</option>`).join(""),
  }));
  const glassOptions = options([["", "No glass"], ...glassRows.map((g) => [String(g.id), g.name] as [string, string])]);
  const styleOptions = options(SERVICE.map((v) => [v, v || "Not set"]));
  const methodOptions = options(METHOD.map((v) => [v, v || "Not set"]));
  return page({
    title: creating ? "New recipe" : String(value.name),
    active: `${DB}/recipes`,
    error,
    body: `${heading(creating ? "New recipe" : "Edit recipe", "Lines name specs. Top and rinse need no amount. The rating here is yours, not the guest stars.")}
      <form class="card" method="post" action="${creating ? `${DB}/recipes` : `${DB}/recipes/${recipe?.id}`}">
        <div class="grid">
          ${field("Name", text("name", value.name, "required"), "The drink's name.")}
          ${field("Section", select("section", options(SECTIONS), value.section), "Mixed drinks use Mixed. The neat and wine menus list bottles, not recipes.")}
          ${field("Rating", select("rating", options(RATINGS), value.rating ?? ""), "Your score for the drink, from 1 to 5.")}
          ${field("Method", select("method_style", methodOptions, value.method_style ?? ""), "How it is made. Shown as the Method label.")}
          ${field("Glass", select("glass_id", glassOptions, value.glass_id ?? ""), "The recommended glass. Display only.")}
          ${field("Service", select("service_style", styleOptions, value.service_style ?? ""), "Up, on the rocks, neat, or hot.")}
          ${field("Other glass", select("alt_glass_id", glassOptions, value.alt_glass_id ?? ""), "An alternate glass, if there is one.")}
          ${field("Other service", select("alt_service_style", styleOptions, value.alt_service_style ?? ""), "How it is served in the other glass.")}
          <div class="span-2">${field("Glass note", text("glass_note", value.glass_note), "A short serving note, such as one large cube.")}</div>
          <div class="span-2">${field("Description", area("description", value.description), "What the drink is, including the method text guests read.")}</div>
        </div>
        <h2>Lines</h2>
        <div class="lines"><table>
          <thead><tr><th>Order</th><th>Spec</th><th></th><th>Amount</th><th>Unit</th><th>Role</th><th>Note</th><th></th></tr></thead>
          <tbody data-lines>${recipeLines(rendered)}</tbody>
        </table></div>
        <div class="form-actions">
          <button type="button" class="quiet" data-add-line>Add line</button>
          <button type="submit">${creating ? "Create recipe" : "Save recipe"}</button>
          <a class="button quiet" href="${DB}/recipes">Cancel</a>
        </div>
      </form>
      ${creating ? "" : deleteForm(`${DB}/recipes/${recipe?.id}/delete`, "Delete recipe")}`,
  });
}

function recipeInput(body: Bag) {
  const name = blank(body.name);
  if (!name) throw new ValidationError("Name is required.");
  const raw = body.lines && typeof body.lines === "object" ? Object.values(body.lines as Record<string, Bag>) : [];
  const lines = [];
  for (const line of raw) {
    if (!line || !blank(line.spec_id)) continue;
    if (!isUuid(line.spec_id)) throw new ValidationError("A recipe line has an unknown spec.");
    let amount = numberOrNull(line.amount, "Amount");
    const unit = blank(line.unit);
    if (unit && NO_AMOUNT.has(unit)) amount = null;
    else if ((amount == null) !== (unit == null)) throw new ValidationError("A line with an amount needs a unit, and a unit needs an amount.");
    if (amount != null && amount <= 0) throw new ValidationError("Line amounts must be greater than zero.");
    if (unit && !RECIPE_UNITS.includes(unit)) throw new ValidationError(`Unknown unit "${unit}".`);
    const role = blank(line.role);
    if (role && !ROLES.some(([v]) => v === role)) throw new ValidationError("Unknown role.");
    lines.push({
      spec_id: String(line.spec_id),
      position: numberOrNull(line.position, "Order") ?? lines.length + 1,
      required: checked(line.required), amount, unit, role, note: blank(line.note),
    });
  }
  if (lines.length === 0) throw new ValidationError("Add at least one ingredient.");
  lines.sort((a, b) => a.position - b.position);
  lines.forEach((line, index) => { line.position = index + 1; });
  const style = (v: unknown, label: string) => {
    const s = blank(v);
    if (!s) return null;
    if (!SERVICE.includes(s)) throw new ValidationError(`Unknown ${label}.`);
    return s;
  };
  const glass = (v: unknown) => {
    const s = blank(v);
    if (!s) return null;
    const n = Number(s);
    if (!Number.isInteger(n) || n <= 0) throw new ValidationError("Unknown glass.");
    return n;
  };
  const method = blank(body.method_style);
  if (method && !METHOD.includes(method)) throw new ValidationError("Unknown method style.");
  const section = blank(body.section) ?? "mixed";
  if (!SECTIONS.some(([v]) => v === section)) throw new ValidationError("Unknown section.");
  const rating = numberOrNull(body.rating, "Rating");
  if (rating != null && (rating < 1 || rating > 5)) throw new ValidationError("Rating must be from 1 to 5.");
  return {
    name, description: blank(body.description), rating, section, method,
    glass_id: glass(body.glass_id), service_style: style(body.service_style, "service style"),
    alt_glass_id: glass(body.alt_glass_id), alt_service_style: style(body.alt_service_style, "service style"),
    glass_note: blank(body.glass_note), lines,
  };
}

async function saveRecipe(id: string | null, input: ReturnType<typeof recipeInput>) {
  const recipeId = id ?? randomUUID();
  const vals = [recipeId, input.name, input.description, input.rating, input.section, input.glass_id, input.service_style, input.alt_glass_id, input.alt_service_style, input.glass_note, input.method];
  const stmts: [string, unknown[]][] = [];
  // Lines are replaced; their alternates (migration 034) are read first and written back onto the new lines.
  const before = id ? await readAlternates(id) : null;
  if (id) {
    stmts.push(log("recipe", id, "update", `Edited ${input.name}`, { id }, { ...input, id }));
    stmts.push([
      `UPDATE recipes SET name = $2, description = $3, rating = $4, section = $5, glass_id = $6, service_style = $7,
         alt_glass_id = $8, alt_service_style = $9, glass_note = $10, method_style = $11 WHERE id = $1`,
      vals,
    ]);
    stmts.push(["DELETE FROM recipe_lines WHERE recipe_id = $1", [id]]);
  } else {
    stmts.push([
      `INSERT INTO recipes (id, name, description, rating, section, glass_id, service_style, alt_glass_id, alt_service_style, glass_note, method_style)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      vals,
    ]);
    stmts.push(log("recipe", recipeId, "create", `Added ${input.name}`, null, { ...input, id: recipeId }));
  }
  stmts.push(...lineStatements(recipeId, input.lines, before));
  await tx(stmts);
}

export async function handleDb(req: Request, parts: string[]): Promise<Response> {
  const method = req.method;
  const path = "/" + parts.join("/");
  const url = new URL(req.url);
  try {
    // No home page: /db opens on Products. /db/menus (retired read-only lists) goes there too.
    if (method === "GET" && (path === "/" || path === "" || path === "/menus")) return Response.redirect(new URL(`${DB}/products`, req.url), 302);
    if (method === "GET" && path === "/families") return familiesPage();
    if (method === "GET" && path === "/families/new") return html(200, familyForm(null, "", null));
    if (method === "POST" && path === "/families") return postFamily(req, null);
    if (method === "POST" && path === "/families/order") return postFamilyOrder(req);
    if (parts[0] === "families" && parts[1] && isUuid(parts[1]) && parts.length === 2 && method === "GET") return familyEdit(parts[1]);
    if (parts[0] === "families" && parts[1] && isUuid(parts[1]) && parts.length === 2 && method === "POST") return postFamily(req, parts[1]);
    if (parts[0] === "families" && parts[2] === "delete" && method === "POST") return postFamilyDelete(req, parts[1]);

    if (method === "GET" && path === "/specs") return specsPage(null);
    if (method === "GET" && path === "/specs/new") return html(200, specForm(null, "", "", [], await familyChoices(), null));
    if (method === "POST" && path === "/specs") return postSpec(req, null);
    if (parts[0] === "specs" && parts[1] && isUuid(parts[1]) && parts.length === 2 && method === "GET") return specEdit(parts[1]);
    if (parts[0] === "specs" && parts[1] && isUuid(parts[1]) && parts.length === 2 && method === "POST") return postSpec(req, parts[1]);
    if (parts[0] === "specs" && parts[2] === "delete" && method === "POST") return postSpecDelete(req, parts[1]);

    if (method === "GET" && path === "/substitutions") return substitutionsPage(null, null);
    if (method === "POST" && path === "/substitutions") return postSubstitution(req);
    if (parts[0] === "substitutions" && parts.length === 4 && parts[3] === "delete" && method === "POST") return postSubstitutionDelete(req, parts[1], parts[2]);

    if (method === "GET" && path === "/products") return productsPage(blank(url.searchParams.get("saved")));
    if (method === "GET" && path === "/products/new") return html(200, productForm(null, [], "", await familyChoices(), await specChoices(), null));
    if (method === "POST" && path === "/products") return postProduct(req, null);
    if (parts[0] === "products" && parts[1] && isUuid(parts[1]) && parts.length === 2 && method === "GET") return productEdit(parts[1]);
    if (parts[0] === "products" && parts[1] && isUuid(parts[1]) && parts.length === 2 && method === "POST") return postProduct(req, parts[1]);
    if (parts[0] === "products" && parts[2] === "delete" && method === "POST") return postProductDelete(req, parts[1]);
    if (parts[0] === "products" && parts[2] === "lookup" && parts.length === 3 && method === "POST") return postLookup(req, parts[1]);
    if (parts[0] === "products" && parts[2] === "lookup" && parts[3] === "delete" && method === "POST") return postLookupDelete(req, parts[1]);

    if (method === "GET" && path === "/recipes") return recipesPage();
    if (method === "GET" && path === "/recipes/new") return html(200, recipeForm(null, [], await specChoices(), await glasses(), null));
    if (method === "POST" && path === "/recipes") return postRecipe(req, null);
    if (parts[0] === "recipes" && parts[1] && isUuid(parts[1]) && parts.length === 2 && method === "GET") return recipeEdit(parts[1]);
    if (parts[0] === "recipes" && parts[1] && isUuid(parts[1]) && parts.length === 2 && method === "POST") return postRecipe(req, parts[1]);
    if (parts[0] === "recipes" && parts[2] === "delete" && method === "POST") return postRecipeDelete(req, parts[1]);

    return notFound(`${DB}`, "That page was not found.");
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 404) return notFound(`${DB}`, "That record was not found.");
    if (!isUserError(error)) console.error("db admin", error);
    return html(500, page({ title: "Error", active: `${DB}`, error: isUserError(error) ? dbMessage(error) : "Something went wrong while saving.", body: "" }));
  }
}

async function familiesPage() {
  const rows = await q<{ id: string; slug: string; canonical_name: string; kind: string; aliases: string }>(
    `SELECT f.id, f.slug, f.canonical_name, f.kind,
            coalesce(string_agg(DISTINCT a.alias, ', ' ORDER BY a.alias), '') AS aliases
       FROM families f LEFT JOIN family_aliases a ON a.family_id = f.id
      GROUP BY f.id ORDER BY f.sort_order, f.canonical_name`,
  );
  const body = rows.map((family) => `<tr data-id="${family.id}" data-search="${esc([family.canonical_name, family.slug, family.kind, family.aliases].join(" "))}">
    <td class="handle" draggable="true" title="Drag to reorder" aria-label="Drag to reorder">↕</td>
    <td><a href="${DB}/families/${family.id}">${esc(family.canonical_name)}</a><div class="hint">${esc(family.slug)}</div></td>
    <td><span class="pill">${esc(family.kind)}</span></td>
    <td>${esc(family.aliases)}</td>
    <td class="row-actions"><a class="button quiet" href="${DB}/families/${family.id}">Edit</a></td>
  </tr>`).join("");
  return html(200, page({
    title: "Families",
    active: `${DB}/families`,
    body: `${heading("Families", "Drag a row to change where that family sits in the list. Clear the search before dragging.", `<a class="button" href="${DB}/families/new">New family</a>`)}
      ${searchForm("Find a family by its name, slug, or alias.", "families")}
      <table><thead><tr><th></th><th>Name</th><th>Kind</th><th>Aliases</th><th></th></tr></thead>
      <tbody data-family-sort>${body || `<tr><td colspan="5" class="empty">No families.</td></tr>`}</tbody></table>`,
  }));
}

async function postFamily(req: Request, id: string | null) {
  const body = await formOf(req);
  try {
    await saveFamily(id, familyInput(body));
    return go(req, `${DB}/families`);
  } catch (error) {
    if (!isUserError(error)) throw error;
    return html(400, familyForm(id ? { id, ...body, canonical_name: lowerName(body.canonical_name) ?? "" } : body, String(body.aliases ?? ""), dbMessage(error)));
  }
}

async function familyEdit(id: string) {
  requireUuid(id);
  const [family] = await q<Bag>("SELECT * FROM families WHERE id = $1", [id]);
  if (!family) return notFound(`${DB}/families`, "Family not found.");
  const aliases = await q<{ alias: string }>("SELECT alias FROM family_aliases WHERE family_id = $1 ORDER BY alias", [id]);
  return html(200, familyForm(family, aliases.map((row) => row.alias).join("\n"), null));
}

async function postFamilyOrder(req: Request) {
  const body = await formOf(req);
  const ids = many(body.ids);
  if (ids.some((id) => !isUuid(id)) || new Set(ids).size !== ids.length) return new Response("The family order is not valid.", { status: 400 });
  const existing = await q<{ id: string }>("SELECT id FROM families");
  const known = new Set(existing.map((row) => row.id));
  if (ids.length !== known.size || ids.some((id) => !known.has(id))) return new Response("Reorder the full family list, with no search applied.", { status: 400 });
  await tx(ids.map((id, index) => ["UPDATE families SET sort_order = $2 WHERE id = $1", [id, (index + 1) * 10]] as [string, unknown[]]));
  return new Response(null, { status: 204 });
}

async function postFamilyDelete(req: Request, id: string) {
  requireUuid(id);
  try {
    const [family] = await q<{ canonical_name: string }>("SELECT canonical_name FROM families WHERE id = $1", [id]);
    await tx([
      log("family", id, "delete", `Deleted family ${family?.canonical_name ?? id}`, { id }, null),
      ["DELETE FROM families WHERE id = $1", [id]],
    ]);
    return go(req, `${DB}/families`);
  } catch (error) {
    if (!isUserError(error)) throw error;
    const [family] = await q<Bag>("SELECT * FROM families WHERE id = $1", [id]);
    const aliases = await q<{ alias: string }>("SELECT alias FROM family_aliases WHERE family_id = $1 ORDER BY alias", [id]);
    return html(400, familyForm(family ?? { id }, aliases.map((row) => row.alias).join("\n"), dbMessage(error)));
  }
}

async function specsPage(error: string | null) {
  const rows = await q<Bag>(
    `SELECT s.id, s.slug, s.canonical_name, s.flavoring, s.fortified, s.as_ingredient, s.as_neat, s.as_wine_glass, s.always_available, s.ingredient_only,
            f.canonical_name AS family_name,
            coalesce(string_agg(DISTINCT a.alias, ', ' ORDER BY a.alias), '') AS aliases
       FROM specs s
       LEFT JOIN spec_families sf ON sf.spec_id = s.id AND sf.is_primary
       LEFT JOIN families f ON f.id = sf.family_id
       LEFT JOIN spec_aliases a ON a.spec_id = s.id
      GROUP BY s.id, f.canonical_name
      ORDER BY s.canonical_name`,
  );
  const body = rows.map((spec) => `<tr data-search="${esc([spec.canonical_name, spec.slug, spec.family_name, spec.flavoring, spec.aliases].filter(Boolean).join(" "))}">
    <td><a href="${DB}/specs/${spec.id}">${esc(spec.canonical_name)}</a><div class="hint">${esc(spec.slug)}</div></td>
    ${SPEC_FLAGS.map(([key, letter, label]) => `<td class="flag"${spec[key] ? ` data-tip="${esc(label)}"` : ""}>${spec[key] ? letter : ""}</td>`).join("")}
    <td>${esc(spec.family_name ?? "")}</td>
    <td>${esc(spec.flavoring ?? "")}</td>
    <td>${esc(spec.aliases)}</td>
    <td class="row-actions">${deleteIcon(`${DB}/specs/${spec.id}/delete`, `Delete ${spec.canonical_name}`, "Delete this spec?")}</td>
  </tr>`).join("");
  const flagHeads = SPEC_FLAGS.map(([, letter, label]) => `<th class="flag" data-tip="${esc(label)}">${letter}</th>`).join("");
  return html(error ? 400 : 200, page({
    title: "Specs",
    active: `${DB}/specs`,
    error,
    body: `${heading("Specs", "Generic names a recipe can require. Bourbon does not satisfy whiskey unless you add a substitution.", `<a class="button" href="${DB}/specs/new">New spec</a>`)}
      ${searchForm("Find a spec by its name, slug, flavoring, or alias.", "specs")}
      <div class="table-scroll"><table><thead><tr><th>Name</th>${flagHeads}<th>Primary family</th><th>Flavoring</th><th>Aliases</th><th></th></tr></thead>
      <tbody>${body || `<tr><td colspan="11" class="empty">No specs.</td></tr>`}</tbody></table></div>`,
  }));
}

async function readSpec(id: string) {
  const [spec] = await q<Bag>("SELECT * FROM specs WHERE id = $1", [id]);
  if (!spec) return null;
  const links = await q<{ family_id: string; is_primary: boolean }>("SELECT family_id, is_primary FROM spec_families WHERE spec_id = $1", [id]);
  const aliases = await q<{ alias: string }>("SELECT alias FROM spec_aliases WHERE spec_id = $1 ORDER BY alias", [id]);
  return {
    spec,
    primary: links.find((row) => row.is_primary)?.family_id ?? "",
    extras: links.filter((row) => !row.is_primary).map((row) => row.family_id),
    aliases: aliases.map((row) => row.alias).join("\n"),
  };
}

async function specEdit(id: string) {
  const found = await readSpec(requireUuid(id));
  if (!found) return notFound(`${DB}/specs`, "Spec not found.");
  return html(200, specForm(found.spec, found.aliases, found.primary, found.extras, await familyChoices(), null));
}

async function postSpec(req: Request, id: string | null) {
  const body = await formOf(req);
  try {
    await saveSpec(id, specInput(body));
    return go(req, `${DB}/specs`);
  } catch (error) {
    if (!isUserError(error)) throw error;
    const draft = { ...(id ? { id } : {}), ...body, canonical_name: lowerName(body.canonical_name) ?? "", fortified: checked(body.fortified), as_ingredient: checked(body.as_ingredient), as_neat: checked(body.as_neat), as_wine_glass: checked(body.as_wine_glass), always_available: checked(body.always_available), ingredient_only: checked(body.ingredient_only) };
    return html(400, specForm(draft, String(body.aliases ?? ""), String(body.primary_family_id ?? ""), many(body.family_ids), await familyChoices(), dbMessage(error)));
  }
}

async function postSpecDelete(req: Request, id: string) {
  requireUuid(id);
  try {
    const [spec] = await q<{ canonical_name: string }>("SELECT canonical_name FROM specs WHERE id = $1", [id]);
    await tx([log("spec", id, "delete", `Deleted ingredient ${spec?.canonical_name ?? id}`, { id }, null), ["DELETE FROM specs WHERE id = $1", [id]]]);
    return go(req, `${DB}/specs`);
  } catch (error) {
    if (!isUserError(error)) throw error;
    return specsPage((error as { code?: string }).code === "23503" ? "That spec is still used, so it was not deleted." : dbMessage(error));
  }
}

async function substitutionsPage(error: string | null, body: Bag | null) {
  const specs = await specChoices();
  const rows = await q<{ source_spec_id: string; target_spec_id: string; note: string | null; source_name: string; target_name: string }>(`
    SELECT sub.source_spec_id, sub.target_spec_id, sub.note, src.canonical_name AS source_name, tgt.canonical_name AS target_name
      FROM spec_substitutions sub
      JOIN specs src ON src.id = sub.source_spec_id
      JOIN specs tgt ON tgt.id = sub.target_spec_id
     ORDER BY src.canonical_name, tgt.canonical_name`);
  // The two specs stand out (Brian via Vincent, 2026-10-04): <strong class="sub-item"> in the bright text color and
  // a heavier weight, from the structured fields (source, target; a ratio such as "(1:1)" is part of the spec name,
  // so it stays with its item); the connecting words and the note stay in the quieter color. The first letter is
  // capitalized by CSS only (display, not data).
  const item = (name: string) => `<strong class="sub-item">${esc(name).replace(/ \(/g, "&nbsp;(")}</strong>`; // "(1:1)" never wraps off its word
  const list = rows.map((row) => `<li><p class="sub-text">${item(row.source_name)} can be used in lieu of ${item(row.target_name)}.${row.note ? ` <span class="sub-note">${esc(row.note)}</span>` : ""}</p>
      ${deleteIcon(`${DB}/substitutions/${row.source_spec_id}/${row.target_spec_id}/delete`, `Remove ${row.source_name} for ${row.target_name}`, "Remove this substitution?")}</li>`).join("");
  const specOptions = options(specs.map((spec) => [spec.id, spec.canonical_name]), "Choose a spec");
  return html(error ? 400 : 200, page({
    title: "Substitutions",
    active: `${DB}/substitutions`,
    error,
    body: `${heading("Substitutions", "The source may stand in for the target. Add both directions only when you want both.")}
      <form class="card" method="post" action="${DB}/substitutions">
        <div class="grid">
          ${field("Source stands in", select("source_spec_id", specOptions, body?.source_spec_id ?? "", "required"), "The spec you have.")}
          ${field("For target", select("target_spec_id", specOptions, body?.target_spec_id ?? "", "required"), "The spec the recipe asks for.")}
          <div class="span-2">${field("Note", text("note", body?.note ?? ""), "Why this stand-in is allowed. Optional.")}</div>
        </div>
        <div class="form-actions"><button type="submit">Add substitution</button></div>
      </form>
      ${list ? `<ul class="sub-list">${list}</ul>` : `<p class="empty">No substitution rules yet.</p>`}`,
  }));
}

async function postSubstitution(req: Request) {
  const body = await formOf(req);
  try {
    await addSubstitution({ source_id: body.source_spec_id, target_id: body.target_spec_id, note: body.note, both_ways: false });
    return go(req, `${DB}/substitutions`);
  } catch (error) {
    if (!isUserError(error)) throw error;
    return substitutionsPage(dbMessage(error), body);
  }
}

async function postSubstitutionDelete(req: Request, source: string, target: string) {
  requireUuid(source);
  requireUuid(target);
  await deleteSubstitution({ source_id: source, target_id: target, both_ways: false });
  return go(req, `${DB}/substitutions`);
}

const PRODUCT_FLAGS: [string, string, string][] = [
  ["decanting", "D", "Decanting"],
  ["serves_neat", "N", "Neat"],
  ["serves_rocks", "R", "Rocks"],
  ["serves_chilled", "C", "Chilled"],
  ["mix_only", "M", "Mix only"],
  ["serves_glass", "G", "Glass"],
  ["serves_bottle", "B", "Bottle"],
  ["fortified", "F", "Fortified"],
];

async function productsPage(saved: string | null) {
  const rows = await q<Bag>(
    `SELECT p.id, p.display_name, p.packaged_name, p.brand, p.origin, p.in_stock, p.upc,
            p.serves_neat, p.serves_rocks, p.serves_chilled, p.mix_only, p.serves_glass, p.serves_bottle, p.fortified, p.decanting,
            f.canonical_name AS family_name,
            coalesce(string_agg(s.canonical_name, ', ' ORDER BY ps.is_primary DESC, s.canonical_name), '') AS spec_names
       FROM products p
       LEFT JOIN families f ON f.id = p.family_id
       LEFT JOIN product_specs ps ON ps.product_id = p.id
       LEFT JOIN specs s ON s.id = ps.spec_id
      GROUP BY p.id, f.canonical_name
      ORDER BY p.display_name`,
  );
  const body = rows.map((product) => `<tr data-search="${esc([product.display_name, product.packaged_name, product.brand, product.origin, upcSearchText(product.upc as string | null), product.family_name, product.spec_names].filter(Boolean).join(" "))}">
    <td><a href="${DB}/products/${product.id}">${esc(product.display_name)}</a><div class="hint">${esc(product.upc ? formatUpc(String(product.upc)) : "No UPC")}</div></td>
    ${PRODUCT_FLAGS.map(([key, letter, label]) => `<td class="flag"${product[key] ? ` data-tip="${esc(label)}"` : ""}>${product[key] ? letter : ""}</td>`).join("")}
    <td>${esc(product.family_name ?? "")}</td>
    <td>${esc(product.spec_names)}</td>
    <td class="row-actions">${deleteIcon(`${DB}/products/${product.id}/delete`, `Delete ${product.display_name}`, "Delete this product?")}</td>
  </tr>`).join("");
  const flagHeads = PRODUCT_FLAGS.map(([, letter, label]) => `<th class="flag" data-tip="${esc(label)}">${letter}</th>`).join("");
  return html(200, page({
    title: "Products",
    active: `${DB}/products`,
    notice: saved ? `Saved ${saved}.` : "",
    body: `${heading("Products", `Each bottle, batch, or piece of produce is one row. Mark bottles in or out on <a href="/admin/stock">Admin stock</a>.`, `<a class="button" href="${DB}/products/new">New product</a>`)}
      ${searchForm("Find a product by name, brand, origin, UPC, or a flag such as Neat.", "products")}
      <div class="table-scroll"><table><thead><tr><th>Name</th>${flagHeads}<th>Family</th><th>Specs</th><th></th></tr></thead>
      <tbody>${body || `<tr><td colspan="12" class="empty">No products yet.</td></tr>`}</tbody></table></div>`,
  }));
}

async function readProduct(id: string) {
  const [product] = await q<Bag>("SELECT * FROM products WHERE id = $1", [id]);
  if (!product) return null;
  const links = await q<{ spec_id: string; is_primary: boolean }>("SELECT spec_id, is_primary FROM product_specs WHERE product_id = $1", [id]);
  const [lookup] = await q<Bag>("SELECT * FROM product_lookups WHERE product_id = $1", [id]);
  return { product: { ...product, lookup: lookup ?? null }, specs: links.map((row) => row.spec_id), primary: links.find((row) => row.is_primary)?.spec_id ?? "" };
}

async function productEdit(id: string) {
  const found = await readProduct(requireUuid(id));
  if (!found) return notFound(`${DB}/products`, "Product not found.");
  return html(200, productForm(found.product, found.specs, found.primary, await familyChoices(), await specChoices(), null));
}

async function postProduct(req: Request, id: string | null) {
  const body = await formOf(req);
  try {
    const input = productInput(body);
    await saveProduct(id, input);
    return go(req, `${DB}/products?saved=${encodeURIComponent(input.displayName)}`);
  } catch (error) {
    if (!isUserError(error)) throw error;
    const existing = id ? await readProduct(id) : null;
    const draft = { ...(id ? { id } : {}), ...body, lookup: existing?.product.lookup ?? null, fortified: checked(body.fortified), in_stock: checked(body.in_stock), serves_neat: checked(body.serves_neat), serves_rocks: checked(body.serves_rocks), serves_chilled: checked(body.serves_chilled), mix_only: checked(body.mix_only), serves_glass: checked(body.serves_glass), serves_bottle: checked(body.serves_bottle), decanting: checked(body.decanting) };
    return html(400, productForm(draft, many(body.spec_ids), String(body.primary_spec_id ?? ""), await familyChoices(), await specChoices(), dbMessage(error)));
  }
}

async function postProductDelete(req: Request, id: string) {
  requireUuid(id);
  const [product] = await q<{ display_name: string }>("SELECT display_name FROM products WHERE id = $1", [id]);
  await tx([
    log("product", id, "delete", `Deleted ${product?.display_name ?? "bottle"}`, { id }, null),
    ["DELETE FROM products WHERE id = $1", [id]],
  ]);
  return go(req, `${DB}/products`);
}

async function postLookup(req: Request, id: string) {
  requireUuid(id);
  const body = await formOf(req);
  try {
    const source = blank(body.source);
    if (!source) throw new ValidationError("Lookup source is required.");
    let raw: unknown;
    try { raw = JSON.parse(blank(body.raw) ?? "{}"); } catch { throw new ValidationError("Raw payload must be JSON."); }
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) throw new ValidationError("Raw payload must be a JSON object.");
    const amount = numberOrNull(body.net_contents_amount, "Net contents");
    const unit = blank(body.net_contents_unit);
    if ((amount == null) !== (unit == null)) throw new ValidationError("Lookup net contents need both an amount and a unit.");
    const abv = numberOrNull(body.abv, "ABV");
    await tx([
      [`INSERT INTO product_lookups (product_id, source, title, brand, size_text, image_url, description, origin, abv, net_contents_amount, net_contents_unit, raw)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
        ON CONFLICT (product_id) DO UPDATE SET source = EXCLUDED.source, retrieved_at = now(), title = EXCLUDED.title, brand = EXCLUDED.brand,
          size_text = EXCLUDED.size_text, image_url = EXCLUDED.image_url, description = EXCLUDED.description, origin = EXCLUDED.origin,
          abv = EXCLUDED.abv, net_contents_amount = EXCLUDED.net_contents_amount, net_contents_unit = EXCLUDED.net_contents_unit, raw = EXCLUDED.raw`,
        [id, source, blank(body.title), blank(body.brand), blank(body.size_text), blank(body.image_url), blank(body.description), blank(body.origin), abv, amount, unit, JSON.stringify(raw)]],
      log("product", id, "update", "Saved a barcode lookup", null, { lookup: true }),
    ]);
    return go(req, `${DB}/products/${id}`);
  } catch (error) {
    if (!isUserError(error)) throw error;
    const found = await readProduct(id);
    if (!found) return notFound(`${DB}/products`, "Product not found.");
    found.product.lookup = { ...(found.product.lookup as object ?? {}), ...body, raw: blank(body.raw) ?? "{}" };
    return html(400, productForm(found.product, found.specs, found.primary, await familyChoices(), await specChoices(), dbMessage(error)));
  }
}

async function postLookupDelete(req: Request, id: string) {
  requireUuid(id);
  await tx([["DELETE FROM product_lookups WHERE product_id = $1", [id]], log("product", id, "update", "Removed a barcode lookup", null, { lookup: false })]);
  return go(req, `${DB}/products/${id}`);
}

async function recipesPage() {
  const rows = await q<Bag>(`
    SELECT r.id, r.name, r.section, r.rating, count(l.spec_id) AS lines,
           coalesce(bool_and(l.available) FILTER (WHERE l.required), true) AS buildable,
           coalesce(json_agg(json_build_object('name', l.spec_name, 'required', l.required, 'status', l.status) ORDER BY l.position)
                    FILTER (WHERE NOT l.available), '[]') AS missing
      FROM recipes r
      LEFT JOIN recipe_line_status l ON l.recipe_id = r.id
     GROUP BY r.id
     ORDER BY buildable DESC, r.name`);
  const why: Record<string, string> = { no_product: "no bottle linked", out_of_stock: "out of stock" };
  const body = rows.map((recipe) => {
    const missing = (recipe.missing as { name: string; required: boolean; status: string }[]) ?? [];
    const needed = missing.filter((line) => line.required).map((line) => `${esc(line.name)} <span class="hint">(${why[line.status] ?? esc(line.status)})</span>`).join(", ");
    const optional = missing.filter((line) => !line.required).map((line) => `${esc(line.name)} (${why[line.status] ?? esc(line.status)})`).join(", ");
    return `<tr>
      <td>${recipe.buildable ? `<span class="pill ok">Buildable</span>` : `<span class="pill off">Not buildable</span>`}</td>
      <td><a href="${DB}/recipes/${recipe.id}">${esc(recipe.name)}</a></td>
      <td>${esc(recipe.section)}</td>
      <td>${esc(recipe.rating ?? "")}</td>
      <td>${esc(recipe.lines)}</td>
      <td>${needed}${optional ? `<div class="hint">Optional, missing: ${optional}</div>` : ""}</td>
    </tr>`;
  }).join("");
  return html(200, page({
    title: "Recipes",
    active: `${DB}/recipes`,
    body: `${heading("Recipes", "Every recipe is listed. The mixed menu shows a recipe only when every required spec is available.", `<a class="button" href="${DB}/recipes/new">New recipe</a>`)}
      <table><thead><tr><th>Status</th><th>Name</th><th>Section</th><th>Rating</th><th>Lines</th><th>Missing</th></tr></thead>
      <tbody>${body || `<tr><td colspan="6" class="empty">No recipes yet.</td></tr>`}</tbody></table>`,
  }));
}

async function recipeEdit(id: string) {
  requireUuid(id);
  const [recipe] = await q<Bag>("SELECT * FROM recipes WHERE id = $1", [id]);
  if (!recipe) return notFound(`${DB}/recipes`, "Recipe not found.");
  const lines = await q<Bag>("SELECT spec_id, position, required, amount, unit, role, note FROM recipe_lines WHERE recipe_id = $1 ORDER BY position", [id]);
  return html(200, recipeForm(recipe, lines, await specChoices(), await glasses(), null));
}

async function postRecipe(req: Request, id: string | null) {
  const body = await formOf(req);
  try {
    await saveRecipe(id, recipeInput(body));
    return go(req, id ? `${DB}/recipes/${id}` : `${DB}/recipes`);
  } catch (error) {
    if (!isUserError(error)) throw error;
    const lines = Object.values((body.lines as Record<string, Bag> | undefined) ?? {}).map((line) => ({ ...line, required: checked(line.required) }));
    return html(400, recipeForm(id ? { id, ...body } : body, lines, await specChoices(), await glasses(), dbMessage(error)));
  }
}

async function postRecipeDelete(req: Request, id: string) {
  requireUuid(id);
  const [recipe] = await q<{ name: string }>("SELECT name FROM recipes WHERE id = $1", [id]);
  await tx([
    log("recipe", id, "delete", `Deleted ${recipe?.name ?? "recipe"}`, { id }, null),
    ["DELETE FROM recipes WHERE id = $1", [id]],
  ]);
  return go(req, `${DB}/recipes`);
}
