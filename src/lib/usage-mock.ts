import { panel, type CloudflareUsage } from "@/lib/cloudflare-usage";
import { vercelHobbyPanel, vercelPanel, type Charge, type HostPanel } from "@/lib/host-usage";

/**
 * Made-up readings for local screenshots of the amber (80%) and red (100%) bars.
 * Reached only from `USAGE_MOCK=1 next dev`; production builds never import this file.
 */
const LABEL = "Mock values (USAGE_MOCK=1, local dev only). Amber from 80%, red at 100%.";

export function mockCloudflarePanel(): HostPanel {
  const usage: CloudflareUsage = {
    workerRequests: 84_200,
    relayRequests: 80_900,
    scripts: 3,
    doRequests: 91_500,
    doGbSeconds: 2_140,
    rowsRead: 1_260_000,
    rowsWritten: 100_000,
    sqlBytes: 31 * 1024 * 1024,
    kvReads: 12_400,
    kvWrites: 1_000,
    kvDeletes: 3,
    kvLists: 820,
    kvBytes: 700 * 1024,
  };
  const p = panel(usage, LABEL);
  return { ...p, title: `${p.title} · MOCK` };
}

export function mockVercelPanel(): HostPanel {
  const row = (ServiceName: string, ConsumedQuantity: number): Charge => ({ ChargeCategory: "Usage", ServiceName, ConsumedQuantity });
  const p = vercelPanel(
    [
      row("Fast data transfer", 23.5e9),
      row("Function invocations", 830_000),
      row("Active CPU", 1.6 * 3600),
      row("Provisioned memory", 118),
      row("Fast origin transfer", 10.4e9),
    ],
    LABEL,
  );
  return { ...p, title: `${p.title} · MOCK` };
}

/** `USAGE_MOCK=vercel-hobby`: what the card draws when the charges API answers 404 (Hobby, no subscription). */
export function mockVercelHobbyPanel(): HostPanel {
  return vercelHobbyPanel();
}
