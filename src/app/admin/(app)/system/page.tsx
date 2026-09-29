import { GitCard } from "@/components/admin/GitCard";
import { HostCard } from "@/components/admin/HostCard";
import { StackCard } from "@/components/admin/StackCard";
import { StackFacts } from "@/components/admin/StackFacts";
import { loadCloudflarePanel } from "@/lib/cloudflare-usage";
import { loadDeployInfo } from "@/lib/deploy-info";
import { loadNeonPanel, loadVercelPanel } from "@/lib/host-usage";
import { loadStackInfo } from "@/lib/stack-info";

export const metadata = { title: "System" };

/** Not bar-night: what's running underneath (stack, repo, hosts), what's deployed, and the hosts' usage. */
export default async function SystemPage() {
  const [stack, deploy, neon, vercel, cloudflare] = await Promise.all([
    loadStackInfo(),
    loadDeployInfo(),
    loadNeonPanel(),
    loadVercelPanel(),
    loadCloudflarePanel(),
  ]);
  return (
    <div className="a-establish">
      <StackCard info={stack} />
      <GitCard info={deploy} github={stack.github} />
      <HostCard panel={vercel} facts={stack.vercel} />
      <HostCard panel={neon} facts={stack.neon} />
      <HostCard panel={cloudflare} facts={stack.cloudflare} />
      <section className="a-card" aria-label="Network Solutions">
        <div className="a-host-head">
          <h2 className="a-h2">Network Solutions</h2>
        </div>
        <StackFacts facts={stack.registrar} />
      </section>
    </div>
  );
}
