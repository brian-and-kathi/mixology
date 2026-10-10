/**
 * Wax-seal emblem for a pour that is in a decanter. The blue is the complement of the gold type
 * (--decanting). Decorative; the name is in the accessible label.
 */
export function DecanterSeal({ className = "" }: { className?: string }) {
  return (
    <svg className={className ? `decanter-seal ${className}` : "decanter-seal"} viewBox="0 0 120 120" role="img" aria-label="In a decanter">
      <circle cx="60" cy="60" r="57" fill="#102844" />
      <circle cx="60" cy="60" r="52" fill="none" stroke="#8eb4e6" strokeWidth="2.25" />
      <circle cx="60" cy="60" r="46" fill="none" stroke="#8eb4e6" strokeWidth="0.7" />
      <g fill="#d7e6fb">
        <rect x="51" y="24" width="18" height="5" rx="1" />
        <path d="M56 29h8v11h-8z" />
        <path d="M56 40c0 0-16 12-16 28 0 14 9 20 20 20s20-6 20-20c0-16-16-28-16-28h-8z" />
      </g>
      <text x="60" y="104" textAnchor="middle" fill="#8eb4e6" fontSize="8" letterSpacing="1.8" fontFamily="ui-sans-serif, system-ui, sans-serif">DECANTER</text>
    </svg>
  );
}
