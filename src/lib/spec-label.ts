/**
 * The spec badge's text for a bottle: its own badge label when set (products.spec_label, migration 023, e.g.
 * "London dry gin"), else its primary ingredient (product_specs.is_primary, the link recipes match on),
 * sentence-cased: "rye" → "Rye", "sloe gin" → "Sloe gin", "melon liqueur" → "Melon liqueur".
 * Neither: no badge. The label is display only; recipes never see it. Plain module so admin (client)
 * and guest pages share it.
 */
export function specLabel(spec: string | null | undefined, label?: string | null): string | null {
  const own = (label ?? "").trim();
  if (own) return own;
  const t = (spec ?? "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : null;
}

/**
 * The badge to show after a displayed name: none when the name already says it, matching whole words and
 * ignoring case ("Amaretto di Toscana" / "Amaretto", "Aperol" / "Aperol", "Pimm's No. 1" / "Pimm's").
 */
export function badgeFor(name: string, badge: string | null): string | null {
  if (!badge) return null;
  const esc = badge.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, "iu").test(name) ? null : badge;
}
