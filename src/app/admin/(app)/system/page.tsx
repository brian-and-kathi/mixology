import { GitCard } from "@/components/admin/GitCard";
import { Glance } from "@/components/admin/Glance";
import { HostCard } from "@/components/admin/HostCard";
import { loadGlance } from "@/lib/admin-data";
import { loadCloudflarePanel } from "@/lib/cloudflare-usage";
import { loadDeployInfo } from "@/lib/deploy-info";
import { loadNeonPanel, loadVercelPanel } from "@/lib/host-usage";

export const metadata = { title: "System" };

function where(): string {
  const env = process.env.VERCEL_ENV;
  if (env === "production") return "Production";
  if (env === "preview") return process.env.VERCEL_GIT_COMMIT_REF ? `Preview · ${process.env.VERCEL_GIT_COMMIT_REF}` : "Preview";
  return "Local";
}

/** Not bar-night: what's deployed, the hosts' usage, and the glance (moved from Establishment). */
export default async function SystemPage() {
  const [deploy, neon, vercel, cloudflare, glance] = await Promise.all([
    loadDeployInfo(),
    loadNeonPanel(),
    loadVercelPanel(),
    loadCloudflarePanel(),
    loadGlance(),
  ]);
  return (
    <div className="a-establish">
      <GitCard info={deploy} where={where()} />
      <HostCard panel={neon} />
      <HostCard panel={vercel} />
      <HostCard panel={cloudflare} />
      <Glance data={glance} />
    </div>
  );
}
