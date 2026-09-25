const FRACTIONS: Record<string, string> = { "0.25": "¼", "0.5": "½", "0.75": "¾" };
const PLURALS: Record<string, string> = { dash: "dashes", part: "parts", rind: "rinds", tbsp: "tbsp" };

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

/** "Coupe, served up (chilled, no ice)"; "Double rocks glass, over one large cube". */
export function glassLine(glass: string, service: string | null, note: string | null): string {
  let text = cap(glassNoun(glass));
  const ice = service === "on the rocks" && note && /cube|ice/i.test(note);
  if (ice) text += `, over ${note}`;
  else if (service) text += `, ${SERVICE[service] ?? service}`;
  if (note && !ice) text += `, ${note}`;
  return text;
}

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
