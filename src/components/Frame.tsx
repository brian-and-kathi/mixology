/** Thin inset border with scalloped corners, as on the speakeasy display. Decorative only. */
export function Frame() {
  return (
    <div aria-hidden className="frame">
      <span className="frame-corner tl" />
      <span className="frame-corner tr" />
      <span className="frame-corner bl" />
      <span className="frame-corner br" />
    </div>
  );
}
