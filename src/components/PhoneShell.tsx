import Link from "next/link";
import type { ReactNode } from "react";
import { BAR_NAME } from "@/lib/brand";
import { GuestChrome } from "./GuestChrome";

/** Phone page chrome: frame and menu button, pinned wordmark (or a back button that scrolls), and a title row with an optional glass icon. */
export function PhoneShell({
  title,
  titleBadge,
  lead,
  back,
  editHref,
  children,
}: {
  title?: string;
  /** Pour page: the spec badge, on its own line under the title (the title keeps the full width). */
  titleBadge?: ReactNode;
  lead?: ReactNode;
  back?: { href: string; label: string };
  /** Only passed when this device has a valid admin session (checked server-side). */
  editHref?: string;
  children: ReactNode;
}) {
  return (
    <div className="phone">
      <GuestChrome editHref={editHref} />
      {back ? null : (
        // Pinned wordmark: sticky at exactly its resting position (the .phone top padding), so it never
        // moves or resizes; it sits in the solid part of the top band beside the fixed menu button.
        <div className="phone-top phone-pin">
          <p className="wordmark phone-wordmark">{BAR_NAME}</p>
        </div>
      )}
      {back || title ? (
        <header className="phone-header">
          {back ? (
            // The top row leaves room on the right for the fixed menu button.
            <div className="phone-top">
              <Link href={back.href} className="back">
                <span aria-hidden>‹</span> {back.label}
              </Link>
            </div>
          ) : null}
          {title ? (
            <div className="phone-title">
              {lead}
              {titleBadge ? (
                <div className="phone-title-text">
                  <h1>{title}</h1>
                  {titleBadge}
                </div>
              ) : (
                <h1>{title}</h1>
              )}
            </div>
          ) : null}
        </header>
      ) : null}
      <main className="phone-body">{children}</main>
    </div>
  );
}
