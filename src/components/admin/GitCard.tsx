import type { DeployInfo } from "@/lib/deploy-info";

const WHEN = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const et = (iso: string) => `${WHEN.format(new Date(iso))} ET`;

/** Read-only: the commit this server runs, when it went out, and production's rollback commit. */
export function GitCard({ info, where }: { info: DeployInfo; where: string }) {
  return (
    <section className="a-card a-git" aria-label="Git">
      <div className="a-host-head">
        <h2 className="a-h2">Git</h2>
        <p className="a-quiet">{where}</p>
      </div>
      <dl className="a-git-rows">
        <div>
          <dt>Commit</dt>
          <dd><code title={info.full || undefined}>{info.short}</code></dd>
        </div>
        {info.message ? <p className="a-git-msg">{info.message}</p> : null}
        {info.when ? (
          <div>
            <dt>{info.when.label}</dt>
            <dd>{et(info.when.iso)}</dd>
          </div>
        ) : null}
        {info.rollback ? (
          <div>
            <dt>Rollback</dt>
            <dd className="a-git-rb">
              <code>{info.rollback.short}</code>
              {info.rollback.message ? <span title={info.rollback.message}> · {info.rollback.message}</span> : null}
            </dd>
          </div>
        ) : null}
      </dl>
      {info.rollbackNote ? <p className="a-quiet a-host-note">{info.rollbackNote}</p> : null}
    </section>
  );
}
