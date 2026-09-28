/** Sad face icon (SVG, not emoji), stroke only, in the watermark color. */
function SadFace() {
  return (
    <svg className="tv-closed-face" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
      <circle cx="24" cy="24" r="20.5" />
      <circle cx="17" cy="19.5" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="31" cy="19.5" r="2.2" fill="currentColor" stroke="none" />
      <path d="M15.5 34.5c2.2-3.6 5.1-5.4 8.5-5.4s6.3 1.8 8.5 5.4" />
    </svg>
  );
}

/** TV while the bar is Closed (DESIGN §3.1): a big diagonal "Closed" over the board, which stays underneath. */
export function ClosedWatermark() {
  return (
    <div className="tv-closed" role="img" aria-label="The bar is closed">
      <div className="tv-closed-band" aria-hidden>
        <SadFace />
        <span>Closed</span>
        <SadFace />
      </div>
    </div>
  );
}
