import type { StackInfo } from "@/lib/stack-info";

/** The System tab's picture of the stack: who talks to whom, top to bottom, sized for a phone. */
export function StackCard({ info }: { info: StackInfo }) {
  const d = info.diagram;
  return (
    <section className="a-card a-stack" aria-label="What's running underneath">
      <div className="a-host-head">
        <h2 className="a-h2">What's running underneath</h2>
      </div>
      <ol className="a-stack-flow">
        <li className="a-stack-node">
          <b>Phones · TV · Admin</b>
          <span>speakeasy.brianandkathi.com</span>
        </li>
        <li className="a-stack-arrow" aria-hidden>↓ HTTPS</li>
        <li className="a-stack-node">
          <b>Vercel</b>
          <span>{d.framework}{d.region ? ` · ${d.region}` : ""}</span>
        </li>
        <li className="a-stack-arrow" aria-hidden>↓ SQL</li>
        <li className="a-stack-node">
          <b>Neon Postgres{d.postgres ? ` ${d.postgres}` : ""}</b>
          <span>branch {d.neonBranch}</span>
        </li>
      </ol>
      <ul className="a-stack-side">
        <li>
          <b>Live updates</b> Vercel → Cloudflare relay (Durable Object) → TV and phones{d.relay ? "" : " · off here"}
        </li>
        <li>
          <b>Code</b> GitHub {d.repo} → Vercel builds each push
        </li>
        <li>
          <b>Domain</b> Network Solutions → Vercel
        </li>
      </ul>
    </section>
  );
}
