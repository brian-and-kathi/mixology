import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { isAdmin } from "@/lib/admin-guard";
import "../admin.css";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Admin", template: "%s · Admin" } };

/** Admin chrome: plain header with the accent bar, and tabs. Sign out lives in the Stock header only. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) redirect("/admin/login");
  return (
    <div className="admin-root">
      <header className="a-header">
        <Link href="/admin" className="a-brand">Admin</Link>
        <Link href="/menu" className="a-guest">View guest menu</Link>
      </header>
      <AdminNav />
      <main className="a-main">{children}</main>
    </div>
  );
}
