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
