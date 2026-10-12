const FRACTIONS: Record<string, string> = { "0.25": "¼", "0.5": "½", "0.75": "¾" };
const PLURALS: Record<string, string> = {
  dash: "dashes", part: "parts", rind: "rinds", tbsp: "tbsp", barspoon: "barspoons",
  slice: "slices", wedge: "wedges", leaf: "leaves", sprig: "sprigs", twist: "twists", drop: "drops", pinch: "pinches", cup: "cups",
};

/** Guest recipe servings: 1 through 6. Anything else is one serving. */
export const MAX_SERVINGS = 6;

export function clampServings(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_SERVINGS ? n : 1;
}

const FRAC_IN: Record<string, number> = { "¼": 0.25, "½": 0.5, "¾": 0.75 };
const QTY = "\\d+[¼½¾]?|[¼½¾]";

function parseQty(s: string): number | null {
  const m = s.match(/^(\d+)?([¼½¾])?$/);
  if (!m || (!m[1] && !m[2])) return null;
  return (m[1] ? Number(m[1]) : 0) + (m[2] ? FRAC_IN[m[2]] : 0);
}

/**
 * Wording that states a count: "Serves 1." becomes "Serves 4.", and an ounce amount or range
 * ("4½–6 oz") is multiplied. Minutes and other prose stay as written. One serving returns the text unchanged.
 */
export function scaleProse(text: string, servings: number): string {
  if (servings === 1 || !text) return text;
  const scaled = text.replaceAll(/\bServes 1\b/g, `Serves ${servings}`);
  return scaled.replace(new RegExp(`(${QTY})(?:[–-](${QTY}))?\\s*oz`, "g"), (full, a: string, b?: string) => {
    const n1 = parseQty(a);
    if (n1 == null) return full;
    const left = measure(String(n1 * servings), "oz").replace(/ oz$/, "");
    if (!b) return `${left} oz`;
    const n2 = parseQty(b);
    if (n2 == null) return full;
    const right = measure(String(n2 * servings), "oz").replace(/ oz$/, "");
    return `${left}–${right} oz`;
  });
}

/** Most methods end "Serves 1." Show the slider's count there, and scale any ounce amounts in the wording. */
export function scaleMethod(paragraphs: string[], servings: number): string[] {
  if (servings === 1) return paragraphs;
  return paragraphs.map((p) => scaleProse(p, servings));
}

/**
 * Multiply a measured line by servings. One serving returns the stored amount unchanged.
 * "Top" and "rinse" have no amount. Quarters stay exact (every stored amount is a multiple of ¼).
 */
export function scaleAmount(amount: string | null, unit: string | null, servings: number): string | null {
  if (servings === 1 || amount == null || amount === "" || unit === "top" || unit === "rinse") return amount;
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  const scaled = n * servings;
  return String(Number(scaled.toFixed(2)));
}

/** "2.500" + "oz" -> "2½ oz"; "3.000" + "dash" -> "3 dashes". */
export function measure(amount: string | null, unit: string | null): string {
  if (!amount) return "";
  const n = Number(amount);
  const whole = Math.floor(n);
  const frac = FRACTIONS[String(Number((n - whole).toFixed(2)))];
  const num = frac ? `${whole > 0 ? whole : ""}${frac}` : String(Number(n.toFixed(2)));
  if (!unit) return num;
  const u = n > 1 && PLURALS[unit] ? PLURALS[unit] : unit;
  return `${num} ${u}`;
}

/** Spec names are stored lowercase; capitalize the first letter for display. */
export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Guest-friendly glass wording for recipes.
const GLASS_NOUN: Record<string, string> = {
  martini: "martini glass",
  "nick & nora": "Nick & Nora glass",
  rocks: "rocks glass",
  "double rocks": "double rocks glass",
  highball: "highball glass",
  collins: "Collins glass",
  hurricane: "hurricane glass",
  "irish coffee glass": "Irish coffee glass",
};
const SERVICE: Record<string, string> = {
  up: "served up (chilled, no ice)",
  "on the rocks": "over ice",
  neat: "neat (room temperature, no ice)",
  hot: "served hot",
};
const glassNoun = (g: string) => GLASS_NOUN[g] ?? g;
const article = (w: string) => (/^[aeiou]/i.test(w) ? "an" : "a");

/** Separator for guest phone lines: a no-break space before the dot keeps it with the item before it, so a wrapped line never starts with "·". */
export const DOT = "\u00a0· ";

/** "Coupe · served up (chilled, no ice)"; "Double rocks glass · over one large cube". Same " · " form as the TV band. */
export function glassLine(glass: string, service: string | null, note: string | null): string {
  const ice = service === "on the rocks" && note && /cube|ice/i.test(note);
  const parts = [cap(glassNoun(glass))];
  if (ice) parts.push(`over ${note}`);
  else if (service) parts.push(SERVICE[service] ?? service);
  if (note && !ice) parts.push(note);
  return parts.join(DOT);
}

// Glass names are stored lowercase (they are also icon keys); proper nouns keep their capitals.
const GLASS_NAME: Record<string, string> = { "nick & nora": "Nick & Nora", collins: "Collins", "irish coffee glass": "Irish coffee glass" };
/** Display name for a glass in pickers: "Nick & Nora", "Double rocks". */
export const glassName = (g: string) => GLASS_NAME[g] ?? cap(g);

/** "A Nick & Nora glass works too"; "Or over ice in a double rocks glass". */
export function altGlassLine(alt: string, altService: string | null, service: string | null): string {
  const noun = glassNoun(alt);
  if (!altService || altService === service) return `${cap(article(noun))} ${noun} works too`;
  return `Or ${SERVICE[altService] ?? altService} in ${article(noun)} ${noun}`;
}

