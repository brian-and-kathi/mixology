"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Warn before leaving a form with unsaved edits (tab close / reload). */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}

/** "‹ Back" link that asks before discarding unsaved edits. */
export function BackLink({ href, label, dirty }: { href: string; label: string; dirty: boolean }) {
  return (
    <Link
      href={href}
      className="a-back"
      onClick={(e) => {
        if (dirty && !confirm("Discard your changes?")) e.preventDefault();
      }}
    >
      <span aria-hidden>‹</span> {label}
    </Link>
  );
}

/**
 * Sticky bottom Save bar. One state rule for every form:
 * - new item: the button reads e.g. "Add bottle" and is enabled once the required fields are set;
 * - edits pending: cream primary "Save changes";
 * - "Saved" only right after a real save with nothing pending; otherwise a gray, disabled "Save changes".
 */
export function SaveBar({ isNew = false, dirty, ready = true, saving, saved = false, error, newLabel = "Add", children }: {
  isNew?: boolean; dirty: boolean; ready?: boolean; saving: boolean; saved?: boolean; error?: string | null; newLabel?: string; children?: React.ReactNode;
}) {
  const label = saving ? "Saving…" : isNew ? newLabel : dirty ? "Save changes" : saved ? "Saved" : "Save changes";
  const enabled = !saving && ready && (isNew || dirty);
  return (
    <div className="a-savebar">
      {error ? <p className="a-error" role="alert">{error}</p> : null}
      <div className="a-savebar-row">
        {children}
        <button type="submit" className={saved && !dirty && !isNew ? "a-btn a-btn-primary is-saved" : "a-btn a-btn-primary"} disabled={!enabled}>
          {label}
        </button>
      </div>
    </div>
  );
}
