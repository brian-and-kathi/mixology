/**
 * Short mark for a bottle that is in a decanter. "(dec)" replaces the longer "[decanting]" word.
 * Blue is the complement of the gold type (--decanting). The accessible name is the full phrase.
 */
export function DecantBadge({ sup = false }: { sup?: boolean }) {
  const Tag = sup ? "sup" : "span";
  return (
    <Tag className="dec-badge" role="img" aria-label="In a decanter">
      (dec)
    </Tag>
  );
}
