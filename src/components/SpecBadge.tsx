/**
 * A bottle's name with its spec badge right after it ("Bowright Recurve [Rye]"), on Pours (phone and TV)
 * and the pour page. The badge rides with the name's last word in one no-wrap run, so it never starts a
 * line on its own: when the name wraps, the badge follows the last word. No spec: just the name.
 * Styling: .spec-badge in globals.css.
 */
export function BadgedName({ name, spec }: { name: string; spec?: string | null }) {
  if (!spec) return <>{name}</>;
  const text = name.trim();
  const cut = text.lastIndexOf(" ");
  return (
    <>
      {cut >= 0 ? text.slice(0, cut + 1) : null}
      <span className="badged">
        {text.slice(cut + 1)}
        <span className="spec-badge">{spec}</span>
      </span>
    </>
  );
}
