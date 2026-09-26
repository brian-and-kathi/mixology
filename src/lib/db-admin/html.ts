// @ts-nocheck
const NAV = [
  ["/db", "Home"],
  ["/db/families", "Families"],
  ["/db/specs", "Specs"],
  ["/db/substitutions", "Substitutions"],
  ["/db/products", "Products"],
  ["/db/recipes", "Recipes"],
  ["/db/menus", "Menus"],
];

export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

export function page({ title, active, body, error = null, notice = null }: { title: string; active: string; body: string; error?: string | null; notice?: string | null }): string {
  const nav = NAV.map(([href, label]) => {
    const current = href === active ? ' aria-current="page"' : "";
    return `<a href="${href}"${current}>${label}</a>`;
  }).join("");
  const menu = `<div class="db-menu" data-db-menu>
      <button type="button" class="db-menu-btn" aria-label="Open menu" aria-expanded="false" aria-controls="db-menu-panel">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
      <div id="db-menu-panel" class="db-menu-panel" data-db-menu-panel hidden>
        <nav aria-label="Site">
          <a href="/menu">Guest menu</a>
          <a href="/admin">Bar admin</a>
          <hr>
          <form method="post" action="/api/admin/logout"><button type="submit">Sign out</button></form>
        </nav>
      </div>
    </div>`;
  const banner = error
    ? `<p class="banner" role="alert">${esc(error)}</p>`
    : notice
      ? `<p class="banner ok" role="status">${esc(notice)}</p>`
      : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#06140e">
  <meta name="robots" content="noindex">
  <title>${esc(title)} · Database</title>
  <link rel="stylesheet" href="/db-static/app.css?v=3">
</head>
<body>
  <header class="top">
    <a class="mark" href="/">Database</a>
    <nav class="sections" aria-label="Database">${nav}</nav>
    ${menu}
  </header>
  <main>
    ${banner}
    ${body}
  </main>
  <script src="/db-static/app.js?v=3"></script>
</body>
</html>`;
}

export function heading(title: string, lede = "", action = ""): string {
  const extra = action ? `<div class="actions">${action}</div>` : "";
  return `<div class="heading"><div><h1>${esc(title)}</h1>${lede ? `<p class="lede">${lede}</p>` : ""}</div>${extra}</div>`;
}

export function field(label: string, control: string, tip = ""): string {
  const tipAttr = tip ? ` data-tip="${esc(tip)}"` : "";
  return `<div class="field"><span class="label"${tipAttr}>${label}</span><div class="control">${control}</div></div>`;
}

export function text(name: string, value: unknown, attrs = ""): string {
  return `<input name="${esc(name)}" value="${esc(value ?? "")}" ${attrs}>`;
}

export function area(name: string, value: unknown, attrs = ""): string {
  return `<textarea name="${esc(name)}" ${attrs}>${esc(value ?? "")}</textarea>`;
}

export function select(name: string, options: { value: string; label: string; extra?: string }[], selected: unknown, attrs = ""): string {
  const html = options
    .map((option) => {
      const on = String(option.value) === String(selected ?? "") ? " selected" : "";
      const extra = option.extra ? ` ${option.extra}` : "";
      return `<option value="${esc(option.value)}"${extra}${on}>${esc(option.label)}</option>`;
    })
    .join("");
  return `<select name="${esc(name)}" ${attrs}>${html}</select>`;
}

export function check(name: string, on: unknown, label: string, attrs = "", tip = ""): string {
  const checkedAttr = on ? " checked" : "";
  const valueAttr = /\bvalue=/.test(attrs) ? "" : ' value="on"';
  const tipAttr = tip ? ` data-tip="${esc(tip)}"` : "";
  return `<label class="check"><input type="checkbox" name="${esc(name)}"${valueAttr}${checkedAttr} ${attrs}> <span${tipAttr}>${esc(label)}</span></label>`;
}

export function options(pairs: readonly (readonly string[])[], placeholder?: string): { value: string; label: string; extra: string }[] {
  const items = placeholder ? [{ value: "", label: placeholder, extra: "" }] : [];
  for (const [value, label, extra] of pairs) items.push({ value, label, extra: extra ?? "" });
  return items;
}

export const KINDS = [
  ["spirit", "Spirit"],
  ["wine", "Wine"],
  ["modifier", "Modifier"],
  ["mixer", "Mixer"],
  ["garnish", "Garnish"],
  ["sweetener", "Sweetener"],
  ["staple", "Staple"],
  ["other", "Other"],
];

export const WINE_COLORS = [
  ["not_applicable", "Not applicable"],
  ["red", "Red"],
  ["white", "White"],
  ["rose", "Rosé"],
  ["unknown", "Unknown"],
];

export const EFFERVESCENCE = [
  ["not_applicable", "Not applicable"],
  ["still", "Still"],
  ["sparkling", "Sparkling"],
];

export const UNITS = [
  ["", "Unit"],
  ["ml", "ml"],
  ["cl", "cl"],
  ["l", "l"],
  ["oz", "oz"],
  ["g", "g"],
  ["kg", "kg"],
  ["count", "count"],
];

export const ROLES = [
  ["", "Role"],
  ["base", "Base"],
  ["modifier", "Modifier"],
  ["juice", "Juice"],
  ["sweetener", "Sweetener"],
  ["garnish", "Garnish"],
  ["other", "Other"],
];

export const RATINGS = [
  ["", "Unrated"],
  ["1", "1"],
  ["2", "2"],
  ["3", "3"],
  ["4", "4"],
  ["5", "5"],
];

export const SECTIONS = [
  ["mixed", "Mixed"],
  ["neat", "Neat"],
  ["wine", "Wine"],
];