/** Plain serve text for a pour, e.g. "Usually neat or on the rocks · best chilled". Water is not listed: guests can always ask. */
export function serveLine(neat: boolean, rocks: boolean, chilled: boolean): string {
  const ways = [neat && "neat", rocks && "on the rocks"].filter(Boolean).join(" or ");
  const parts = [ways ? `Usually ${ways}` : "Neat or on the rocks", chilled && "best chilled"];
  return parts.filter(Boolean).join(" · ");
}

/** Short TV serve line: "Coupe · served up", "Double rocks glass · over one large cube". */
export function tvGlassLine(glass: string, service: string | null, note: string | null): string {
  const ice = service === "on the rocks" && note && /cube|ice/i.test(note);
  const SHORT: Record<string, string> = { up: "served up", "on the rocks": "over ice", neat: "neat", hot: "served hot" };
  const parts = [cap(glassNoun(glass))];
  if (ice) parts.push(`over ${note}`);
  else if (service) parts.push(SHORT[service] ?? service);
  if (note && !ice) parts.push(note);
  return parts.join(" · ");
}

/** Pour serve text split for the TV: main line plus quiet lines. */
export function serveParts(neat: boolean, rocks: boolean, chilled: boolean): { main: string; quiet: string[] } {
  const ways = [neat && "neat", rocks && "on the rocks"].filter(Boolean).join(" or ");
  return { main: ways ? cap(ways) : "Neat or on the rocks", quiet: chilled ? ["Best chilled"] : [] };
}

// A method often opens with its style ("Stirred.", "Shaken.", "Warm, in a mug.") and then says it
// again ("Stir with ice…"). The style moves into the Method label; the text keeps the rest.
const METHOD_STYLE = /^(stirred|shaken|built|blended|rolled|thrown|swizzled|warm(?:,\s*[^.]{1,24})?)\.\s+/i;

/** Split a recipe description into an optional method style and its paragraphs. */
export function splitMethod(description: string | null): { style: string | null; paragraphs: string[] } {
  const paragraphs = (description ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const m = paragraphs[0]?.match(METHOD_STYLE);
  if (!m) return { style: null, paragraphs };
  const rest = paragraphs[0].slice(m[0].length).trim();
  return { style: cap(m[1].trim()), paragraphs: rest ? [cap(rest), ...paragraphs.slice(1)] : paragraphs.slice(1) };
}

/** Units whose lines carry no amount: "Top with soda", "Absinthe rinse". */
export const NO_AMOUNT_UNITS = ["top", "rinse"];

/** How one recipe line reads to a guest: the amount column and the ingredient words. */
export function lineText(amount: string | null, unit: string | null, name: string, servings = 1): { amount: string; name: string } {
  const scaled = scaleAmount(amount, unit, servings);
  if (unit === "top") return { amount: "", name: `Top with ${name.toLowerCase()}` };
  if (unit === "rinse") return { amount: "", name: `${cap(name)} rinse` };
  return { amount: measure(scaled, unit), name: cap(name) };
}

export const METHOD_STYLES = ["stirred", "shaken", "built", "blended", "rolled", "thrown", "swizzled", "warm", "warm, in a mug", "warm, batch"];

/**
 * Method label and paragraphs. recipes.method_style (migration 017) wins; until that column exists
 * (or when it is empty) the style is read from a leading "Stirred." in the text, as before.
 * A leading style word is always taken out of the text so it never reads twice.
 */
export function methodParts(description: string | null, style: string | null | undefined): { label: string; paragraphs: string[] } {
  const parsed = splitMethod(description);
  const st = style ? cap(style) : parsed.style;
  return { label: st ? `Method · ${st}` : "Method", paragraphs: parsed.paragraphs };
}

/**
 * Guest alcohol: a whole percent and a lower-case unit ("56% abv").
 * Empty when the value is missing or not above zero. 56.4 rounds to 56; 56.5 rounds to 57.
 */
export function abvLabel(abv: string | number | null | undefined): string {
  const n = typeof abv === "number" ? abv : Number(abv);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `${Math.round(n)}% abv`;
}

/**
 * A UPC/EAN as printed under the barcode. DISPLAY ONLY: stored values, saving and scan/lookup matching keep the
 * plain digits. After stripping non-digits:
 *   13 digits starting with 0 (an EAN-13 that is really a UPC-A): drop the 0, then as UPC-A;
 *   12 digits (UPC-A): "0 12345 67890 5";
 *   13 digits (EAN-13): "5 012345 678900";
 *   8 digits (UPC-E / EAN-8): "1234 5678";
 *   anything else (empty, 14-digit GTIN, odd lengths): returned as given.
 */
export function formatUpc(upc: string | null | undefined): string {
  const raw = upc ?? "";
  let d = raw.replace(/\D/g, "");
  if (d.length === 13 && d[0] === "0") d = d.slice(1);
  if (d.length === 12) return `${d[0]} ${d.slice(1, 6)} ${d.slice(6, 11)} ${d[11]}`;
  if (d.length === 13) return `${d[0]} ${d.slice(1, 7)} ${d.slice(7)}`;
  if (d.length === 8) return `${d.slice(0, 4)} ${d.slice(4)}`;
  return raw;
}

/** Search text for a UPC: the stored digits and the printed form, so "012345678905" and "0 12345 67890 5" both match. */
export function upcSearchText(upc: string | null | undefined): string {
  if (!upc) return "";
  const shown = formatUpc(upc);
  return shown === upc ? upc : `${upc} ${shown}`;
}
