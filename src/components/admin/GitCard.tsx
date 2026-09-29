import { StackFacts } from "@/components/admin/StackFacts";
import type { DeployInfo } from "@/lib/deploy-info";
import type { Facts } from "@/lib/stack-info";

const WHEN = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const et = (iso: string) => `${WHEN.format(new Date(iso))} ET`;

/** Read-only: the commit this server runs, when it went out, production's rollback commit, then the repo it came from. */
export function GitCard({ info, github = null }: { info: DeployInfo; github?: Facts | null }) {
  return (
    <section className="a-card a-git" aria-label="GitHub">
      <div className="a-host-head">
        <h2 className="a-h2">GitHub</h2>
      </div>
      {github?.purpose ? <p className="a-purpose">{github.purpose}</p> : null}
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
      {github ? <StackFacts facts={{ ...github, purpose: null }} heading="Source" /> : null}
    </section>
  );
}
