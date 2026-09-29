import type { Fact, Facts } from "@/lib/stack-info";

function Rows({ rows, className = "" }: { rows: Fact[]; className?: string }) {
  return (
    <dl className={`a-git-rows a-facts${className}`}>
      {rows.map((f) => (
        <div key={f.label}>
          <dt>{f.label}</dt>
          <dd className={f.warn ? "is-warn" : undefined}>
            {f.mono ? <code>{f.value}</code> : <span className="a-fact-v">{f.value}</span>}
            {f.sub ? <span className="a-fact-sub">{f.sub}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A short grey purpose line, then label-left, value-right rows (the git card's style) with an optional detail
 * under the value, raw ids under a closed "Details" row, then dashboard links.
 */
export function StackFacts({ facts, heading = null }: { facts: Facts; heading?: string | null }) {
  return (
    <>
      {heading ? <p className="a-stack-sub">{heading}</p> : null}
      {facts.purpose ? <p className="a-purpose">{facts.purpose}</p> : null}
      <Rows rows={facts.rows} />
      {facts.details?.length ? (
        <details className="a-ids">
          <summary>Details</summary>
          <Rows rows={facts.details} className=" a-ids-rows" />
        </details>
      ) : null}
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
