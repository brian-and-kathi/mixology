/**
 * Reserved (migration 032): the inline skeleton key, a padlock fallback for the TV, and the antique brass
 * "Reserved" tag. Brass is --reserved (globals.css), never the copper Featured color or the menu gold.
 * Icons are stroked in currentColor and sized in em, so they follow the text they sit in.
 */

/** A skeleton key, lying flat: ornate ring bow (with a small inner loop), collar, long shank and a stepped bit. */
export function KeyIcon({ className = "", label }: { className?: string; label?: string }) {
  return (
    <svg className={`res-icon key-icon${className ? ` ${className}` : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
      strokeLinecap="round" strokeLinejoin="round" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <circle cx="5.6" cy="12" r="3.9" />
      <circle cx="5.6" cy="12" r="1.15" fill="currentColor" stroke="none" />
      <path d="M9.5 12H22" />
      <path d="M11.4 9.9v4.2" />
      <path d="M17 12v4h2.1v-2h2.4" />
    </svg>
  );
}

/** Padlock fallback (closed shackle, keyhole), for the TV if the key reads poorly from the couch. */
export function PadlockIcon({ className = "", label }: { className?: string; label?: string }) {
  return (
    <svg className={`res-icon lock-icon${className ? ` ${className}` : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
      strokeLinecap="round" strokeLinejoin="round" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path d="M7.5 10.5V7.8a4.5 4.5 0 0 1 9 0v2.7" />
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.2" />
      <path d="M12 14.6v2.6" />
    </svg>
  );
}

/** The brass "Reserved" pill, with the key. Guest pages and the TV; never alone: the item is also dimmed and sorted last. */
export function ReservedTag({ className = "", icon = true }: { className?: string; icon?: boolean }) {
  return (
    <span className={`res-tag${className ? ` ${className}` : ""}`}>
      {icon ? <KeyIcon /> : null}
      Reserved
    </span>
  );
}
