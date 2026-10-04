"use client";

import Link from "next/link";
import { KeyIcon } from "@/components/ReservedIcon";
import type { ReactNode } from "react";

/**
 * The one In/Out control for admin lists (Stock → Spirits and Wines). A fixed-width switch at
 * the left edge of the row, so names line up whatever the state: "In" is filled admin blue, "Out" is
 * outlined and muted. It sits beside the row's link, never inside it, so a tap flips stock in place
 * and never opens the bottle.
 */
export function StockToggle({ name, inStock, onToggle }: { name: string; inStock: boolean; onToggle: (to: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={inStock}
      aria-label={`${name} in stock`}
      className={inStock ? "a-stock-toggle is-in" : "a-stock-toggle"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle(!inStock);
      }}
    >
      {inStock ? "In" : "Out"}
    </button>
  );
}

/** A stock row: the toggle, then the rest of the row opens the bottle's edit page (no chevron). `sub` is a quiet second line (Stock: the type). `featured` adds a small non-interactive star by the name (migration 030). */
export function StockRow({ id, name, inStock, onToggle, children, error, sub, featured = false, reserved = false, reservedNote = null }: { id: string; name: string; inStock: boolean; onToggle: (to: boolean) => void; children?: ReactNode; error?: string; sub?: string | null; featured?: boolean; reserved?: boolean; reservedNote?: string | null }) {
  const star = featured ? <span className="a-feat-star" title="Featured" aria-label="Featured">★</span> : null;
  // Reserved (migration 032): the skeleton key and the occasion ("Kathi's 50th"; "Reserved" without one) in the grey
  // line under the name. The In/Out toggle is untouched.
  const res = reserved ? <span className="a-srow-res">{sub ? " · " : null}<KeyIcon label="Reserved" />{reservedNote || "Reserved"}</span> : null;
  return (
    <li>
      <div className="a-srow">
        <StockToggle name={name} inStock={inStock} onToggle={onToggle} />
        <Link href={`/admin/bottles/${id}`} className="a-srow-link">
          {sub || res ? (
            <span className="a-srow-text">
              <span className="a-srow-name">{name}{star}{children}</span>
              <span className="a-srow-sub">{sub}{res}</span>
            </span>
          ) : (
            <span className="a-srow-name">{name}{star}{children}</span>
          )}
        </Link>
      </div>
      {error ? <p className="a-error a-row-error" role="alert">{error}</p> : null}
    </li>
  );
}
