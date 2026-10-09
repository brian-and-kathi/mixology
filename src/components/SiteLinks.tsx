"use client";

import Link from "next/link";
import { SITE_LINKS } from "@/lib/site-links";

/** Top section of a hamburger menu. The same four links, on every screen that has one. */
export function SiteLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {SITE_LINKS.map((link) => (
        <Link key={link.href} href={link.href} onClick={onNavigate}>{link.label}</Link>
      ))}
    </>
  );
}
