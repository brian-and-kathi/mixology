import type { Facts } from "@/lib/stack-info";

/** A short grey purpose line, then label-left, value-right rows (the git card's style), an optional id or detail under the value, then dashboard links. */
export function StackFacts({ facts, heading = null }: { facts: Facts; heading?: string | null }) {
  return (
    <>
      {heading ? <p className="a-stack-sub">{heading}</p> : null}
      {facts.purpose ? <p className="a-purpose">{facts.purpose}</p> : null}
      <dl className="a-git-rows a-facts">
        {facts.rows.map((f) => (
          <div key={f.label}>
            <dt>{f.label}</dt>
            <dd>
              {f.mono ? <code>{f.value}</code> : <span className="a-fact-v">{f.value}</span>}
              {f.sub ? <span className="a-fact-sub">{f.sub}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      {facts.note ? <p className="a-quiet a-host-note">{facts.note}</p> : null}
      {facts.links.length ? (
        <p className="a-fact-links">
          {facts.links.map((l) => (
            <a key={l.href} className="a-host-link" href={l.href} target="_blank" rel="noopener noreferrer">
              {l.label} ↗
            </a>
          ))}
        </p>
      ) : null}
    </>
  );
}
