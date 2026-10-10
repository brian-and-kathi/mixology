/** Names of the admin list-search cookies. One box, one cookie, kept on this device. */
export const SEARCH = {
  stock: "mx_q_stock",
  recipes: "mx_q_recipes",
  ingredients: "mx_q_ingredients",
  decanters: "mx_q_decanters",
} as const;

const MAX = 80;

/** Strip controls and cap length. Leaves spaces alone so typing is not trimmed mid-word. */
export function cleanSearch(value: string | undefined | null): string {
  return (value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, MAX);
}

/** document.cookie assignment for one remembered search. Empty value expires it. */
export function searchCookieAssignment(name: string, value: string, secure: boolean): string {
  const clean = cleanSearch(value);
  const maxAge = clean ? 60 * 60 * 24 * 180 : 0;
  const flag = secure ? "; Secure" : "";
  return `${name}=${encodeURIComponent(clean)}; Path=/admin; Max-Age=${maxAge}; SameSite=Lax${flag}`;
}
