/**
 * Circular seal for a bottle that is in a decanter. Shown on a pour, cocktail, or wine card
 * (phone and a cast), never on the menu or the TV board. The blue is the complement of the gold
 * type (--decanting). Decorative; the name is in the accessible label.
 * `compact` is the ingredient-line icon (no word). The full seal sits beside a pour or wine title.
 */
export function DecanterSeal({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const classes = ["decanter-seal", compact ? "inline" : "", className].filter(Boolean).join(" ");
  return (
    <svg className={classes} viewBox="0 0 120 120" role="img" aria-label="In a decanter">
      {compact ? (
        <circle cx="60" cy="60" r="54" fill="#16345c" stroke="#8eb4e6" strokeWidth="7" />
      ) : (
        <>
          <circle cx="60" cy="60" r="57" fill="#102844" />
          <circle cx="60" cy="60" r="52" fill="none" stroke="#8eb4e6" strokeWidth="2.25" />
          <circle cx="60" cy="60" r="46" fill="none" stroke="#8eb4e6" strokeWidth="0.7" />
        </>
      )}
      <g fill="#d7e6fb">
        <rect x="51" y="24" width="18" height="5" rx="1" />
        <path d="M56 29h8v11h-8z" />
        <path d="M56 40c0 0-16 12-16 28 0 14 9 20 20 20s20-6 20-20c0-16-16-28-16-28h-8z" />
      </g>
      {compact ? null : (
        <text x="60" y="104" textAnchor="middle" fill="#8eb4e6" fontSize="8" letterSpacing="1.8" fontFamily="ui-sans-serif, system-ui, sans-serif">DECANTER</text>
      )}
    </svg>
  );
}
