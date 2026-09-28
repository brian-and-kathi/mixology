"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The one In/Out control for admin lists (Stock, Bottles → Spirits and Wines). A fixed-width switch at
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

/** A stock row: the toggle, then the rest of the row opens the bottle's edit page (no chevron). */
export function StockRow({ id, name, inStock, onToggle, children, error }: { id: string; name: string; inStock: boolean; onToggle: (to: boolean) => void; children?: ReactNode; error?: string }) {
  return (
    <li>
      <div className="a-srow">
        <StockToggle name={name} inStock={inStock} onToggle={onToggle} />
        <Link href={`/admin/bottles/${id}`} className="a-srow-link">
          <span className="a-srow-name">{name}{children}</span>
        </Link>
      </div>
      {error ? <p className="a-error a-row-error" role="alert">{error}</p> : null}
    </li>
  );
}
