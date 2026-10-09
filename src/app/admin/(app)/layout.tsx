import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminMenu } from "@/components/admin/AdminMenu";
import { AdminNav } from "@/components/admin/AdminNav";
import { BarSwitchProvider } from "@/components/admin/BarSwitch";
import { isAdmin } from "@/lib/admin-guard";
import { adminStatus, barStatus } from "@/lib/bar-status";
import "../admin.css";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Admin", template: "%s · Admin" } };

/** Admin chrome: header with the menu, and tabs. TV, Guest, Admin, and Database lead the menu; Clear TV and sign out follow. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { open, openUntil, openedAt, closedSince } = adminStatus(await barStatus());
  return (
    <div className="admin-root">
      {/* One Open/Closed state for the page: the ☰ menu and the Bar tab switch share it. */}
      <BarSwitchProvider initial={{ open, openUntil, openedAt, closedSince }}>
        <header className="a-header">
          <Link href="/admin" className="a-brand">Admin</Link>
          <AdminMenu />
        </header>
        <AdminNav />
        <main className="a-main">{children}</main>
      </BarSwitchProvider>
    </div>
  );
}
