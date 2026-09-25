const FRACTIONS: Record<string, string> = { "0.25": "¼", "0.5": "½", "0.75": "¾" };
const PLURALS: Record<string, string> = { dash: "dashes", part: "parts", rind: "rinds", tbsp: "tbsp", barspoon: "barspoons" };

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

/** Plain serve text for a pour, e.g. "Usually neat or on the rocks · water on request". */
export function serveLine(neat: boolean, rocks: boolean, chilled: boolean): string {
  const ways = [neat && "neat", rocks && "on the rocks"].filter(Boolean).join(" or ");
  const parts = [ways ? `Usually ${ways}` : "Neat or on the rocks", chilled && "best chilled", "water on request"];
  return parts.filter(Boolean).join(" · ");
}

/** Cellar wines reuse the serve columns: Chilled = serves_chilled, Room temp = serves_neat, Over ice = serves_rocks. */
export function wineServeLine(chilled: boolean, neat: boolean, rocks: boolean): string | null {
  const ways = [chilled && "chilled", neat && "at room temperature", rocks && "over ice"].filter(Boolean);
  return ways.length ? `Usually ${ways.join(" or ")}` : null;
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
  return { main: ways ? cap(ways) : "Neat or on the rocks", quiet: [chilled ? "Best chilled" : null, "Water on request"].filter((x): x is string => !!x) };
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
export function lineText(amount: string | null, unit: string | null, name: string): { amount: string; name: string } {
  if (unit === "top") return { amount: "", name: `Top with ${name.toLowerCase()}` };
  if (unit === "rinse") return { amount: "", name: `${cap(name)} rinse` };
  return { amount: measure(amount, unit), name: cap(name) };
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

/** Trimmed, lower-cased, accents removed, runs of whitespace as one space: "  Réviseur  VS" → "reviseur vs". */
const plain = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Whether a bottle's title already says `name` (the pour page's meta line drops it then): the title is `name`,
 * or starts with it as whole words ("Réviseur VS" / "Réviseur", "Bowright Recurve" / "Bowright"), ignoring case,
 * accents and extra spaces. Whole words only, so "Mid" doesn't match "Midori"; a longer name the title only
 * starts ("Long Road Distillers" under "Long Road") isn't said by the title, so it stays.
 */
export function titleSays(title: string, name: string | null | undefined): boolean {
  const t = plain(title), n = plain(name ?? "");
  if (!n || !t.startsWith(n)) return false;
  return t.length === n.length || !/[\p{L}\p{N}]/u.test(t[n.length]);
}
