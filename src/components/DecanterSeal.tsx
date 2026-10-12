/**
 * Circular seal for a card that uses a decanter. Words only, no picture. It floats behind the
 * title (and, on a cast, the rating) so that text paints over it. Phone and cast cards only;
 * the menu and the TV board stay unmarked.
 */
export function DecanterSeal({ className = "" }: { className?: string }) {
  const classes = ["decanter-seal", className].filter(Boolean).join(" ");
  return (
    <span className={classes} role="img" aria-label="In the decanter">
      <span>In the</span>
      <span>Decanter</span>
    </span>
  );
}
