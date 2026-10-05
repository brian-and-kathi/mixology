/**
 * A drink's moods (migration 033) as small badges, "Night-Out" "Bitter" "Nostalgic", the /menu chip labels in MOODS
 * order. Shared by the TV cast band and the phone recipe page; nothing renders when there are none. Server- and
 * client-safe (no hooks). Badges (Brian via Vincent, 2026-10-04): an outlined slate pill, deliberately unlike the
 * gold type/grape tags, the copper Featured tag and the brass "Ask the host" tag. A real list, so screen readers
 * hear "Moods, 3 items".
 */
export function MoodLine({ moods, className }: { moods: readonly string[] | null | undefined; className: string }) {
  if (!moods?.length) return null;
  return (
    <ul className={`mood-badges ${className}`} aria-label="Moods">
      {moods.map((m) => <li key={m} className="mood-badge">{m}</li>)}
    </ul>
  );
}
