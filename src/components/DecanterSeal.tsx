/**
 * Wax-seal stamp for a card that uses a decanter. Words only, no picture, with a rule above
 * and below them: "in the", the decanter's label, "decanter". It floats behind the title
 * (and, on a cast, the rating) so that text paints over it. Phone and cast cards only;
 * the menu and the TV board stay unmarked.
 */
// A pressed disc: nearly round, with a soft edge and one short drip.
const WAX =
  "M60.0 11.9 C61.6 11.7 63.2 11.7 64.8 11.7 C66.3 11.7 68.0 11.8 69.5 12.1 C71.1 12.3 72.7 12.6 74.2 13.1 C75.8 13.5 77.3 14.1 78.8 14.7 C80.2 15.3 81.7 16.0 83.1 16.8 C84.4 17.7 85.8 18.5 87.1 19.5 C88.3 20.4 89.6 21.5 90.7 22.5 C91.9 23.6 93.0 24.8 94.1 25.9 C95.1 27.1 96.1 28.3 97.1 29.6 C98.0 30.8 98.9 32.1 99.7 33.5 C100.5 34.8 101.3 36.2 102.0 37.6 C102.7 38.9 103.3 40.4 103.9 41.8 C104.5 43.3 105.0 44.7 105.4 46.2 C105.8 47.7 106.1 49.2 106.4 50.8 C106.7 52.3 106.8 53.8 106.9 55.4 C107.0 56.9 107.0 58.5 106.9 60.0 C106.8 61.5 106.6 63.1 106.3 64.6 C106.1 66.1 105.7 67.6 105.3 69.0 C104.8 70.5 104.3 71.9 103.8 73.3 C103.2 74.7 102.6 76.0 101.9 77.3 C101.2 78.7 100.5 80.0 99.7 81.2 C98.9 82.5 98.1 83.7 97.2 84.9 C96.4 86.1 95.5 87.2 94.6 88.4 C93.6 89.5 92.7 90.6 91.6 91.6 C90.6 92.7 89.6 93.7 88.5 94.7 C87.4 95.7 86.2 96.6 85.1 97.5 C83.9 98.4 82.7 99.2 81.4 100.0 C80.2 100.9 78.9 101.6 77.6 102.4 C76.3 103.2 75.0 104.0 73.6 105.0 C72.3 105.9 71.0 107.1 69.6 108.2 C68.1 109.2 66.7 110.6 65.1 111.4 C63.5 112.3 61.7 113.0 60.0 113.1 C58.3 113.2 56.5 112.7 54.9 112.2 C53.2 111.6 51.7 110.5 50.1 109.7 C48.6 108.8 47.2 108.0 45.7 107.3 C44.2 106.6 42.7 106.0 41.2 105.4 C39.7 104.8 38.1 104.4 36.6 103.7 C35.1 103.1 33.6 102.4 32.2 101.6 C30.8 100.8 29.4 99.9 28.0 98.9 C26.7 98.0 25.5 96.8 24.3 95.7 C23.2 94.5 22.1 93.2 21.2 91.9 C20.3 90.5 19.4 89.1 18.7 87.6 C18.0 86.1 17.4 84.6 16.9 83.0 C16.4 81.5 16.0 79.9 15.7 78.3 C15.4 76.8 15.2 75.2 15.1 73.6 C15.0 72.1 14.9 70.5 14.9 69.0 C14.9 67.4 15.0 65.9 15.1 64.4 C15.2 62.9 15.4 61.5 15.6 60.0 C15.7 58.5 16.0 57.1 16.2 55.7 C16.5 54.3 16.8 52.9 17.1 51.5 C17.5 50.1 17.9 48.7 18.3 47.4 C18.8 46.0 19.3 44.7 19.9 43.4 C20.5 42.1 21.1 40.8 21.8 39.6 C22.5 38.4 23.3 37.2 24.1 36.0 C24.9 34.8 25.7 33.7 26.5 32.5 C27.4 31.4 28.3 30.3 29.2 29.2 C30.1 28.1 31.0 27.0 32.0 25.9 C33.0 24.9 34.1 23.8 35.2 22.9 C36.3 21.9 37.5 21.0 38.7 20.1 C39.9 19.2 41.2 18.4 42.5 17.7 C43.8 16.9 45.1 16.3 46.5 15.6 C47.9 15.0 49.4 14.4 50.8 13.9 C52.3 13.5 53.8 13.0 55.3 12.7 C56.9 12.3 58.4 12.1 60.0 11.9 Z";

export function DecanterSeal({ label, className = "" }: { label?: string | string[] | null; className?: string }) {
  const labels = [...new Set((Array.isArray(label) ? label : label ? [label] : []).map((s) => s.trim()).filter(Boolean))];
  const classes = ["decanter-seal", className].filter(Boolean).join(" ");
  return (
    <span className={classes} role="img" aria-label={labels.length ? `in the ${labels.join(", ")} decanter` : "in the decanter"}>
      <svg viewBox="-4 -4 128 128" aria-hidden>
        <path d={WAX} />
      </svg>
      <span className="decanter-seal-words">
        <span>in the</span>
        {labels.map((text) => <span key={text} className="decanter-seal-label">{text}</span>)}
        <span>decanter</span>
      </span>
    </span>
  );
}
