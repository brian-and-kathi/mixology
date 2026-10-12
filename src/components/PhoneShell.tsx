import Link from "next/link";
import type { ReactNode } from "react";
import { BAR_NAME } from "@/lib/brand";
import type { BarView } from "./BarWatch";
import { GuestChrome } from "./GuestChrome";

/** Phone page chrome: frame and menu button, pinned wordmark (or a back button that scrolls), and a title row with an optional glass icon. */
export function PhoneShell({
  title,
  titleBadge,
  mark,
  lead,
  back,
  pinBack = false,
  editHref,
  admin = false,
  bar,
  children,
}: {
  title?: string;
  /** Pour page: the spec badge, on its own line under the title (the title keeps the full width). */
  titleBadge?: ReactNode;
  /** Beside the title, such as the decanter seal on a pour or wine. */
  mark?: ReactNode;
  lead?: ReactNode;
  back?: { href: string; label: string };
  /** Keep the back link where it rests, beside the menu button, while the page scrolls (recipe page). */
  pinBack?: boolean;
  /** Only passed when this device has a valid admin session (checked server-side). */
  editHref?: string;
  /** Signed-in admin: the menu shows the database link. */
  admin?: boolean;
  /** Open/Closed status the page was rendered with (lib/bar-status guestGate). */
  bar?: BarView;
  children: ReactNode;
}) {
  return (
    <div className="phone">
      <GuestChrome editHref={editHref} admin={admin || !!editHref} bar={bar} />
      {back ? null : (
        // Pinned wordmark: sticky at exactly its resting position (the .phone top padding), so it never
        // moves or resizes; it sits in the solid part of the top band beside the fixed menu button.
        <div className="phone-top phone-pin">
          <p className="wordmark phone-wordmark">{BAR_NAME}</p>
        </div>
      )}
      {back && pinBack ? (
        // Pinned back link: sticky at exactly its resting position (like the wordmark), so it never moves; it
        // has to sit outside the header for sticky to hold for the whole page.
        <div className="phone-top phone-back-pin">
          <Link href={back.href} className="back">
            <span aria-hidden>‹</span> {back.label}
          </Link>
        </div>
      ) : null}
      {(back && !pinBack) || title ? (
        <header className="phone-header">
          {back && !pinBack ? (
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
              {mark}
            </div>
          ) : null}
        </header>
      ) : null}
      <main className="phone-body">{children}</main>
    </div>
  );
}
