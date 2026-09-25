import Link from "next/link";
import type { ReactNode } from "react";
import { BAR_NAME } from "@/lib/brand";
import { GuestChrome } from "./GuestChrome";

/** Phone page chrome: frame and menu button, wordmark (or a back button), and a title row with an optional glass icon. */
export function PhoneShell({
  title,
  lead,
  back,
  editHref,
  children,
}: {
  title?: string;
  lead?: ReactNode;
  back?: { href: string; label: string };
  /** Only passed when this device has a valid admin session (checked server-side). */
  editHref?: string;
  children: ReactNode;
}) {
  return (
    <div className="phone">
      <GuestChrome editHref={editHref} />
      <header className="phone-header">
        {/* The top row leaves room on the right for the fixed menu button. */}
        <div className="phone-top">
          {back ? (
            <Link href={back.href} className="back">
              <span aria-hidden>‹</span> {back.label}
            </Link>
          ) : (
            <p className="wordmark phone-wordmark">{BAR_NAME}</p>
          )}
        </div>
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
