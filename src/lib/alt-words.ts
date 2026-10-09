import { orText } from "@/lib/alternates";
import { cap, lineText } from "@/lib/format";

/** One other ingredient a guest may use for a line tonight. */
export type AltChoice = { name: string; amount: string | null; unit: string | null; note: string | null };

/**
 * The muted "or …" after a line's leading ingredient (migration 034): "or Cognac",
 * "or Cognac, Brandy", three or more "or Cognac +2" (`more` opens on tap on the phone). An alternate poured in a
 * different amount names it ("or ½ oz Rich syrup (2:1)"). `notes`: each alternate's own note, "Rich syrup (2:1): …".
 * No database import, so a client component can use it. Pass already-scaled amounts; this does not scale again.
 */
export function altWords(line: { amount: string | null; unit: string | null; alternates?: AltChoice[] | null }): { text: string; more: string[]; notes: string[] } {
  const alts = line.alternates ?? [];
  const num = (v: string | null) => (v === null || v === "" ? null : Number(v));
  const label = (a: AltChoice) => {
    const same = num(a.amount) === num(line.amount) && (a.unit ?? null) === (line.unit ?? null);
    if (same) return line.unit === "top" ? a.name.toLowerCase() : cap(a.name);
    const t = lineText(a.amount, a.unit, a.name);
    // "½ oz" never splits from itself or from the name.
    return t.amount ? `${t.amount.replace(/ /g, "\u00a0")}\u00a0${t.name}` : t.name;
  };
  const { text, more } = orText(alts.map(label));
  return { text, more, notes: alts.filter((a) => a.note).map((a) => `${cap(a.name)}: ${a.note}`) };
}
