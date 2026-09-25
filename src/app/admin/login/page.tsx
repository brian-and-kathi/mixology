import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-guard";
import { adminConfigured } from "@/lib/auth";
import { safeAdminNext } from "@/lib/safe-next";
import "../admin.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin sign in" };

const ERRORS: Record<string, string> = {
  wrong: "That password isn't right.",
  locked: "Too many tries. Wait 15 minutes and try again.",
  config: "Admin isn't set up yet.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; signedout?: string }> }) {
  const { next, error, signedout } = await searchParams;
  const target = safeAdminNext(next);
  if (await isAdmin()) redirect(target);
  const configured = adminConfigured();
  return (
    <div className="admin-root a-login">
      <header className="a-header"><span className="a-brand">Admin</span></header>
      <main className="a-main">
        {!configured ? (
          <div className="a-card">
            <h1 className="a-h1">Admin isn&apos;t configured</h1>
            <p className="a-quiet">No admin password is set on the server, so sign-in is turned off. Set ADMIN_PASSWORD and redeploy.</p>
          </div>
        ) : (
          <form method="post" action="/api/admin/login" className="a-card a-login-form">
            <h1 className="a-h1">Sign in</h1>
            <input type="hidden" name="next" value={target} />
            <label className="a-field">
              <span className="a-label">Password</span>
              <input type="password" name="password" autoComplete="current-password" required />
            </label>
            {error && ERRORS[error] ? <p className="a-error" role="alert">{ERRORS[error]}</p> : null}
            {signedout ? <p className="a-quiet a-small">Signed out.</p> : null}
            <button type="submit" className="a-btn a-btn-primary a-wide">Sign in</button>
            <p className="a-quiet a-small">This device stays signed in for about six months.</p>
          </form>
        )}
      </main>
    </div>
  );
}
