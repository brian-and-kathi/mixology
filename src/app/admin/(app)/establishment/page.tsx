import { Glance } from "@/components/admin/Glance";
import { Tonight } from "@/components/admin/Tonight";
import { loadGlance } from "@/lib/admin-data";
import { loadNeonPanel, loadVercelPanel, type HostPanel } from "@/lib/host-usage";
import { tonight } from "@/lib/night";
import { commitRef } from "@/lib/version";

export const metadata = { title: "Establishment" };

export default async function EstablishmentPage() {
  const night = tonight();
  const [glance, neon, vercel] = await Promise.all([loadGlance(), loadNeonPanel(), loadVercelPanel()]);
  const commit = commitRef();
  return (
    <div className="a-establish">
      {night ? <Tonight night={night} /> : <p className="a-card a-quiet">Tonight&apos;s code needs a signing secret on the server.</p>}
      <Glance data={glance} />
      <section className="a-card a-git" aria-label="Git">
        <h2 className="a-h2">Git</h2>
        <p className="a-git-short" title={commit.full || undefined}>{commit.short}</p>
        {commit.full ? <p className="a-git-full">{commit.full}</p> : null}
      </section>
      <HostCard panel={neon} />
      <HostCard panel={vercel} />
    </div>
  );
}

function HostCard({ panel }: { panel: HostPanel }) {
  return (
    <section className="a-card a-host" aria-label={panel.title}>
      <div className="a-host-head">
        <h2 className="a-h2">{panel.title}</h2>
        {panel.detail ? <p className="a-quiet">{panel.detail}</p> : null}
      </div>
      <ul className="a-meters">
        {panel.meters.map((meter) => (
          <li key={meter.label}>
            <div className="a-meter-top">
              <span>{meter.label}</span>
              <span>{meter.limit ? `${meter.used} / ${meter.limit}` : meter.used}</span>
            </div>
            {meter.ratio != null ? (
              <div className="a-meter-bar" aria-hidden>
                <span style={{ width: `${Math.max(2, meter.ratio * 100)}%` }} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {panel.note ? <p className="a-quiet a-host-note">{panel.note}</p> : null}
    </section>
  );
}
