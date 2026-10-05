/**
 * A drink's moods (migration 033) on one quiet line, "Night-Out · Bitter · Nostalgic", the /menu chip labels in
 * MOODS order (Brian via Vincent, 2026-10-04). Shared by the TV cast band and the phone recipe page; nothing
 * renders when there are none. Server- and client-safe (no hooks).
 */
export function MoodLine({ moods, className }: { moods: readonly string[] | null | undefined; className: string }) {
  if (!moods?.length) return null;
  return (
    <p className={className} aria-label={`Moods: ${moods.join(", ")}`}>
      {moods.map((m, i) => <span key={m}>{i ? <span className="sep" aria-hidden>·</span> : null}{m}</span>)}
    </p>
  );
}
