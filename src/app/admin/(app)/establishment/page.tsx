import { Glance } from "@/components/admin/Glance";
import { HostCard } from "@/components/admin/HostCard";
import { Tonight } from "@/components/admin/Tonight";
import { loadGlance } from "@/lib/admin-data";
import { loadCloudflarePanel } from "@/lib/cloudflare-usage";
import { loadNeonPanel, loadVercelPanel } from "@/lib/host-usage";
import { tonight } from "@/lib/night";
import { commitRef } from "@/lib/version";

export const metadata = { title: "Establishment" };

export default async function EstablishmentPage() {
  const night = await tonight();
  const [glance, neon, vercel, cloudflare] = await Promise.all([
    loadGlance(),
    loadNeonPanel(),
    loadVercelPanel(),
    loadCloudflarePanel(),
  ]);
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
      <HostCard panel={cloudflare} />
    </div>
  );
}
