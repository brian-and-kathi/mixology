"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Stock" },
  { href: "/admin/recipes", label: "Recipes" },
  { href: "/admin/ingredients", label: "Specs" },
  { href: "/admin/establishment", label: "Bar" },
  { href: "/admin/system", label: "System" },
];

/** Bottom tab bar on phones, top bar on laptops. Hidden on add/edit pages (they have ‹ Back). */
export function AdminNav() {
  const path = usePathname() ?? "/admin";
  if (path.split("/").filter(Boolean).length > 2) return null;
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));
  return (
    <nav className="a-tabs" aria-label="Admin sections">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={active(t.href) ? "a-tab active" : "a-tab"} aria-current={active(t.href) ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
