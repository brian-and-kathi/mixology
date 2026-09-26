import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminMenu } from "@/components/admin/AdminMenu";
import { AdminNav } from "@/components/admin/AdminNav";
import { isAdmin } from "@/lib/admin-guard";
import "../admin.css";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Admin", template: "%s · Admin" } };

/** Admin chrome: header with the menu, and tabs. Sign out, Clear TV, and Guest menu live in the menu. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) redirect("/admin/login");
  return (
    <div className="admin-root">
      <header className="a-header">
        <Link href="/admin" className="a-brand">Admin</Link>
        <AdminMenu />
      </header>
      <AdminNav />
      <main className="a-main">{children}</main>
    </div>
  );
}
