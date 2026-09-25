import Link from "next/link";
import type { ReactNode } from "react";
import { BAR_NAME } from "@/lib/brand";

/** Phone page chrome: wordmark (or a back button) and a title row with an optional glass icon. */
export function PhoneShell({
  title,
  lead,
  back,
  children,
}: {
  title?: string;
  lead?: ReactNode;
  back?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <div className="phone">
      <header className="phone-header">
        {back ? (
          <Link href={back.href} className="back">
            <span aria-hidden>‹</span> {back.label}
          </Link>
        ) : (
          <p className="wordmark phone-wordmark">{BAR_NAME}</p>
        )}
        {title ? (
          <div className="phone-title">
            {lead}
            <h1>{title}</h1>
          </div>
        ) : null}
      </header>
      <main className="phone-body">{children}</main>
    </div>
  );
}
