import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { PinPad } from "@/components/admin/PinPad";
import { isAdmin } from "@/lib/admin-guard";
import { DEVICE_COOKIE, adminConfigured } from "@/lib/auth";
import { clientIp, lockedSeconds, throttleKeys } from "@/lib/pin-throttle";
import { safeAdminNext } from "@/lib/safe-next";
import "../admin.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; signedout?: string }> }) {
  const { next, signedout } = await searchParams;
  const target = safeAdminNext(next);
  if (await isAdmin()) redirect(target);
  const configured = adminConfigured();
  // Already locked out (IP or this device)? Show it on load instead of after the next try.
  let locked = 0;
  if (configured) {
    const [h, jar] = await Promise.all([headers(), cookies()]);
    locked = await lockedSeconds(throttleKeys(clientIp(h), jar.get(DEVICE_COOKIE)?.value ?? null)).catch(() => 0);
  }
  return (
    <div className="admin-root a-login">
      <header className="a-header"><span className="a-brand">Admin</span></header>
      <main className="a-main">
        {!configured ? (
          <div className="a-card">
            <h1 className="a-h1">Admin isn&apos;t configured</h1>
            <p className="a-quiet">No admin PIN is set on the server, so sign-in is turned off. Set ADMIN_PIN_HASH and redeploy.</p>
          </div>
        ) : (
          <PinPad next={target} initialLockedSeconds={locked} signedOut={Boolean(signedout)} />
        )}
      </main>
    </div>
  );
}
