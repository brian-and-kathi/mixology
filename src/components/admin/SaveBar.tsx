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

/** Sticky bottom Save bar, disabled until something changed. */
export function SaveBar({ dirty, saving, error, label = "Save", children }: { dirty: boolean; saving: boolean; error?: string | null; label?: string; children?: React.ReactNode }) {
  return (
    <div className="a-savebar">
      {error ? <p className="a-error" role="alert">{error}</p> : null}
      <div className="a-savebar-row">
        {children}
        <button type="submit" className="a-btn a-btn-primary" disabled={!dirty || saving}>
          {saving ? "Saving…" : dirty ? label : "Saved"}
        </button>
      </div>
    </div>
  );
}
